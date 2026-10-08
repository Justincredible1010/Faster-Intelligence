import assert from 'assert';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  FETCH_TIMEOUT_MS,
  MAX_HTML_BYTES,
  LandingPageError,
  extractLandingPageFacts,
  fetchLandingPage,
  isPrivateOrReservedIp,
  isPublisherHomepage,
  journalCacheKey,
  parseAllowedJournalUrl,
} from '../src/utils/landingPage';
import { lookupClarivateFacts, type JournalLookupOptions } from '../server';

const fixtureDir = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures', 'landing-pages');

function fixture(name: string): string {
  return fs.readFileSync(path.join(fixtureDir, name), 'utf8');
}

function publicDns() {
  return async () => ['151.101.1.1'];
}

export async function runLandingPageTests() {
  console.log('\n[Test Suite 6] Landing page allowlist and SSRF guards...');
  {
    assert.throws(() => parseAllowedJournalUrl('https://example.com/nature'), LandingPageError);
    assert.throws(() => parseAllowedJournalUrl('http://127.0.0.1/latest'), LandingPageError);
    assert.throws(() => parseAllowedJournalUrl('http://169.254.169.254/latest/meta-data'), LandingPageError);
    assert.throws(() => parseAllowedJournalUrl('http://[::1]/'), LandingPageError);
    assert.throws(() => parseAllowedJournalUrl('https://10.0.0.1/secret'), LandingPageError);
    assert.throws(() => parseAllowedJournalUrl('https://nature.com.evil.example/paper'), LandingPageError);
    assert.throws(() => parseAllowedJournalUrl('https://evilnature.com/paper'), LandingPageError);
    assert.throws(() => parseAllowedJournalUrl('https://user:pass@www.nature.com/nature'), LandingPageError);
    assert.throws(() => parseAllowedJournalUrl('file:///etc/passwd'), LandingPageError);
    assert.equal(parseAllowedJournalUrl('https://www.nature.com/ncomms').hostname, 'www.nature.com');
    assert.equal(parseAllowedJournalUrl('https://bmcbiol.biomedcentral.com/').hostname, 'bmcbiol.biomedcentral.com');
    assert.equal(parseAllowedJournalUrl('https://link.springer.com/journal/10551').hostname, 'link.springer.com');
    assert.equal(parseAllowedJournalUrl('https://www.springernature.com/').hostname, 'www.springernature.com');

    assert.equal(isPrivateOrReservedIp('127.0.0.1'), true);
    assert.equal(isPrivateOrReservedIp('10.1.2.3'), true);
    assert.equal(isPrivateOrReservedIp('192.168.1.9'), true);
    assert.equal(isPrivateOrReservedIp('172.16.0.1'), true);
    assert.equal(isPrivateOrReservedIp('169.254.169.254'), true);
    assert.equal(isPrivateOrReservedIp('::1'), true);
    assert.equal(isPrivateOrReservedIp('::ffff:127.0.0.1'), true);
    assert.equal(isPrivateOrReservedIp('151.101.1.1'), false);

    assert.equal(isPublisherHomepage('https://www.springer.com/'), true);
    assert.equal(isPublisherHomepage('https://link.springer.com/'), true);
    assert.equal(isPublisherHomepage('https://www.biomedcentral.com'), true);
    assert.equal(isPublisherHomepage('https://www.springernature.com/'), true);
    assert.equal(isPublisherHomepage('https://www.nature.com/'), false);
    assert.equal(isPublisherHomepage('https://www.nature.com/ncomms'), false);
    assert.equal(isPublisherHomepage('https://link.springer.com/journal/10551'), false);

    let calls = 0;
    await assert.rejects(
      () =>
        fetchLandingPage('https://internal.nature.com/journal', {
          resolveHost: async () => ['10.0.0.5'],
          httpGet: async () => {
            calls += 1;
            throw new Error('should not connect');
          },
        }),
      (err: unknown) => err instanceof LandingPageError && err.code === 'ssrf'
    );
    assert.equal(calls, 0, 'A private DNS answer must not open a connection');

    calls = 0;
    await assert.rejects(
      () =>
        fetchLandingPage('https://www.nature.com/ncomms', {
          resolveHost: publicDns(),
          httpGet: async () => {
            calls += 1;
            return { status: 302, headers: { location: 'http://169.254.169.254/latest/meta-data' }, body: '' };
          },
        }),
      (err: unknown) => err instanceof LandingPageError && err.code === 'ssrf'
    );
    assert.equal(calls, 1, 'An off-allowlist redirect is refused before a second request');

    calls = 0;
    await assert.rejects(
      () =>
        fetchLandingPage('https://www.nature.com/ncomms', {
          resolveHost: publicDns(),
          httpGet: async () => {
            calls += 1;
            return { status: 302, headers: { location: 'https://evil.example/phish' }, body: '' };
          },
        }),
      (err: unknown) => err instanceof LandingPageError && err.code === 'ssrf'
    );
    assert.equal(calls, 1);

    const seen: string[] = [];
    const redirected = await fetchLandingPage('https://bmcbiol.biomedcentral.com/', {
      resolveHost: publicDns(),
      httpGet: async (url, timeoutMs) => {
        assert.equal(timeoutMs, FETCH_TIMEOUT_MS);
        seen.push(url.hostname);
        if (url.hostname === 'bmcbiol.biomedcentral.com') {
          return { status: 301, headers: { location: 'https://link.springer.com/journal/12915' }, body: '' };
        }
        return { status: 200, headers: { 'content-type': 'text/html; charset=utf-8' }, body: '<title>BMC Biology</title>' };
      },
    });
    assert.deepEqual(seen, ['bmcbiol.biomedcentral.com', 'link.springer.com']);
    assert.equal(redirected.finalUrl, 'https://link.springer.com/journal/12915');

    const hops: string[] = [];
    const cookieDance = await fetchLandingPage('https://www.nature.com/', {
      resolveHost: publicDns(),
      httpGet: async (url) => {
        hops.push(url.pathname);
        const step = hops.length;
        if (step === 1) return { status: 303, headers: { location: 'https://idp.nature.com/authorize?redirect_uri=https%3A%2F%2Fwww.nature.com%2Fnature' }, body: '' };
        if (step === 2) return { status: 302, headers: { location: 'https://idp.nature.com/transit?redirect_uri=https%3A%2F%2Fwww.nature.com%2Fnature' }, body: '' };
        if (step === 3) return { status: 302, headers: { location: 'https://www.nature.com/nature?error=cookies_not_supported' }, body: '' };
        if (step === 4) return { status: 301, headers: { location: 'https://www.nature.com/?error=cookies_not_supported' }, body: '' };
        return { status: 200, headers: { 'content-type': 'text/html' }, body: '<title>Nature</title>' };
      },
    });
    assert.equal(hops.length, 5);
    assert.match(cookieDance.html, /Nature/);
    assert.match(cookieDance.finalUrl, /www\.nature\.com/);

    await assert.rejects(
      () =>
        fetchLandingPage('https://www.nature.com/ncomms', {
          resolveHost: publicDns(),
          httpGet: async () => ({ status: 200, headers: { 'content-type': 'application/json' }, body: '{}' }),
        }),
      (err: unknown) => err instanceof LandingPageError && /not HTML/.test(err.message)
    );

    await assert.rejects(
      () =>
        fetchLandingPage('https://www.nature.com/ncomms', {
          resolveHost: publicDns(),
          httpGet: async () => ({ status: 200, headers: { 'content-type': 'text/html' }, body: 'x'.repeat(MAX_HTML_BYTES + 1) }),
        }),
      (err: unknown) => err instanceof LandingPageError && err.code === 'size'
    );

    console.log('✓ Test Suite 6 Passed: Allowlist, private addresses, and redirects are refused.');
  }

  console.log('\n[Test Suite 7] Landing page fixtures...');
  {
    const nature = extractLandingPageFacts(fixture('nature-portfolio-nature.html'), 'https://www.nature.com/nature');
    assert.equal(nature.layout, 'nature_portfolio');
    assert.equal(nature.journalTitle.value, 'Nature');
    assert.equal(nature.issnPrint.value, '0028-0836');
    assert.equal(nature.issnElectronic.value, '1476-4687');
    assert.match(nature.aimsAndScopeSummary.value || '', /1869/);
    assert.equal(nature.submissionPortalUrl.value, 'https://mts-nature.nature.com/');
    assert.match(nature.authorGuidelinesUrl.value || '', /\/nature\/for-authors$/);
    assert.equal(nature.articleProcessingChargeUsd.value, null);
    assert.equal(nature.pageMetrics.length, 0);
    assert.equal(nature.journalTitle.provenanceLabel, 'landing_page');

    const ncomms = extractLandingPageFacts(
      fixture('nature-portfolio-nature-communications.html'),
      'https://www.nature.com/ncomms'
    );
    assert.equal(ncomms.journalTitle.value, 'Nature Communications');
    assert.equal(ncomms.issnElectronic.value, '2041-1723');
    assert.equal(ncomms.issnPrint.value, null);
    assert.match(ncomms.aimsAndScopeSummary.value || '', /biological, health/);
    const impact = ncomms.pageMetrics.find((metric) => metric.kind === 'impact_factor');
    assert.equal(impact?.numericValue, 18.1);
    assert.equal(impact?.year, 2025);
    assert.equal(impact?.provenance, 'page-sourced');
    assert.notEqual(impact?.numericValue, 14.7, 'The labelled body metric wins over the meta description');
    assert.equal(ncomms.firstDecisionDays.value, 9);
    assert.equal(ncomms.pageMetrics.find((metric) => metric.kind === 'downloads')?.value, '349,945,839 (2025)');
    assert.deepEqual(ncomms.acceptedArticleTypes.value, ['Research articles', 'Reviews & Analysis', 'News & Comment']);
    assert.equal(ncomms.submissionPortalUrl.value, 'https://mts-ncomms.nature.com/');
    assert.equal(ncomms.articleProcessingChargeUsd.value, null);

    const jbe = extractLandingPageFacts(
      fixture('springer-link-journal-of-business-ethics.html'),
      'https://link.springer.com/journal/10551'
    );
    assert.equal(jbe.layout, 'springer_link');
    assert.equal(jbe.journalTitle.value, 'Journal of Business Ethics');
    assert.equal(jbe.issnPrint.value, '0167-4544');
    assert.equal(jbe.issnElectronic.value, '1573-0697');
    assert.match(jbe.aimsAndScopeSummary.value || '', /ethical issues related to business/);
    assert.equal(jbe.pageMetrics.find((metric) => metric.kind === 'impact_factor')?.numericValue, 6.3);
    assert.equal(jbe.pageMetrics.find((metric) => metric.kind === 'five_year_impact_factor')?.numericValue, 9.7);
    assert.equal(jbe.firstDecisionDays.value, 19);
    assert.equal(jbe.editorInChief.value, 'Michelle Greenwood PhD, Gazi Islam PhD');
    assert.equal(jbe.openAccessPolicy.value, 'Hybrid');
    assert.equal(jbe.publisherName.value, 'Springer');
    assert.equal(jbe.submissionPortalUrl.value, 'https://www.editorialmanager.com/busi');
    assert.match(jbe.authorGuidelinesUrl.value || '', /submission-guidelines$/);
    assert.equal(jbe.articleProcessingChargeUsd.value, null);

    const fees = extractLandingPageFacts(
      fixture('nature-portfolio-open-access-fees.html'),
      'https://www.nature.com/ncomms/open-access'
    );
    assert.equal(fees.journalTitle.value, 'Nature Communications');
    assert.equal(fees.issnElectronic.value, '2041-1723');
    assert.equal(fees.articleProcessingChargeUsd.value, 7350);
    assert.equal(fees.pageMetrics.find((metric) => metric.kind === 'apc')?.provenance, 'page-sourced');

    assert.equal(journalCacheKey({ issnPrint: '0028-0836', issnElectronic: '1476-4687' }), 'issn:0028-0836');
    assert.equal(journalCacheKey({ issnElectronic: '2041-1723' }), 'issn:2041-1723');
    assert.notEqual(
      journalCacheKey({ canonicalUrl: 'https://www.nature.com/journal/paper' }),
      journalCacheKey({ canonicalUrl: 'https://link.springer.com/journal/paper' })
    );
    assert.equal(
      journalCacheKey({ issnPrint: '0028-0836', canonicalUrl: 'https://www.nature.com/' }),
      journalCacheKey({ issnPrint: '0028-0836', canonicalUrl: 'https://www.nature.com/nature' })
    );

    console.log('✓ Test Suite 7 Passed: Fixtures expose the fields each layout actually states.');
  }

  console.log('\n[Test Suite 8] Page facts feed lookup without a slug cache key...');
  {
    const natureHtml = fixture('nature-portfolio-nature.html');
    const ncommsHtml = fixture('nature-portfolio-nature-communications.html');
    const jbeHtml = fixture('springer-link-journal-of-business-ethics.html');
    const quiet: Pick<JournalLookupOptions, 'aiLookup' | 'persist'> = {
      persist: false,
      aiLookup: async () => null,
    };

    const natureCache = new Map();
    const homepage = await lookupClarivateFacts('https://www.nature.com/', false, {
      ...quiet,
      cache: natureCache,
      fetchPage: async () => ({ html: natureHtml, finalUrl: 'https://www.nature.com/' }),
    });
    assert.equal(homepage.journalName, 'Nature');
    assert.equal(homepage.verificationStatus, 'source_verified');
    assert.equal(homepage.isVerifiedClarivate, true);
    assert.equal(homepage.impactFactor, 50.5, 'Catalog impact factor stays when the page does not state one');
    assert.match(homepage.aimsAndScopeSummary || '', /1869/);
    assert.equal(homepage.submissionPortalUrl, 'https://mts-nature.nature.com/');
    assert.equal(homepage.provenanceMap?.aimsAndScopeSummary?.source, 'landing_page');
    assert.equal(homepage.extractedFacts?.issnPrint.value, '0028-0836');
    assert.equal(natureCache.has('nature'), false);
    assert.equal(natureCache.has('paper'), false);
    assert.equal(natureCache.has('issn:0028-0836'), true);

    const sameJournal = await lookupClarivateFacts('https://www.nature.com/nature', false, {
      ...quiet,
      cache: natureCache,
      fetchPage: async () => ({ html: natureHtml, finalUrl: 'https://www.nature.com/nature' }),
    });
    assert.equal(sameJournal.journalName, 'Nature');
    assert.equal(sameJournal.isFromCache, true);

    const ncommsCache = new Map();
    const ncomms = await lookupClarivateFacts('https://www.nature.com/ncomms', false, {
      ...quiet,
      cache: ncommsCache,
      fetchPage: async () => ({ html: ncommsHtml, finalUrl: 'https://www.nature.com/ncomms' }),
    });
    assert.equal(ncomms.impactFactor, 14.7, 'Catalog impact factor is kept when both the catalog and the page state one');
    assert.match(ncomms.provenanceMap?.impactFactor?.note || '', /18\.1/);
    assert.match(ncomms.aimsAndScopeSummary || '', /biological, health/);
    assert.equal(ncomms.verificationStatus, 'source_verified');
    assert.equal(ncomms.isVerifiedClarivate, true);
    assert.equal(ncommsCache.has('ncomms'), false);
    assert.equal(ncommsCache.has('issn:2041-1723'), true);

    const jbeCache = new Map();
    const jbe = await lookupClarivateFacts('https://link.springer.com/journal/10551', false, {
      ...quiet,
      cache: jbeCache,
      fetchPage: async () => ({ html: jbeHtml, finalUrl: 'https://link.springer.com/journal/10551' }),
      aiLookup: async () => ({
        journalName: 'Guess Journal',
        publisher: 'Springer Nature',
        impactFactor: 1.1,
        aimsAndScopeSummary: 'gemini guessed scope',
        firstDecisionDays: 3,
      }),
    });
    assert.equal(jbe.journalName, 'Journal of Business Ethics');
    assert.equal(jbe.impactFactor, 6.3);
    assert.equal(jbe.fiveYearImpactFactor, 9.7);
    assert.equal(jbe.firstDecisionDays, 19);
    assert.match(jbe.aimsAndScopeSummary || '', /ethical issues/);
    assert.equal(jbe.verificationStatus, 'unverified');
    assert.notEqual(jbe.verificationStatus, 'source_verified');
    assert.equal(jbe.isVerifiedClarivate, false);
    assert.equal(jbe.provenanceMap?.impactFactor?.source, 'landing_page');
    assert.match(jbe.sourceAttribution, /Not Clarivate-verified/);
    assert.equal(jbeCache.has('10551'), false);
    assert.equal(jbeCache.has('issn:0167-4544'), true);

    const collision = new Map();
    const alpha = await lookupClarivateFacts('https://www.nature.com/paper', false, {
      ...quiet,
      cache: collision,
      fetchPage: async (url) => ({
        html: url.includes('springer')
          ? '<html><head><meta property="og:title" content="Beta Journal"/></head><body><span itemprop="issn">2222-2228</span> (print)</body></html>'
          : '<html><head><meta property="og:title" content="Alpha Journal"/></head><body><span itemprop="issn">1111-1119</span> (online)</body></html>',
        finalUrl: url,
      }),
    });
    const beta = await lookupClarivateFacts('https://link.springer.com/paper', false, {
      ...quiet,
      cache: collision,
      fetchPage: async (url) => ({
        html: url.includes('springer')
          ? '<html><head><meta property="og:title" content="Beta Journal"/></head><body><span itemprop="issn">2222-2228</span> (print)</body></html>'
          : '<html><head><meta property="og:title" content="Alpha Journal"/></head><body><span itemprop="issn">1111-1119</span> (online)</body></html>',
        finalUrl: url,
      }),
    });
    assert.equal(alpha.journalName, 'Alpha Journal');
    assert.equal(beta.journalName, 'Beta Journal');
    assert.equal(collision.has('paper'), false);
    assert.equal(collision.has('issn:1111-1119'), true);
    assert.equal(collision.has('issn:2222-2228'), true);

    let fetched = 0;
    const portal = await lookupClarivateFacts('https://www.springer.com/', false, {
      ...quiet,
      cache: new Map(),
      fetchPage: async () => {
        fetched += 1;
        return { html: '', finalUrl: 'https://www.springer.com/' };
      },
    });
    assert.equal(fetched, 0);
    assert.equal(portal.verificationStatus, 'missing');
    assert.equal(portal.journalName, 'Publisher homepage');
    assert.equal(portal.isVerifiedClarivate, false);

    const offline = await lookupClarivateFacts('https://www.nature.com/', false, {
      ...quiet,
      cache: new Map(),
      fetchPage: async () => {
        throw new LandingPageError('Landing page request timed out.', 'timeout');
      },
    });
    assert.equal(offline.journalName, 'Nature');
    assert.equal(offline.verificationStatus, 'source_verified');
    assert.match(offline.provenanceMap?.landingPage?.note || '', /timed out/);

    await assert.rejects(
      () => lookupClarivateFacts('https://evil.example/paper', false, { ...quiet, cache: new Map() }),
      (err: unknown) => err instanceof LandingPageError && err.code === 'ssrf'
    );

    console.log('✓ Test Suite 8 Passed: ISSN or canonical URL is the cache key, and page facts beat guesses.');
  }
}
