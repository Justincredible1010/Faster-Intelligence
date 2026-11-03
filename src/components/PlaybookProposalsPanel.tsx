import React, { useEffect, useState } from 'react';
import { apiFetch } from '../auth/api';

interface Proposal {
  id: string;
  kind: 'copy_edit' | 'rule' | 'prohibited_term';
  field?: string;
  language?: string;
  before?: string;
  after?: string;
  rule?: string;
  journalName?: string;
  submittedBy: string;
  submittedAt: string;
}

/** Admin-only list of pending learning proposals with approve / reject. */
export const PlaybookProposalsPanel: React.FC = () => {
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = async () => {
    try {
      const res = await apiFetch('/api/playbook/proposals?status=pending');
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not load proposals');
      setProposals(data.proposals || []);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load proposals');
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const decide = async (id: string, decision: 'approve' | 'reject') => {
    setBusy(id);
    try {
      const res = await apiFetch(`/api/playbook/proposals/${encodeURIComponent(id)}/decision`, {
        method: 'POST',
        body: JSON.stringify({ decision }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not save the decision');
      setProposals((list) => list.filter((p) => p.id !== id));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save the decision');
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="p-3 border border-slate-200 rounded-xl text-xs space-y-2">
      <div className="font-bold text-slate-900">Suggested rules from users ({proposals.length} waiting)</div>
      {error && <div className="text-rose-700">{error}</div>}
      {proposals.length === 0 && !error && <div className="text-slate-500">Nothing to review.</div>}
      {proposals.map((p) => (
        <div key={p.id} className="p-2 bg-slate-50 rounded-lg border border-slate-200">
          <div className="text-[10px] text-slate-500">
            {p.kind === 'copy_edit' ? 'Copy edit' : p.kind === 'rule' ? 'New rule' : 'Banned term'} · {p.submittedBy}
            {p.journalName ? ` · ${p.journalName}` : ''}
            {p.language ? ` · ${p.language}` : ''}
          </div>
          {p.kind === 'copy_edit' ? (
            <div>
              <span className="line-through text-slate-500">{p.before}</span> → <span className="font-semibold">{p.after}</span>
            </div>
          ) : (
            <div className="font-semibold">{p.rule}</div>
          )}
          <div className="mt-1 flex gap-2">
            <button disabled={busy === p.id} onClick={() => decide(p.id, 'approve')} className="px-2 py-0.5 rounded bg-emerald-600 text-white">
              Approve
            </button>
            <button disabled={busy === p.id} onClick={() => decide(p.id, 'reject')} className="px-2 py-0.5 rounded bg-slate-200">
              Reject
            </button>
          </div>
        </div>
      ))}
    </div>
  );
};
