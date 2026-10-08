import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function readFixture(name: string): unknown {
  return JSON.parse(fs.readFileSync(path.join(root, 'tests/fixtures/clarivate', name), 'utf8'));
}

function jsonResponse(status: number, body: unknown, headers: Record<string, string> = {}) {
  const normalized = Object.fromEntries(Object.entries(headers).map(([key, value]) => [key.toLowerCase(), value]));
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (name: string) => normalized[name.toLowerCase()] ?? null },
    async json() {
      return body;
    },
  };
}

console.log('\n[Clarivate] HTTP client, claim guard, and metrics store...');

{
  const {
    CLARIVATE_TRANSPORT_BACKOFF_MS,
    createClarivateWosJournalsClient,
    createRateLimiter,
    parseWosJournalProfile,
    resetClarivateKeyWarning,
    retryAfterMs,
  } = await import('../src/utils/clarivateHttp.ts');
  const { createIssnLookup, lookupMetricsByIssn } = await import('../src/utils/metricSources.ts');
  const searchBody = readFixture('nature-search.json');
  const journalBody = readFixture('nature-journal.json');
  const reportBody = readFixture('nature-report-2025.json');

  assert.strictEqual(retryAfterMs('2', 0), 2000);
  assert.strictEqual(retryAfterMs('0', 0), 0);
  const future = Date.now() + 5000;
  const waited = retryAfterMs(new Date(future).toUTCString(), Date.now());
  assert(waited != null && waited >= 0 && waited <= 6000);

  resetClarivateKeyWarning();
  const missingLogs: string[] = [];
  let fetched = 0;
  const unwired = createClarivateWosJournalsClient({
    apiKey: null,
    log: (message) => missingLogs.push(message),
    fetchImpl: async () => {
      fetched += 1;
      return jsonResponse(200, searchBody);
    },
  });
  assert.strictEqual(await unwired.searchByIssn('0028-0836'), null);
  assert.strictEqual(await unwired.getJournal('NATURE'), null);
  assert.strictEqual(fetched, 0);
  assert.strictEqual(missingLogs.length, 1);
  assert(missingLogs[0].includes('CLARIVATE_API_KEY is not set'));
  assert(!missingLogs[0].includes('super-secret'));

  const secret = 'super-secret-key';
  const seenUrls: string[] = [];
  const logs: string[] = [];
  let attempts = 0;
  const clock = { now: 0 };
  const sleeps: number[] = [];
  const limited = createClarivateWosJournalsClient({
    apiKey: secret,
    minIntervalMs: 0,
    random: () => 0,
    now: () => clock.now,
    sleep: async (ms) => {
      sleeps.push(ms);
      clock.now += ms;
    },
    log: (message) => logs.push(message),
    fetchImpl: async (url) => {
      attempts += 1;
      seenUrls.push(url);
      if (attempts === 1) return jsonResponse(429, { message: secret }, { 'retry-after': '2' });
      if (attempts === 2) return jsonResponse(503, {});
      if (url.includes('/reports/')) return jsonResponse(200, reportBody);
      if (url.includes('/journals/NATURE')) return jsonResponse(200, journalBody);
      return jsonResponse(200, searchBody);
    },
  });
  const search = await limited.searchByIssn('0028-0836');
  assert.deepStrictEqual(search, { hits: [{ id: 'NATURE' }] });
  assert.deepStrictEqual(sleeps.slice(0, 2), [2000, 800]);
  assert(seenUrls.every((url) => !url.includes(secret)));
  assert(logs.every((line) => !line.includes(secret)));

  const parsed = await lookupMetricsByIssn('0028-0836', limited, new Date('2026-10-08T00:00:00.000Z'));
  assert(parsed);
  assert.strictEqual(parsed.impactFactor, 56.1);
  assert.strictEqual(parsed.fiveYearImpactFactor, 60.2);
  assert.strictEqual(parsed.jcrYear, 2025);
  assert.strictEqual(parsed.issn, '0028-0836');
  assert.strictEqual(parsed.eIssn, '1476-4687');
  assert.strictEqual(parsed.publisher, 'NATURE PORTFOLIO');
  assert(parsed.primaryDiscipline?.includes('MULTIDISCIPLINARY SCIENCES'), parsed.primaryDiscipline);
  assert.strictEqual(parsed.journalName, 'Nature');
  assert.notStrictEqual(parsed.journalName, 'NATURE');
  assert.deepStrictEqual(parsed.indexing, ['SCIE']);
  assert.strictEqual(parsed.jifRanks?.[0]?.jifPercentile, 99.6);
  assert.strictEqual(parsed.jcrQuartile, 'Q1');
  assert.strictEqual(parsed.provenanceSource, 'clarivate_wos_journals_api');
  assert.strictEqual(parsed.sourceAttribution, 'JIF 56.1 (Clarivate JCR 2025), retrieved 2026-10-08T00:00:00.000Z');

  const stringProfile = parseWosJournalProfile({
    name: 'NATURE',
    isoTitle: 'Nature',
    publisher: 'NATURE PORTFOLIO',
    categories: ['MULTIDISCIPLINARY SCIENCES'],
    journalCitationReports: [{ year: 2025 }],
  });
  assert.strictEqual(stringProfile?.publisher, 'NATURE PORTFOLIO');
  assert.deepStrictEqual(stringProfile?.categories, ['MULTIDISCIPLINARY SCIENCES']);
  assert.strictEqual(stringProfile?.title, 'Nature');

  const isoOnly = parseWosJournalProfile({ name: 'NATURE', isoTitle: 'Nature (ISO)' });
  assert.strictEqual(isoOnly?.title, 'Nature (ISO)');

  const missingJif = createClarivateWosJournalsClient({
    apiKey: secret,
    minIntervalMs: 0,
    fetchImpl: async (url) => {
      if (url.includes('/reports/')) {
        return jsonResponse(200, { metrics: { impactMetrics: {} }, ranks: {} });
      }
      if (url.includes('/journals/NATURE')) return jsonResponse(200, journalBody);
      return jsonResponse(200, searchBody);
    },
  });
  assert.strictEqual(await lookupMetricsByIssn('0028-0836', missingJif), null);

  let clock2 = 0;
  const gaps: number[] = [];
  const limiter = createRateLimiter({
    minIntervalMs: 500,
    now: () => clock2,
    sleep: async (ms) => {
      clock2 += ms;
    },
  });
  await Promise.all([0, 1, 2].map(() => limiter.schedule(async () => gaps.push(clock2))));
  assert.deepStrictEqual(gaps, [0, 500, 1000]);

  let longWait = 0;
  const gaveUp = createClarivateWosJournalsClient({
    apiKey: secret,
    minIntervalMs: 0,
    random: () => 0,
    now: () => 0,
    sleep: async (ms) => {
      longWait += ms;
    },
    fetchImpl: async () => jsonResponse(429, {}, { 'retry-after': '120' }),
  });
  assert.strictEqual(await gaveUp.searchByIssn('0028-0836'), null);
  assert.strictEqual(longWait, 0);

  let backoffClock = 1_000;
  let backoffFetches = 0;
  const paused = createClarivateWosJournalsClient({
    apiKey: secret,
    minIntervalMs: 0,
    maxAttempts: 1,
    random: () => 0,
    now: () => backoffClock,
    sleep: async (ms) => {
      backoffClock += ms;
    },
    fetchImpl: async () => {
      backoffFetches += 1;
      return jsonResponse(401, {});
    },
  });
  assert.strictEqual(await paused.searchByIssn('0028-0836'), null);
  assert.strictEqual(await paused.getJournal('NATURE'), null);
  assert.strictEqual(backoffFetches, 1);
  backoffClock += CLARIVATE_TRANSPORT_BACKOFF_MS;
  assert.strictEqual(await paused.searchByIssn('0028-0836'), null);
  assert.strictEqual(backoffFetches, 2);

  let limitedFetches = 0;
  let limitClock = 0;
  const rateLimited = createClarivateWosJournalsClient({
    apiKey: secret,
    minIntervalMs: 0,
    maxAttempts: 2,
    random: () => 0,
    now: () => limitClock,
    sleep: async (ms) => {
      limitClock += ms;
    },
    fetchImpl: async () => {
      limitedFetches += 1;
      return jsonResponse(503, {});
    },
  });
  assert.strictEqual(await rateLimited.searchByIssn('0028-0836'), null);
  assert.strictEqual(limitedFetches, 2);
  assert.strictEqual(await rateLimited.searchByIssn('1476-4687'), null);
  assert.strictEqual(limitedFetches, 2);

  let missed = 0;
  const notFoundClient = createClarivateWosJournalsClient({
    apiKey: secret,
    minIntervalMs: 0,
    maxAttempts: 1,
    now: () => 0,
    sleep: async () => undefined,
    fetchImpl: async () => {
      missed += 1;
      return jsonResponse(404, {});
    },
  });
  assert.strictEqual(await notFoundClient.searchByIssn('0000-0000'), null);
  assert.strictEqual(await notFoundClient.searchByIssn('0000-0001'), null);
  assert.strictEqual(missed, 2);

  let recoveredFetches = 0;
  const recovered = createClarivateWosJournalsClient({
    apiKey: secret,
    minIntervalMs: 0,
    maxAttempts: 3,
    random: () => 0,
    now: () => 0,
    sleep: async () => undefined,
    fetchImpl: async () => {
      recoveredFetches += 1;
      if (recoveredFetches === 1) return jsonResponse(429, {}, { 'retry-after': '1' });
      return jsonResponse(200, searchBody);
    },
  });
  assert.deepStrictEqual(await recovered.searchByIssn('0028-0836'), { hits: [{ id: 'NATURE' }] });
  assert.deepStrictEqual(await recovered.searchByIssn('0028-0836'), { hits: [{ id: 'NATURE' }] });
  assert.strictEqual(recoveredFetches, 3);

  let searches = 0;
  const sharedClient = {
    async searchByIssn() {
      searches += 1;
      await new Promise((resolve) => setTimeout(resolve, 15));
      return { hits: [{ id: 'NATURE' }] };
    },
    async getJournal(id: string) {
      return parseWosJournalProfile(journalBody, id);
    },
    async getYearReport() {
      return reportBody as { metrics: { impactMetrics: { jif: string } } };
    },
  };
  const session = createIssnLookup(sharedClient);
  const [first, second] = await Promise.all([session.lookup('00280836'), session.lookup('0028-0836')]);
  assert.strictEqual(searches, 1);
  assert.strictEqual(first?.wosJournalId, 'NATURE');
  assert.strictEqual(second?.impactFactor, 56.1);

  let misses = 0;
  let negativeClock = 10_000;
  const negative = createIssnLookup(
    {
      async searchByIssn() {
        misses += 1;
        return { hits: [] };
      },
      async getJournal() {
        return null;
      },
      async getYearReport() {
        return null;
      },
    },
    { negativeTtlMs: 5_000, now: () => negativeClock }
  );
  assert.strictEqual(await negative.lookup('1234-5678'), null);
  assert.strictEqual(await negative.lookup('1234-5678'), null);
  assert.strictEqual(misses, 1);
  negativeClock += 5_001;
  assert.strictEqual(await negative.lookup('1234-5678'), null);
  assert.strictEqual(misses, 2);
}

