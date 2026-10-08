import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { installClarivateClient, lookupMetricsByIssn } from '../src/utils/metricSources';
import { clarivateWosJournals as clarivateHttpClient, readClarivateApiKey } from '../src/utils/clarivateHttp';

dotenv.config();

/**
 * One live Journals API lookup. Prints parsed metrics and never prints the key.
 * Usage: npm run verify:clarivate -- 0028-0836
 */
export async function verifyClarivateIssn(issn: string, env: NodeJS.ProcessEnv = process.env): Promise<number> {
  const cleaned = (issn || '').trim();
  if (!cleaned) {
    console.error('Usage: npm run verify:clarivate -- <ISSN>');
    return 1;
  }
  if (!readClarivateApiKey(env)) {
    console.error('CLARIVATE_API_KEY is not set. Refusing to call the Journals API.');
    return 1;
  }
  installClarivateClient(clarivateHttpClient);
  const metrics = await lookupMetricsByIssn(cleaned);
  if (!metrics) {
    console.error(`No Clarivate metrics returned for ISSN ${cleaned}.`);
    return 2;
  }
  const printable = {
    journalName: metrics.journalName,
    wosJournalId: metrics.wosJournalId,
    issn: metrics.issn,
    eIssn: metrics.eIssn,
    publisher: metrics.publisher,
    impactFactor: metrics.impactFactor,
    fiveYearImpactFactor: metrics.fiveYearImpactFactor,
    immediacyIndex: metrics.immediacyIndex,
    journalCitationIndicator: metrics.journalCitationIndicator,
    jcrQuartile: metrics.jcrQuartile,
    jifRanks: metrics.jifRanks,
    jcrYear: metrics.jcrYear,
    retrievedAt: metrics.retrievedAt,
    provenanceSource: metrics.provenanceSource,
    sourceAttribution: metrics.sourceAttribution,
  };
  console.log(JSON.stringify(printable, null, 2));
  return 0;
}

const isDirectRun = process.argv[1]
  ? path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
  : false;
if (isDirectRun) {
  verifyClarivateIssn(process.argv[2] || '').then((code) => {
    process.exit(code);
  });
}
