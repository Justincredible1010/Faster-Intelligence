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
  mergeLandingPageFacts,
  parseAllowedJournalUrl,
  type MergeableJournalFacts,
} from '../src/utils/landingPage';
import { generateDeterministicCampaign, lookupClarivateFacts, type JournalLookupOptions } from '../server';
import { guardMetricClaims } from '../src/utils/metricClaims';

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
    assert.equal(isPrivateOrReservedIp('::ffff:7f00:1'), true);
    assert.equal(isPrivateOrReservedIp('::ffff:a9fe:a9fe'), true);
    assert.equal(isPrivateOrReservedIp('::ffff:9765:101'), false);
    assert.equal(isPrivateOrReservedIp('64:ff9b::1'), true);
    assert.equal(isPrivateOrReservedIp('64:ff9b::8.8.8.8'), true);
    assert.equal(isPrivateOrReservedIp('64:ff9b::808:808'), true);
    assert.equal(isPrivateOrReservedIp('2002::'), true);
    assert.equal(isPrivateOrReservedIp('2002:7f00:1::'), true);
    assert.equal(isPrivateOrReservedIp('2002:c000:201::'), true);
    assert.equal(isPrivateOrReservedIp('151.101.1.1'), false);
    assert.equal(isPrivateOrReservedIp('2001:4860:4860::8888'), false);

    assert.throws(() => parseAllowedJournalUrl('https://www.nature.com:8443/ncomms'), LandingPageError);
    assert.throws(() => parseAllowedJournalUrl('http://www.nature.com:8080/ncomms'), LandingPageError);
    assert.equal(parseAllowedJournalUrl('https://www.nature.com:443/ncomms').hostname, 'www.nature.com');
    assert.equal(parseAllowedJournalUrl('http://www.nature.com:80/ncomms').hostname, 'www.nature.com');
    assert.equal(parseAllowedJournalUrl('http://www.nature.com:443/ncomms').port, '443');
    assert.equal(parseAllowedJournalUrl('https://www.nature.com:80/ncomms').port, '80');

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

    for (const reserved of ['::ffff:7f00:1', '64:ff9b::1', '2002:7f00:1::']) {
      calls = 0;
      await assert.rejects(
        () =>
          fetchLandingPage('https://www.nature.com/ncomms', {
            resolveHost: async () => [reserved],
            httpGet: async () => {
              calls += 1;
              throw new Error('should not connect');
            },
          }),
        (err: unknown) => err instanceof LandingPageError && err.code === 'ssrf'
      );
      assert.equal(calls, 0, `${reserved} must not open a connection`);
    }

    await assert.rejects(
      () =>
        fetchLandingPage('https://www.nature.com:8443/ncomms', {
          resolveHost: async () => {
            throw new Error('dns should not run');
          },
          httpGet: async () => {
            throw new Error('should not connect');
          },
        }),
      (err: unknown) => err instanceof LandingPageError && err.code === 'ssrf'
    );

    const triedAddresses: string[] = [];
    const ipv4First = await fetchLandingPage('https://www.nature.com/ncomms', {
      resolveHost: async () => ['2001:4860:4860::8888', '151.101.1.1'],
      httpGet: async (_url, timeoutMs, address) => {
        assert.equal(timeoutMs, FETCH_TIMEOUT_MS);
        triedAddresses.push(address || '');
        return { status: 200, headers: { 'content-type': 'text/html' }, body: '<title>From IPv4</title>' };
      },
    });
    assert.deepEqual(triedAddresses, ['151.101.1.1']);
    assert.match(ipv4First.html, /From IPv4/);

    const fallbackOrder: string[] = [];
    const recovered = await fetchLandingPage('https://www.nature.com/ncomms', {
      resolveHost: async () => ['2001:4860:4860::8888', '151.101.2.1'],
      httpGet: async (_url, _timeoutMs, address) => {
        fallbackOrder.push(address || '');
        if (address === '151.101.2.1') throw new LandingPageError('Landing page request failed.', 'http');
        return { status: 200, headers: { 'content-type': 'text/html' }, body: '<title>From IPv6</title>' };
      },
    });
    assert.deepEqual(fallbackOrder, ['151.101.2.1', '2001:4860:4860::8888']);
    assert.match(recovered.html, /From IPv6/);

    const started = Date.now();
    await assert.rejects(
      () =>
        fetchLandingPage('https://www.nature.com/ncomms', {
          timeoutMs: 40,
          resolveHost: publicDns(),
          httpGet: () => new Promise(() => {}),
        }),
      (err: unknown) => err instanceof LandingPageError && err.code === 'timeout'
    );
    assert.ok(Date.now() - started < 1500, 'The overall deadline aborts a request that keeps the socket busy');

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

    const decoyApc = extractLandingPageFacts(
      `<script>var APC = "$12.00";</script>
       <style>.apc { content: "$99.00"; }</style>
       <p>Membership is $49. The article processing charge policy mentions a $2 million grant.</p>
       <p>The current APC, subject to VAT or local taxes where applicable, is: £5490.00/$7350.00/€6150.00</p>
       <p>Print subscription $199 per year.</p>`,
      'https://www.nature.com/ncomms/open-access'
    );
    assert.equal(decoyApc.articleProcessingChargeUsd.value, 7350);

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
    const quiet: Pick<JournalLookupOptions, 'persist'> = {
      persist: false,
    };

    const natureCache = new Map();
    let natureFetches = 0;
    const homepage = await lookupClarivateFacts('https://www.nature.com/', false, {
      ...quiet,
      cache: natureCache,
      fetchPage: async () => {
        natureFetches += 1;
        return { html: natureHtml, finalUrl: 'https://www.nature.com/' };
      },
    });
    assert.equal(natureFetches, 1);
    assert.equal(homepage.journalName, 'Nature');
    assert.equal(homepage.verificationStatus, 'catalog_snapshot');
    assert.equal(homepage.isVerifiedClarivate, false);
    assert.equal(homepage.impactFactor, null, 'The catalog no longer stores a Nature impact factor, and the page does not state one');
    assert.match(homepage.sourceAttribution, /catalog snapshot/i);
    assert.doesNotMatch(homepage.sourceAttribution, /verified via clarivate/i);
    assert.match(homepage.sourceAttribution, /not retrieved from the clarivate api/i);
    assert.match(homepage.aimsAndScopeSummary || '', /1869/);
    assert.equal(homepage.submissionPortalUrl, 'https://mts-nature.nature.com/');
    assert.equal(homepage.provenanceMap?.aimsAndScopeSummary?.source, 'page_sourced');
    assert.equal(homepage.extractedFacts?.issnPrint.value, '0028-0836');
    assert.equal(natureCache.has('nature'), false);
    assert.equal(natureCache.has('paper'), false);
    assert.equal(natureCache.has('issn:0028-0836'), true);

    const inventedPath = await lookupClarivateFacts('https://www.nature.com/nature', false, {
      ...quiet,
      cache: natureCache,
      fetchPage: async () => {
        natureFetches += 1;
        return { html: natureHtml, finalUrl: 'https://www.nature.com/nature' };
      },
    });
    assert.equal(natureFetches, 2, 'A different path is not served from the homepage catalog snapshot');
    assert.equal(inventedPath.url, 'https://www.nature.com/nature');
    assert.notEqual(inventedPath.verificationStatus, 'catalog_snapshot');
    assert.equal(inventedPath.impactFactor, null);
    assert.equal(natureCache.has('nature'), false);
    assert.equal(natureCache.has('paper'), false);

    const homepageCopy = generateDeterministicCampaign(homepage, 'CON', 'EN');
    const homepageText = [
      ...homepageCopy.searchAds.headlines.map((item) => item.text),
      ...homepageCopy.searchAds.descriptions.map((item) => item.text),
      ...homepageCopy.searchAds.callouts,
      homepageCopy.displayAds.longHeadline,
    ].join('\n');
    assert.doesNotMatch(homepageText, /50\.5/);
    assert.doesNotMatch(homepageText, /Clarivate/);

    const ncommsCache = new Map();
    const ncomms = await lookupClarivateFacts('https://www.nature.com/ncomms', false, {
      ...quiet,
      cache: ncommsCache,
      fetchPage: async () => ({ html: ncommsHtml, finalUrl: 'https://www.nature.com/ncomms' }),
    });
    assert.equal(ncomms.impactFactor, 18.1, 'The page-sourced impact factor is the displayed value');
    assert.equal(ncomms.verificationStatus, 'page_sourced');
    assert.equal(ncomms.provenanceSource, 'page_sourced');
    assert.equal(ncomms.provenanceMap?.impactFactor?.source, 'page_sourced');
    assert.equal(ncomms.provenanceMap?.impactFactorCatalogSnapshot?.source, 'catalog_snapshot');
    assert.match(ncomms.provenanceMap?.impactFactorCatalogSnapshot?.note || '', /14\.7/);
    assert.equal(ncomms.firstDecisionDays, 9);
    assert.equal(ncomms.provenanceMap?.firstDecisionDays?.source, 'page_sourced');
    assert.match(ncomms.provenanceMap?.firstDecisionDaysCatalogSnapshot?.note || '', /28/);
    assert.equal(ncomms.fiveYearImpactFactor, 16.2);
    assert.equal(ncomms.provenanceMap?.fiveYearImpactFactor?.source, 'catalog_snapshot');
    assert.equal(ncomms.apcUsd, 6790);
    assert.equal(ncomms.provenanceMap?.apcUsd?.source, 'catalog_snapshot');
    assert.match(ncomms.aimsAndScopeSummary || '', /biological, health/);
    assert.notEqual(ncomms.verificationStatus, 'source_verified');
    assert.equal(ncomms.isVerifiedClarivate, false);
    assert.doesNotMatch(ncomms.sourceAttribution, /Verified via Clarivate/);
    assert.equal(ncommsCache.has('ncomms'), false);
    assert.equal(ncommsCache.has('issn:2041-1723'), true);

    const keptClaim = guardMetricClaims('IF 18.1 and a 9-day first decision', ncomms);
    assert.match(keptClaim.text, /18\.1/);
    assert.match(keptClaim.text, /9/);
    assert.equal(keptClaim.flags.length, 0);
    const strippedClaim = guardMetricClaims('Clarivate IF 14.7 and APC $6790', ncomms);
    assert.doesNotMatch(strippedClaim.text, /14\.7/);
    assert.doesNotMatch(strippedClaim.text, /6790/);
    assert.doesNotMatch(strippedClaim.text, /Clarivate/i);

    let aliasFetches = 0;
    const aliasCache = new Map();
    await lookupClarivateFacts('https://www.nature.com/ncomms', false, {
      ...quiet,
      cache: aliasCache,
      fetchPage: async () => {
        aliasFetches += 1;
        return { html: ncommsHtml, finalUrl: 'https://www.nature.com/ncomms' };
      },
    });
    const aliased = await lookupClarivateFacts('https://www.nature.com/ncomms/about', false, {
      ...quiet,
      cache: aliasCache,
      fetchPage: async () => {
        aliasFetches += 1;
        return { html: ncommsHtml, finalUrl: 'https://www.nature.com/ncomms/about' };
      },
    });
    assert.equal(aliasFetches, 2, 'The first request for a new URL still reads the page to learn the ISSN');
    assert.equal(aliased.isFromCache, true);
    assert.equal(aliased.impactFactor, 18.1);
    assert.equal(aliasCache.has('url:nature.com/ncomms/about'), true);
    await lookupClarivateFacts('https://www.nature.com/ncomms/about', false, {
      ...quiet,
      cache: aliasCache,
      fetchPage: async () => {
        aliasFetches += 1;
        return { html: ncommsHtml, finalUrl: 'https://www.nature.com/ncomms/about' };
      },
    });
    assert.equal(aliasFetches, 2, 'The saved URL alias is reused and the page is not fetched again');

    const ncommsCopy = generateDeterministicCampaign(ncomms, 'CON', 'EN');
    const ncommsText = [
      ...ncommsCopy.searchAds.headlines.map((item) => item.text),
      ...ncommsCopy.searchAds.descriptions.map((item) => item.text),
      ...ncommsCopy.searchAds.callouts,
      ncommsCopy.displayAds.longHeadline,
    ].join('\n');
    assert.match(ncommsText, /IF 18\.1/);
    assert.doesNotMatch(ncommsText, /Clarivate/);
    assert.doesNotMatch(ncommsText, /14\.7/);
    assert.doesNotMatch(ncommsText, /6790/);

    const guidelinesCampaign = generateDeterministicCampaign(ncomms, 'DEC');
    const guidelinesLink = guidelinesCampaign.searchAds.sitelinks.find((link) => link.title === 'Author Guidelines');
    assert.equal(guidelinesLink?.urlPath, 'https://www.nature.com/ncomms/submit');
    const guidelinesFallback = generateDeterministicCampaign(
      { ...ncomms, authorGuidelinesUrl: null, extractedFacts: undefined },
      'DEC'
    );
    const fallbackLink = guidelinesFallback.searchAds.sitelinks.find((link) => link.title === 'Author Guidelines');
    assert.equal(fallbackLink?.urlPath, 'https://www.nature.com/ncomms/for-authors');

    const catalogWithGaps = mergeLandingPageFacts(
      {
        journalName: 'Nature Communications',
        publisher: 'Nature Portfolio',
        impactFactor: 14.7,
        fiveYearImpactFactor: 16.2,
        firstDecisionDays: null,
        apcUsd: null,
        verificationStatus: 'source_verified',
        isVerifiedClarivate: true,
        reportingYear: 'JCR 2024 (Clarivate Journal Citation Reports)',
        sourceAttribution: 'Verified via Clarivate Journal Citation Reports (JCR 2024/2025) & Web of Science Index',
        provenanceMap: {
          impactFactor: { source: 'Clarivate', confidence: 0.95, year: 2024 },
          journalName: { source: 'Clarivate', confidence: 0.95 },
        },
      } as unknown as MergeableJournalFacts,
      extractLandingPageFacts(ncommsHtml, 'https://www.nature.com/ncomms')
    );
    assert.equal(catalogWithGaps.firstDecisionDays, 9);
    assert.equal(catalogWithGaps.verificationStatus, 'page_sourced');
    assert.equal(catalogWithGaps.provenanceMap?.firstDecisionDays?.source, 'page_sourced');
    assert.equal(catalogWithGaps.impactFactor, 18.1);
    assert.equal(catalogWithGaps.provenanceMap?.impactFactorCatalogSnapshot?.source, 'catalog_snapshot');
    assert.equal(catalogWithGaps.isVerifiedClarivate, false);
    assert.notEqual(catalogWithGaps.verificationStatus, 'source_verified');

    const catalogMissingApc = mergeLandingPageFacts(
      {
        journalName: 'Nature Communications',
        publisher: 'Nature Portfolio',
        impactFactor: 14.7,
        apcUsd: null,
        verificationStatus: 'unverified',
        isVerifiedClarivate: false,
        sourceAttribution: 'Hardcoded catalog snapshot. Not a Clarivate lookup and not verified.',
        provenanceMap: {
          impactFactor: { source: 'catalog_snapshot', confidence: 0.5, year: 2024 },
        },
      } as unknown as MergeableJournalFacts,
      extractLandingPageFacts(fixture('nature-portfolio-open-access-fees.html'), 'https://www.nature.com/ncomms/open-access')
    );
    assert.equal(catalogMissingApc.apcUsd, 7350);
    assert.equal(catalogMissingApc.verificationStatus, 'page_sourced');
    assert.equal(catalogMissingApc.provenanceMap?.apcUsd?.source, 'page_sourced');
    assert.equal(catalogMissingApc.impactFactor, 14.7);
    assert.equal(catalogMissingApc.provenanceMap?.impactFactor?.source, 'catalog_snapshot');

    const userKept = mergeLandingPageFacts(
      {
        journalName: 'Nature Communications',
        publisher: 'Nature Portfolio',
        impactFactor: 15,
        firstDecisionDays: null,
        verificationStatus: 'user_provided',
        isVerifiedClarivate: false,
        sourceAttribution: 'Manually supplied by user',
        provenanceMap: {},
      } as MergeableJournalFacts,
      extractLandingPageFacts(ncommsHtml, 'https://www.nature.com/ncomms')
    );
    assert.equal(userKept.impactFactor, 15);
    assert.equal(userKept.provenanceMap?.impactFactor?.source, 'user_provided');
    assert.match(userKept.provenanceMap?.impactFactor?.note || '', /18\.1/);
    assert.equal(userKept.firstDecisionDays, 9);
    assert.equal(userKept.provenanceMap?.firstDecisionDays?.source, 'page_sourced');

    const jbeCache = new Map();
    const jbe = await lookupClarivateFacts('https://link.springer.com/journal/10551', false, {
      ...quiet,
      cache: jbeCache,
      fetchPage: async () => ({ html: jbeHtml, finalUrl: 'https://link.springer.com/journal/10551' }),
    });
    assert.equal(jbe.journalName, 'Journal of Business Ethics');
    assert.equal(jbe.impactFactor, 6.3);
    assert.equal(jbe.fiveYearImpactFactor, 9.7);
    assert.equal(jbe.firstDecisionDays, 19);
    assert.match(jbe.aimsAndScopeSummary || '', /ethical issues/);
    assert.equal(jbe.verificationStatus, 'page_sourced');
    assert.equal(jbe.provenanceSource, 'page_sourced');
    assert.equal(jbe.isVerifiedClarivate, false);
    assert.equal(jbe.provenanceMap?.impactFactor?.source, 'page_sourced');
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
    assert.equal(offline.verificationStatus, 'catalog_snapshot');
    assert.equal(offline.isVerifiedClarivate, false);
    assert.equal(offline.impactFactor, null);
    assert.match(offline.sourceAttribution, /not retrieved from the clarivate api/i);
    assert.match(offline.provenanceMap?.landingPage?.note || '', /timed out/);

    await assert.rejects(
      () => lookupClarivateFacts('https://evil.example/paper', false, { ...quiet, cache: new Map() }),
      (err: unknown) => err instanceof LandingPageError && err.code === 'ssrf'
    );

    console.log('✓ Test Suite 8 Passed: ISSN or canonical URL is the cache key, and page facts beat guesses.');
  }
}