{
  const { JOURNAL_CATALOG } = await import('../src/data/journalCatalog.ts');
  const {
    formatJifClaim,
    guardAdCopy,
    guardMetricClaims,
    sanitizeUserProvidedFacts,
  } = await import('../src/utils/metricClaims.ts');
  const {
    clarivateAdminRefreshEnabled,
    displayJournalName,
    displayPublisher,
    generateDeterministicCampaign,
    mergeClarivateOverLanding,
    resolveJournalIssn,
    toDisplayCase,
    withAdIdentity,
  } = await import('../server.ts');
  const { generateGoogleAdsEditorCsv } = await import('../src/utils/csvExporter.ts');
  const nature = JOURNAL_CATALOG.find((entry) => entry.journalName === 'Nature');
  assert(nature);

  const apc = guardMetricClaims('APC $2,690', nature);
  assert.notStrictEqual(apc.text, 'APC,690');
  assert(!apc.text.includes('690'));
  assert(!apc.text.includes('2,690'));

  const whole = guardMetricClaims('JIF 50', nature);
  assert(!whole.text.includes('50'));
  const rank = guardMetricClaims('#1 of 140 / top 1%', nature);
  assert(!rank.text.includes('#1'));
  assert(!rank.text.includes('140'));
  assert(!rank.text.includes('1%'));

  const wide = guardMetricClaims('JIF ５０', nature);
  assert(!wide.text.includes('50'));
  assert(!wide.text.includes('５'));

  assert.strictEqual(guardMetricClaims('Version 2.0', nature).text, 'Version 2.0');
  assert.strictEqual(guardMetricClaims('7 days a week', nature).text, '7 days a week');
  assert.strictEqual(guardMetricClaims('If 3 authors', nature).text, 'If 3 authors');
  const otherMetrics = guardMetricClaims('CiteScore 12.3 and h-index 300', nature);
  assert(!otherMetrics.text.includes('12.3'));
  assert(!otherMetrics.text.includes('300'));
  assert(otherMetrics.flags.some((flag) => flag.includes('CiteScore')));

  const trustedUser = sanitizeUserProvidedFacts({
    ...nature,
    impactFactor: 6.9,
    jcrYear: 2025,
    provenanceSource: 'clarivate_wos_journals_api' as const,
    isVerifiedClarivate: true,
    verificationStatus: 'clarivate_api' as const,
    sourceAttribution: 'JIF 50.5 (Clarivate JCR 2024)',
  });
  assert.strictEqual(trustedUser.provenanceSource, 'user_provided');
  assert.strictEqual(trustedUser.isVerifiedClarivate, false);
  assert.strictEqual(trustedUser.verificationStatus, 'user_provided');
  assert(!/clarivate/i.test(trustedUser.sourceAttribution || ''));
  assert.strictEqual(formatJifClaim(trustedUser), 'JIF 6.9');
  assert(!/clarivate/i.test(guardMetricClaims('JIF 6.9 (Clarivate JCR 2025)', trustedUser).text));

  const fromApi = {
    ...nature,
    impactFactor: 56.1,
    fiveYearImpactFactor: 60.2,
    jcrQuartile: 'Q1',
    verificationStatus: 'clarivate_api' as const,
    provenanceSource: 'clarivate_wos_journals_api' as const,
    isVerifiedClarivate: true,
    jcrYear: 2025,
    retrievedAt: '2026-10-08T00:00:00.000Z',
    jifRanks: [{ category: 'Multidisciplinary Sciences', rank: '1/140', quartile: 'Q1', jifPercentile: '99.64' }],
    sourceAttribution: 'JIF 56.1 (Clarivate JCR 2025)',
  };
  const kept = guardMetricClaims('JIF 56.1 (Clarivate JCR 2025). #1 of 140 / top 1%.', fromApi);
  assert(kept.text.includes('JIF 56.1 (Clarivate JCR 2025)'));
  assert(kept.text.includes('#1 of 140'));
  assert(kept.text.includes('top 1%'));
  assert.strictEqual(formatJifClaim(fromApi), 'JIF 56.1 (Clarivate JCR 2025)');

  const guarded = guardAdCopy(
    {
      searchAds: {
        headlines: [{ text: 'Safe headline' }],
        descriptions: [],
        callouts: [],
        sitelinks: [{ title: 'JIF 50 today', desc: 'Version 2.0 guide' }],
      },
      keywords: {
        englishSearchKeywords: [{ keyword: 'JIF 50' }, { keyword: 'nature scope' }],
        chineseAuthorKeywords: [{ keywordZh: '影响因子50' }],
      },
    },
    nature
  );
  assert.deepStrictEqual(guarded.searchAds?.sitelinks, [{ title: 'today', desc: 'Version 2.0 guide' }]);
  assert.deepStrictEqual(
    guarded.keywords?.englishSearchKeywords?.map((item) => item.keyword),
    ['nature scope']
  );
  assert.deepStrictEqual(guarded.keywords?.chineseAuthorKeywords, []);

  const campaign = generateDeterministicCampaign(fromApi, 'CON', 'EN');
  const copy = JSON.stringify(campaign.searchAds) + JSON.stringify(campaign.displayAds);
  assert(copy.includes('JIF 56.1 (Clarivate JCR 2025)'));
  const csv = generateGoogleAdsEditorCsv({
    funnelStage: 'CON',
    clarivateFacts: fromApi,
    funnelStrategyNote: 'Consideration',
    primaryCta: 'Check journal fit',
    recommendedDestination: { label: 'Aims', url: 'https://www.nature.com/aims-and-scope', description: 'Aims' },
    generationSource: 'template_fallback',
    searchAds: campaign.searchAds,
    keywords: campaign.keywords,
  });
  assert(csv.includes('JIF 56.1 (Clarivate JCR 2025)'));

  const merged = mergeClarivateOverLanding(nature, {
    journalName: 'NATURE',
    wosName: 'NATURE',
    publisher: '',
    impactFactor: 56.1,
    verificationStatus: 'clarivate_api',
    provenanceSource: 'clarivate_wos_journals_api',
    isVerifiedClarivate: true,
    jcrYear: 2025,
    issn: '0028-0836',
    primaryDiscipline: '',
    indexing: [],
    sourceAttribution: 'JIF 56.1 (Clarivate JCR 2025)',
  });
  assert.strictEqual(merged.journalName, 'Nature');
  assert.strictEqual(merged.publisher, 'Nature Portfolio');
  assert.strictEqual(merged.impactFactor, 56.1);
  assert.strictEqual(merged.primaryDiscipline, nature.primaryDiscipline);
  assert.strictEqual(merged.aimsAndScopeSummary, nature.aimsAndScopeSummary);

  const titled = mergeClarivateOverLanding(
    { ...nature, journalName: 'Landing Title' },
    {
      journalName: 'NATURE',
      wosName: 'NATURE',
      jcrTitle: 'Nature',
      isoTitle: 'Nat.',
      publisher: 'NATURE PORTFOLIO',
      impactFactor: 56.1,
      verificationStatus: 'clarivate_api',
      provenanceSource: 'clarivate_wos_journals_api',
      isVerifiedClarivate: true,
      jcrYear: 2025,
      sourceAttribution: 'JIF 56.1 (Clarivate JCR 2025)',
    }
  );
  assert.strictEqual(titled.journalName, 'Nature');
  assert.strictEqual(titled.publisher, 'Nature Portfolio');
  assert.strictEqual(displayJournalName({ isoTitle: 'Nature', journalName: 'NATURE' }, 'Landing Title'), 'Nature');

  const shouty = generateDeterministicCampaign(
    { ...nature, journalName: 'NATURE', publisher: 'Unknown publisher' },
    'CON',
    'EN'
  );
  const shoutyText = JSON.stringify(shouty);
  assert(!shoutyText.includes('Evaluate NATURE'));
  assert(!shoutyText.includes('Unknown publisher'));
  assert(shoutyText.includes('Evaluate Nature'));

  assert.strictEqual(displayPublisher('NATURE PORTFOLIO', 'NATURE PORTFOLIO'), 'Nature Portfolio');
  assert.strictEqual(withAdIdentity({ journalName: 'NATURE', publisher: 'NATURE PORTFOLIO' }).publisher, 'Nature Portfolio');
  assert.strictEqual(displayPublisher('NATURE PORTFOLIO', 'Nature Portfolio'), 'Nature Portfolio');
  assert.strictEqual(displayPublisher('Nature Portfolio', ''), 'Nature Portfolio');
  for (const acronym of ['IEEE', 'BMC', 'ACS', 'JAMA', 'PLOS', 'BMJ', 'AIP', 'APS', 'ACM', 'SIAM']) {
    assert.strictEqual(toDisplayCase(acronym), acronym, acronym);
  }
  assert.strictEqual(toDisplayCase('NATURE PORTFOLIO'), 'Nature Portfolio');
  assert.strictEqual(toDisplayCase('BMC BIOLOGY'), 'BMC Biology');
  assert.strictEqual(toDisplayCase('IEEE ACCESS'), 'IEEE Access');
  assert.strictEqual(toDisplayCase('PLOS ONE'), 'PLOS One');
  assert.strictEqual(toDisplayCase('ACS NANO'), 'ACS Nano');
  assert.strictEqual(toDisplayCase('SIAM JOURNAL ON APPLIED MATH'), 'SIAM Journal On Applied Math');
  assert.strictEqual(displayJournalName({ journalName: 'PLOS ONE', wosName: 'PLOS ONE' }, ''), 'PLOS One');
  assert.strictEqual(toDisplayCase('Nature Portfolio'), 'Nature Portfolio');

  assert.strictEqual(resolveJournalIssn({ requested: '00280836', catalog: { issn: '1476-4687' } }), '0028-0836');
  assert.strictEqual(resolveJournalIssn({ cached: { issn: '1234-5678' }, catalog: nature }), '1234-5678');
  assert.strictEqual(resolveJournalIssn({ pageIssn: '14764687', catalog: nature }), '1476-4687');
  assert.strictEqual(resolveJournalIssn({ catalog: nature }), '0028-0836');
  assert.strictEqual(clarivateAdminRefreshEnabled({}), false);
  assert.strictEqual(clarivateAdminRefreshEnabled({ CLARIVATE_ADMIN_REFRESH_ENABLED: 'true' }), true);
  assert.strictEqual(clarivateAdminRefreshEnabled({ CLARIVATE_ADMIN_REFRESH_ENABLED: '1' }), false);
}

