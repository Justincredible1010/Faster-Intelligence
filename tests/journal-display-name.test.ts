import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { displayJournalName, isAbbreviatedJournalName, toDisplayCase } from '../src/utils/journalDisplayName';
import { chinaCopyFacts } from '../src/china/copyFacts';
import { withAdIdentity } from '../server';

// Clarivate field shapes as returned live (names only; no metric values).
const ONC = { journalName: 'ONCOGENE', jcrTitle: 'ONCOGENE', isoTitle: 'Oncogene', wosName: 'ONCOGENE' };
const BMC = { journalName: 'BMC MED', jcrTitle: 'BMC MED', isoTitle: 'BMC Med.', wosName: 'BMC Medicine' };
const BMC_CAPS = { journalName: 'BMC MED', jcrTitle: 'BMC MED', isoTitle: 'BMC Med.', wosName: 'BMC MEDICINE' };

describe('journal display name', () => {
  it('title-cases all-caps names and keeps acronyms', () => {
    assert.equal(toDisplayCase('BMC MEDICINE'), 'BMC Medicine');
    assert.equal(toDisplayCase('JOURNAL OF THE AMERICAN CHEMICAL SOCIETY'), 'Journal of the American Chemical Society');
    assert.equal(toDisplayCase('Mixed Case'), 'Mixed Case');
  });
  it('Clarivate-only: ONCOGENE -> Oncogene, BMC MEDICINE -> BMC Medicine', () => {
    assert.equal(displayJournalName(ONC), 'Oncogene');
    assert.equal(displayJournalName(BMC), 'BMC Medicine');
    assert.equal(displayJournalName(BMC_CAPS), 'BMC Medicine');
  });
  it('never returns the abbreviation', () => {
    assert.ok(isAbbreviatedJournalName('BMC MED', BMC));
    assert.ok(isAbbreviatedJournalName('BMC Med.', BMC));
    for (const f of [BMC, BMC_CAPS]) assert.doesNotMatch(displayJournalName(f), /^BMC (MED|Med\.?)$/);
    // Even with no full title available, the dotted ISO form is not used.
    assert.doesNotMatch(displayJournalName({ isoTitle: 'BMC Med.', jcrTitle: 'BMC MED', journalName: 'BMC Med.' }), /\./);
  });
  it('landing-page title wins, then user/catalog title', () => {
    assert.equal(displayJournalName({ ...BMC, journalTitle: { value: 'BMC Medicine | Home' } }), 'BMC Medicine | Home');
    assert.equal(displayJournalName(BMC, 'BMC Medicine (page)'), 'BMC Medicine (page)');
    assert.equal(displayJournalName({ ...ONC, landingJournalName: 'Oncogene Journal', landingJournalNameSource: 'user_provided' }), 'Oncogene Journal');
    assert.equal(displayJournalName({ ...ONC, landingJournalName: 'ONCOGENE', landingJournalNameSource: 'landing_page' }), 'Oncogene');
  });
  it('applies on the Google path (withAdIdentity) and China path (chinaCopyFacts)', () => {
    assert.equal(withAdIdentity({ ...BMC, publisher: 'BMC' } as any).journalName, 'BMC Medicine');
    assert.equal(withAdIdentity({ ...ONC, publisher: 'SPRINGER NATURE' } as any).journalName, 'Oncogene');
    assert.equal(chinaCopyFacts(BMC as any).journalName, 'BMC Medicine');
    assert.equal(chinaCopyFacts(ONC as any).journalName, 'Oncogene');
  });
});
