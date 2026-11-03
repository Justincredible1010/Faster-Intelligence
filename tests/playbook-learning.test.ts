import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, it } from 'node:test';
import { JOURNAL_CATALOG } from '../src/data/journalCatalog';
import { defaultPlaybook, loadPlaybookFile } from '../src/server/playbook';
import {
  applyApprovedProposal,
  applyCopyCorrections,
  buildProposal,
  isDuplicateProposal,
  playbookPromptSection,
  ProposalValidationError,
} from '../src/server/playbookLearning';
import { createPlaybookStoreFromEnv, FilePlaybookStore, FirestorePlaybookStore, MemoryPlaybookStore } from '../src/server/playbookStore';
import { createCopyEditQueue, newRuleLines } from '../src/utils/playbookProposals';
import { generateDeterministicCampaign } from '../server.ts';

delete process.env.CLARIVATE_API_KEY;
delete process.env.GEMINI_API_KEY;

describe('playbook proposals', () => {
  it('validates and stamps proposals on the server', () => {
    const p = buildProposal({ kind: 'copy_edit', before: 'Submit now', after: 'Submit your paper', status: 'approved', submittedBy: 'x' }, 'u@springernature.com', 'id1');
    assert.equal(p.status, 'pending');
    assert.equal(p.submittedBy, 'u@springernature.com');
    assert.throws(() => buildProposal({ kind: 'copy_edit', before: 'a', after: 'a' }, 'u', 'i'), ProposalValidationError);
    assert.throws(() => buildProposal({ kind: 'rule' }, 'u', 'i'), ProposalValidationError);
    assert.throws(() => buildProposal({ kind: 'nope', rule: 'x' }, 'u', 'i'), ProposalValidationError);
    assert.ok(isDuplicateProposal(buildProposal({ kind: 'rule', rule: 'Say "manuscript"' }, 'u', 'b'), [buildProposal({ kind: 'rule', rule: 'Say "manuscript"' }, 'v', 'a')]));
  });

  it('approved proposals are merged and injected into generation', () => {
    let pb = defaultPlaybook();
    pb = applyApprovedProposal(pb, buildProposal({ kind: 'rule', rule: 'Use "manuscript", not "paper".' }, 'u', '1'), 'admin@x');
    pb = applyApprovedProposal(pb, buildProposal({ kind: 'prohibited_term', rule: 'cheap' }, 'u', '2'), 'admin@x');
    pb = applyApprovedProposal(pb, buildProposal({ kind: 'copy_edit', before: 'Submit Now', after: 'Submit Your Manuscript', language: 'EN' }, 'u', '3'), 'admin@x');
    assert.deepEqual(pb.learnedRules, ['Use "manuscript", not "paper".']);
    assert.ok(pb.prohibitedTerms.includes('cheap'));
    assert.equal(pb.modifiedBy, 'admin@x');
    const prompt = playbookPromptSection(pb);
    assert.match(prompt, /manuscript.*approved learned rule/);
    assert.match(prompt, /"Submit Now" -> "Submit Your Manuscript"/);
    const fixed = applyCopyCorrections({ searchAds: {}, headlines: [{ text: 'Submit Now' }] } as any, pb, 'EN');
    assert.equal(fixed.headlines[0].text, 'Submit Your Manuscript');
    assert.equal(applyCopyCorrections({ headlines: [{ text: 'Submit Now' }] } as any, pb, 'JA').headlines[0].text, 'Submit Now');
  });

  it('client helpers find new rule lines and debounce copy edits', async () => {
    assert.deepEqual(newRuleLines('# Rules\n- Old rule here', '# Rules\n- Old rule here\n- Always say manuscript\n\n# Heading'), ['Always say manuscript']);
    const sent: any[] = [];
    const q = createCopyEditQueue(async (b) => void sent.push(b), 10);
    q.edit({ field: 'h0', before: 'Submit Now', after: 'Submit N' });
    q.edit({ field: 'h0', before: 'Submit N', after: 'Submit Your Paper' });
    await new Promise((r) => setTimeout(r, 30));
    assert.deepEqual(sent, [{ kind: 'copy_edit', field: 'h0', before: 'Submit Now', after: 'Submit Your Paper' }]);
  });
});