{
  const { MemoryMetricsStore, FileMetricsStore } = await import('../src/utils/metricsStore.ts');
  const { expectedLatestJcrYear, loadJournalMetrics } = await import('../src/utils/metricsRefresh.ts');
  const { FirestoreMetricsStore } = await import('../src/utils/firestoreMetricsStore.ts');

  assert.strictEqual(expectedLatestJcrYear(new Date('2026-10-08T00:00:00.000Z')), 2025);
  assert.strictEqual(expectedLatestJcrYear(new Date('2026-06-30T00:00:00.000Z')), 2025);
  assert.strictEqual(expectedLatestJcrYear(new Date('2026-06-29T23:00:00.000Z')), 2024);
  assert.strictEqual(expectedLatestJcrYear(new Date('2026-01-15T00:00:00.000Z')), 2024);

  const current = {
    journalName: 'NATURE',
    publisher: 'NATURE PORTFOLIO',
    issn: '0028-0836',
    eIssn: '1476-4687',
    wosJournalId: 'NATURE',
    impactFactor: 56.1,
    sourceAttribution: 'JIF 56.1 (Clarivate JCR 2025)',
    provenanceSource: 'clarivate_wos_journals_api' as const,
    isVerifiedClarivate: true,
    verificationStatus: 'clarivate_api' as const,
    jcrYear: 2025,
    retrievedAt: '2026-10-08T00:00:00.000Z',
    reportingYear: '2025',
  };
  const store = new MemoryMetricsStore();
  const now = new Date('2026-10-08T00:00:00.000Z');
  let calls = 0;
  const lookup = async () => {
    calls += 1;
    return current;
  };
  const first = await loadJournalMetrics('00280836', { now, store, lookup });
  const second = await loadJournalMetrics('1476-4687', { now, store, lookup });
  assert.strictEqual(calls, 1);
  assert.strictEqual(first?.impactFactor, 56.1);
  assert.strictEqual(second?.jcrYear, 2025);
  const mapping = await store.getIdMapping('1476-4687');
  assert.strictEqual(mapping?.wosJournalId, 'NATURE');
  const byYear = await store.getByIssnYear('0028-0836', 2025);
  assert.strictEqual(byYear?.source, 'clarivate_wos_journals_api');
  assert.strictEqual(byYear?.retrievedAt, current.retrievedAt);

  const oldStore = new MemoryMetricsStore();
  let oldCalls = 0;
  const oldLookup = async () => {
    oldCalls += 1;
    return { ...current, jcrYear: 2024, reportingYear: '2024', sourceAttribution: 'JIF 56.1 (Clarivate JCR 2024)' };
  };
  await loadJournalMetrics('0028-0836', { now, store: oldStore, lookup: oldLookup });
  await loadJournalMetrics('0028-0836', { now, store: oldStore, lookup: oldLookup });
  assert.strictEqual(oldCalls, 1);
  await loadJournalMetrics('0028-0836', { now: new Date('2026-10-09T00:00:00.000Z'), store: oldStore, lookup: oldLookup });
  assert.strictEqual(oldCalls, 2);
  await loadJournalMetrics('0028-0836', {
    now: new Date('2026-10-09T00:00:00.000Z'),
    store: oldStore,
    lookup: oldLookup,
    force: true,
  });
  assert.strictEqual(oldCalls, 3);

  const missNow = new Date('2026-10-08T00:00:00.000Z');
  const missStore = new MemoryMetricsStore();
  let missCalls = 0;
  const notFound = async () => {
    missCalls += 1;
    return { kind: 'not_found' as const };
  };
  await loadJournalMetrics('1234-5678', { now: missNow, store: missStore, resolve: notFound });
  await loadJournalMetrics('1234-5678', { now: missNow, store: missStore, resolve: notFound });
  assert.strictEqual(missCalls, 1);
  assert.strictEqual((await missStore.getIdMapping('1234-5678'))?.lookupState, 'not_found');
  await loadJournalMetrics('1234-5678', {
    now: new Date('2026-10-09T00:00:00.000Z'),
    store: missStore,
    resolve: notFound,
  });
  assert.strictEqual(missCalls, 2);

  const bareStore = new MemoryMetricsStore();
  let bareCalls = 0;
  const noJif = async () => {
    bareCalls += 1;
    return { kind: 'no_metrics' as const, wosJournalId: 'NOJIF' };
  };
  await loadJournalMetrics('0000-0000', { now: missNow, store: bareStore, resolve: noJif });
  await loadJournalMetrics('0000-0000', { now: missNow, store: bareStore, resolve: noJif });
  assert.strictEqual(bareCalls, 1);
  assert.strictEqual((await bareStore.getIdMapping('0000-0000'))?.lookupState, 'unavailable');
  assert.strictEqual((await bareStore.getIdMapping('0000-0000'))?.wosJournalId, 'NOJIF');

  let blipCalls = 0;
  const blip = async () => {
    blipCalls += 1;
    return { kind: 'unavailable' as const };
  };
  await loadJournalMetrics('1111-1111', { now: missNow, store: bareStore, resolve: blip });
  await loadJournalMetrics('1111-1111', { now: missNow, store: bareStore, resolve: blip });
  assert.strictEqual(blipCalls, 2);
  assert.strictEqual(await bareStore.getIdMapping('1111-1111'), null);

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'clarivate-store-'));
  const fileStore = new FileMetricsStore(path.join(dir, 'clarivate-metrics.json'));
  await loadJournalMetrics('0028-0836', { now, store: fileStore, lookup });
  const reloaded = new FileMetricsStore(path.join(dir, 'clarivate-metrics.json'));
  const fromDisk = await reloaded.getLatestByIssn('0028-0836');
  assert.strictEqual(fromDisk?.jcrYear, 2025);
  assert(!path.join(dir, 'clarivate-metrics.json').endsWith('metrics-cache.json'));
  fs.rmSync(dir, { recursive: true, force: true });

  if (process.env.FIRESTORE_EMULATOR_HOST) {
    const firestore = new FirestoreMetricsStore({
      ...process.env,
      FIRESTORE_PROJECT_ID: process.env.FIRESTORE_PROJECT_ID || 'demo-clarivate',
    });
    const suffix = `9${String(Date.now()).slice(-6)}`;
    const issn = `0000-${suffix.slice(0, 4)}`;
    await firestore.putMetrics({
      issn,
      eIssn: null,
      jcrYear: 2025,
      wosJournalId: 'TEST',
      source: 'clarivate_wos_journals_api',
      retrievedAt: current.retrievedAt,
      metrics: { ...current, issn, journalName: 'Test Journal' },
    });
    const loaded = await firestore.getByIssnYear(issn, 2025);
    assert.strictEqual(loaded?.wosJournalId, 'TEST');
    assert.strictEqual((await firestore.getIdMapping(issn))?.latestJcrYear, 2025);
    console.log('✓ Firestore emulator store round-trip passed.');
  } else {
    console.log('• Firestore emulator not configured (FIRESTORE_EMULATOR_HOST unset); skipped.');
  }
}

