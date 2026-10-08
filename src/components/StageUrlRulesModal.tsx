import React, { useEffect, useState } from 'react';
import { ArrowDown, ArrowUp, Sliders, X } from 'lucide-react';
import { StageCode, STAGE_CONFIGS } from '../types';
import { apiFetch } from '../auth/api';
import {
  STAGE_URL_ROLES,
  STAGE_URL_ROLE_LABELS,
  isStageUrlRole,
  parseStageUrlPattern,
  stageUrlPatternLabel,
  type StageUrlRules,
} from '../utils/stageUrlRules';

interface Props {
  isOpen: boolean;
  rules: StageUrlRules;
  saved: boolean;
  onClose: () => void;
  onSaved: (rules: StageUrlRules, saved: boolean) => void;
}

const STAGES: StageCode[] = ['AWA', 'CON', 'DEC'];

function copyRules(rules: StageUrlRules): StageUrlRules {
  return { AWA: [...rules.AWA], CON: [...rules.CON], DEC: [...rules.DEC] };
}

export const StageUrlRulesModal: React.FC<Props> = ({ isOpen, rules, saved, onClose, onSaved }) => {
  const [draft, setDraft] = useState<StageUrlRules>(() => copyRules(rules));
  const [patternDraft, setPatternDraft] = useState<Record<StageCode, string>>({ AWA: '', CON: '', DEC: '' });
  const [roleDraft, setRoleDraft] = useState<Record<StageCode, string>>({
    AWA: 'journal-home',
    CON: 'aims-and-scope',
    DEC: 'submission-portal',
  });
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setDraft(copyRules(rules));
    setError(null);
    setNotice(saved ? 'These saved patterns are what the next suggestion uses.' : null);
  }, [isOpen, rules, saved]);

  if (!isOpen) return null;

  const move = (stage: StageCode, index: number, delta: number) => {
    setDraft((current) => {
      const list = [...current[stage]];
      const target = index + delta;
      if (target < 0 || target >= list.length) return current;
      const [item] = list.splice(index, 1);
      list.splice(target, 0, item);
      return { ...current, [stage]: list };
    });
    setNotice(null);
  };

  const remove = (stage: StageCode, index: number) => {
    setDraft((current) => ({
      ...current,
      [stage]: current[stage].filter((_, itemIndex) => itemIndex !== index),
    }));
    setNotice(null);
  };

  const addPattern = (stage: StageCode, raw: string) => {
    const pattern = parseStageUrlPattern(raw);
    if (!pattern) {
      setError('Enter a page role or a path pattern such as submit or research-articles. A full URL is not a pattern.');
      return;
    }
    if (draft[stage].includes(pattern)) {
      setError(`${stageUrlPatternLabel(pattern)} is already in this list.`);
      return;
    }
    setError(null);
    setNotice(null);
    setDraft((current) => ({ ...current, [stage]: [...current[stage], pattern] }));
  };

  const save = async (body: { rules: StageUrlRules } | { reset: true }) => {
    setPending(true);
    setError(null);
    try {
      const res = await apiFetch('/api/admin/stage-url-rules', {
        method: 'PUT',
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.rules) {
        setError(data.error || 'Could not save the page patterns.');
        return;
      }
      onSaved(data.rules, Boolean(data.saved));
      setDraft(copyRules(data.rules));
      setNotice(data.saved ? 'Saved. The next suggestion uses this order.' : 'Reset to the built-in defaults.');
    } catch {
      setError('Could not save the page patterns.');
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs">
      <div
        id="stage-url-rules-dialog"
        role="dialog"
        aria-labelledby="stage-url-rules-title"
        className="bg-white rounded-2xl max-w-2xl w-full border border-slate-200 shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
      >
        <div className="p-5 border-b border-slate-200 flex items-center justify-between bg-slate-50">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-[#002d62] text-white flex items-center justify-center">
              <Sliders className="w-4 h-4" />
            </div>
            <div>
              <h3 id="stage-url-rules-title" className="text-sm font-bold text-slate-900">
                Stage page patterns
              </h3>
              <p className="text-[11px] text-slate-500">
                {saved ? 'Using saved patterns.' : 'Using the built-in defaults until you save a change.'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-lg hover:bg-slate-200 text-slate-400 hover:text-slate-700 transition"
            aria-label="Close page patterns"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 overflow-y-auto space-y-5">
          <p className="text-xs text-slate-600 leading-relaxed">
            For each funnel stage, list the page roles or path patterns to try first. A pattern only ranks a link
            already on the fetched journal page, or that journal&apos;s known landing URL. If none match, the suggestion
            says so and does not guess a path.
          </p>

          {STAGES.map((stage) => (
            <section key={stage} className="space-y-2" aria-labelledby={`stage-rules-${stage}`}>
              <h4 id={`stage-rules-${stage}`} className="text-xs font-bold uppercase tracking-wider text-slate-800">
                {STAGE_CONFIGS[stage].shortLabel}
              </h4>
              {draft[stage].length === 0 ? (
                <p className="text-[11px] text-slate-500">No patterns. This stage will say that nothing matched.</p>
              ) : (
                <ol className="space-y-1.5">
                  {draft[stage].map((pattern, index) => (
                    <li
                      key={`${stage}-${pattern}`}
                      id={`stage-pattern-${stage}-${index}`}
                      className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-2 py-1.5"
                    >
                      <span className="text-[10px] font-bold text-slate-400 w-4">{index + 1}</span>
                      <span className="flex-1 text-xs text-slate-800">
                        {stageUrlPatternLabel(pattern)}
                        {!isStageUrlRole(pattern) && (
                          <span className="ml-2 text-[10px] uppercase tracking-wide text-slate-400">Path</span>
                        )}
                      </span>
                      <button
                        type="button"
                        id={`move-up-${stage}-${index}`}
                        onClick={() => move(stage, index, -1)}
                        disabled={index === 0}
                        className="p-1 rounded text-slate-500 hover:bg-white disabled:opacity-30"
                        aria-label={`Move ${stageUrlPatternLabel(pattern)} up`}
                      >
                        <ArrowUp className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        id={`move-down-${stage}-${index}`}
                        onClick={() => move(stage, index, 1)}
                        disabled={index === draft[stage].length - 1}
                        className="p-1 rounded text-slate-500 hover:bg-white disabled:opacity-30"
                        aria-label={`Move ${stageUrlPatternLabel(pattern)} down`}
                      >
                        <ArrowDown className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => remove(stage, index)}
                        className="text-[11px] font-semibold text-slate-500 hover:text-rose-700 px-1"
                      >
                        Remove
                      </button>
                    </li>
                  ))}
                </ol>
              )}
              <div className="flex flex-col sm:flex-row gap-2">
                <select
                  id={`add-role-${stage}`}
                  value={roleDraft[stage]}
                  onChange={(event) => setRoleDraft((current) => ({ ...current, [stage]: event.target.value }))}
                  className="flex-1 text-xs border border-slate-300 rounded-lg px-2 py-1.5 bg-white"
                  aria-label={`Page role for ${STAGE_CONFIGS[stage].shortLabel}`}
                >
                  {STAGE_URL_ROLES.map((role) => (
                    <option key={role} value={role}>
                      {STAGE_URL_ROLE_LABELS[role]}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() => addPattern(stage, roleDraft[stage])}
                  className="px-2 py-1.5 text-xs font-semibold border border-slate-300 rounded-lg bg-white hover:bg-slate-50"
                >
                  Add role
                </button>
                <input
                  id={`add-pattern-${stage}`}
                  value={patternDraft[stage]}
                  onChange={(event) => setPatternDraft((current) => ({ ...current, [stage]: event.target.value }))}
                  placeholder="path pattern, e.g. submit"
                  className="flex-1 text-xs border border-slate-300 rounded-lg px-2 py-1.5"
                />
                <button
                  type="button"
                  onClick={() => {
                    const pattern = parseStageUrlPattern(patternDraft[stage]);
                    addPattern(stage, patternDraft[stage]);
                    if (pattern) setPatternDraft((current) => ({ ...current, [stage]: '' }));
                  }}
                  className="px-2 py-1.5 text-xs font-semibold border border-slate-300 rounded-lg bg-white hover:bg-slate-50"
                >
                  Add pattern
                </button>
              </div>
            </section>
          ))}

          {error && (
            <p className="text-xs text-rose-800 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2" role="alert">
              {error}
            </p>
          )}
          {notice && <p className="text-xs text-emerald-800">{notice}</p>}
        </div>

        <div className="p-4 border-t border-slate-200 flex items-center justify-between gap-2 bg-slate-50">
          <button
            type="button"
            id="reset-stage-url-rules"
            disabled={pending}
            onClick={() => save({ reset: true })}
            className="px-3 py-1.5 text-xs font-semibold text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-100 disabled:opacity-60"
          >
            Reset to defaults
          </button>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 text-xs font-semibold text-slate-600"
            >
              Close
            </button>
            <button
              type="button"
              id="save-stage-url-rules"
              disabled={pending}
              onClick={() => save({ rules: draft })}
              className="px-3 py-1.5 text-xs font-bold text-white bg-[#002d62] rounded-lg hover:bg-[#00224a] disabled:opacity-60"
            >
              {pending ? 'Saving…' : 'Save patterns'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