describe('playbook store (offline)', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pb-'));
  const paths = { playbook: path.join(tmp, 'pb.json'), metrics: path.join(tmp, 'm.json'), proposals: path.join(tmp, 'p.json') };

  for (const [name, make] of [
    ['memory', () => new MemoryPlaybookStore()],
    ['file', () => new FilePlaybookStore(paths)],
  ] as const) {
    it(`${name}: saves playbook with learned rules, proposals and metrics records`, async () => {
      const store = make();
      const pb = applyApprovedProposal(defaultPlaybook(), buildProposal({ kind: 'rule', rule: 'Rule one is here' }, 'u', 'r'), 'a');
      await store.savePlaybook(pb);
      assert.deepEqual((await store.getPlaybook()).learnedRules, ['Rule one is here']);
      const p = buildProposal({ kind: 'rule', rule: 'Rule two is here' }, 'u', 'id-2');
      await store.saveProposal(p);
      assert.equal((await store.listProposals('pending')).length, 1);
      await store.saveProposal({ ...p, status: 'approved' });
      assert.equal((await store.listProposals('pending')).length, 0);
      assert.equal((await store.getProposal('id-2'))?.status, 'approved');
    });
  }

  it('file playbook keeps learned rules across reloads', () => {
    assert.deepEqual(loadPlaybookFile(paths.playbook).learnedRules, ['Rule one is here']);
  });

  it('firestore store uses the right collections and seeds from files (fake client)', async () => {
    const data = new Map<string, Map<string, any>>();
    const col = (name: string) => {
      if (!data.has(name)) data.set(name, new Map());
      const m = data.get(name)!;
      const query = (filter?: (v: any) => boolean) => ({
        where: (f: string, _op: string, v: any) => query((d) => d[f] === v),
        limit: () => query(filter),
        get: async () => {
          const docs = [...m.values()].filter((d) => !filter || filter(d)).map((d) => ({ data: () => d }));
          return { docs, empty: docs.length === 0 };
        },
      });
      return {
        ...query(),
        doc: (id: string) => ({
          get: async () => ({ exists: m.has(id), data: () => m.get(id) }),
          set: async (v: any) => void m.set(id, v),
        }),
      };
    };
    const store = new FirestorePlaybookStore({ collection: col }, paths);
    assert.deepEqual((await store.getPlaybook()).learnedRules, ['Rule one is here']); // seeded from file
    await store.savePlaybook({ ...defaultPlaybook(), learnedRules: ['From Firestore rule'] });
    assert.ok(data.get('appSettings')!.has('adminPlaybook'));
    assert.deepEqual((await store.getPlaybook()).learnedRules, ['From Firestore rule']);
    await store.saveProposal(buildProposal({ kind: 'rule', rule: 'Pending rule text' }, 'u', 'fp1'));
    assert.equal((await store.listProposals('pending')).length, 1);
    assert.ok(data.get('playbookProposals')!.has('fp1'));
  });

  it('selects the store from env', async () => {
    assert.ok((await createPlaybookStoreFromEnv(paths, { PLAYBOOK_STORE: 'memory' } as any)) instanceof MemoryPlaybookStore);
    assert.ok((await createPlaybookStoreFromEnv(paths, {} as any)) instanceof FilePlaybookStore);
    await assert.rejects(createPlaybookStoreFromEnv(paths, { METRICS_STORE: 'firestore' } as any), /FIRESTORE_PROJECT_ID/);
  });
});

describe('deterministic campaigns pass the final QA gate', () => {
  for (const lang of ['EN', 'ZH', 'JA'] as const) {
    it(`${lang} template copy is ad-ready`, () => {
      for (const entry of JOURNAL_CATALOG.slice(0, 6)) {
        for (const stage of ['AWA', 'CON', 'DEC'] as const) {
          const c: any = generateDeterministicCampaign(entry as any, stage, lang);
          assert.ok(c.copyQa, 'copyQa attached');
          assert.equal(c.copyQa.ready, true, `${entry.journalName} ${stage}: ${JSON.stringify(c.copyQa.issues)}`);
        }
      }
    });
  }
});