{
  const { verifyClarivateIssn } = await import('../scripts/verify-clarivate.ts');
  const previous = process.env.CLARIVATE_API_KEY;
  delete process.env.CLARIVATE_API_KEY;
  const errors: string[] = [];
  const original = console.error;
  console.error = (message?: unknown) => {
    errors.push(String(message ?? ''));
  };
  try {
    assert.strictEqual(await verifyClarivateIssn('0028-0836', {}), 1);
  } finally {
    console.error = original;
    if (previous) process.env.CLARIVATE_API_KEY = previous;
  }
  assert(errors.some((line) => line.includes('CLARIVATE_API_KEY is not set')));
  assert(errors.every((line) => !line.includes('super-secret-key')));

  const serverSource = fs.readFileSync(path.join(root, 'server.ts'), 'utf8');
  const httpSource = fs.readFileSync(path.join(root, 'src/utils/clarivateHttp.ts'), 'utf8');
  assert(serverSource.includes("facts.provenanceSource !== 'clarivate_wos_journals_api'"));
  assert(serverSource.includes('/api/admin/clarivate-metrics/refresh'));
  assert(serverSource.includes('requireAdmin'));
  assert(serverSource.includes('CLARIVATE_ADMIN_REFRESH_ENABLED'));
  assert(serverSource.includes('pageIssn'));
  assert(!/console\.\w+\([^)]*apiKey/.test(httpSource));
  assert(!httpSource.includes('${apiKey}'));
  assert(!httpSource.includes('${secret}'));
}

console.log('✓ Clarivate client, store, refresh policy, and claim guard passed.\n');
