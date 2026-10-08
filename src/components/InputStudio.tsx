import React, { useState, useEffect } from 'react';
import {
  Link as LinkIcon,
  Search,
  CheckCircle,
  AlertCircle,
  HelpCircle,
  Edit3,
  Check,
  ChevronDown,
  ChevronUp,
  Sparkles,
  Sliders,
  Layers,
  Globe2,
  CheckSquare,
  Square,
  ShieldCheck,
  Award,
  Clock,
  Compass,
  FileCheck,
  RotateCcw,
  RefreshCw,
  PlusCircle,
  AlertTriangle,
} from 'lucide-react';
import {
  StageCode,
  STAGE_CONFIGS,
  ClarivateJournalMetrics,
  OutputLanguage,
  normalizeStage,
} from '../types';
import { JOURNAL_CATALOG } from '../data/journalCatalog';
import { pickEditableJournalFacts } from '../utils/editableJournalFacts';
import { journalUrlsMatch, normalizeJournalUrl } from '../utils/journalUrl';
import { factCacheLine, factSourceCopy, factSourceKind, metricCaption, shownFigure } from '../utils/factSourceLabel';

interface Props {
  landingPageUrl: string;
  onChangeUrl: (url: string) => void;
  selectedChannels: { search: boolean; display: boolean };
  onChangeChannels: (channels: { search: boolean; display: boolean }) => void;
  funnelStage: StageCode;
  onChangeFunnel: (stage: StageCode) => void;
  outputLanguage: OutputLanguage;
  onChangeOutputLanguage: (lang: OutputLanguage) => void;
  clarivateFacts: ClarivateJournalMetrics | null;
  onUpdateClarivateFacts?: (facts: ClarivateJournalMetrics) => void;
  onFetchFacts: (url: string, forceRefresh?: boolean) => void;
  onGenerate: () => void;
  onOpenPlaybook?: () => void;
  onOpenCompareStages?: () => void;
  onOpenAddJournal?: () => void;
  hasCustomPlaybook?: boolean;
  isLoading: boolean;
  isFetchingFacts: boolean;
}

const JOURNAL_TAGS: Record<string, string> = {
  'https://www.nature.com': 'Flagship',
  'https://www.nature.com/aps': 'Pharmacology',
  'https://www.nature.com/cr': 'Cell biology',
  'https://www.nature.com/ncomms': 'Gold OA',
  'https://www.nature.com/srep': 'Gold OA',
  'https://www.nature.com/onc': 'Oncology',
  'https://bmcbiol.biomedcentral.com': 'BMC',
};

const POPULAR_JOURNALS = JOURNAL_CATALOG.map((journal) => ({
  name: journal.journalName,
  url: journal.url,
  tag: JOURNAL_TAGS[journal.url] || journal.publisher,
}));

const INLINE_METRIC_FIELDS = ['journalName', 'impactFactor', 'casZone', 'firstDecisionDays'] as const;

function sameMetricValue(left: unknown, right: unknown): boolean {
  if (left == null && right == null) return true;
  return Object.is(left, right);
}

function inlineMetricsChanged(
  original: ClarivateJournalMetrics,
  edited: ClarivateJournalMetrics
): boolean {
  return INLINE_METRIC_FIELDS.some((field) => !sameMetricValue(original[field], edited[field]));
}

export const InputStudio: React.FC<Props> = ({
  landingPageUrl,
  onChangeUrl,
  selectedChannels,
  onChangeChannels,
  funnelStage,
  onChangeFunnel,
  outputLanguage,
  onChangeOutputLanguage,
  clarivateFacts,
  onUpdateClarivateFacts,
  onFetchFacts,
  onGenerate,
  onOpenPlaybook,
  onOpenCompareStages,
  onOpenAddJournal,
  hasCustomPlaybook,
  isLoading,
  isFetchingFacts,
}) => {
  const [isEditingMetrics, setIsEditingMetrics] = useState(false);
  const [showAdvancedMetrics, setShowAdvancedMetrics] = useState(false);
  const [editedFacts, setEditedFacts] = useState<ClarivateJournalMetrics | null>(null);
  const [editError, setEditError] = useState<string | null>(null);

  useEffect(() => {
    if (clarivateFacts) {
      setEditedFacts(clarivateFacts);
    }
  }, [clarivateFacts]);

  // Debounced auto-fetch on URL change
  useEffect(() => {
    const trimmed = landingPageUrl.trim();
    if (!trimmed) return;
    const timer = setTimeout(() => {
      onFetchFacts(trimmed);
    }, 650);
    return () => clearTimeout(timer);
  }, [landingPageUrl]);

  const handleSelectQuickJournal = (url: string) => {
    onChangeUrl(url);
    onFetchFacts(url);
  };

  const closeMetricsEditor = () => {
    setIsEditingMetrics(false);
    setEditError(null);
    if (clarivateFacts) setEditedFacts(clarivateFacts);
  };

  const handleSaveMetrics = () => {
    if (!editedFacts || !clarivateFacts || !onUpdateClarivateFacts) return;
    if (!inlineMetricsChanged(clarivateFacts, editedFacts)) {
      closeMetricsEditor();
      return;
    }
    const year = editedFacts.jcrYear;
    if (typeof year !== 'number' || !Number.isInteger(year) || year < 1900 || year > 2100) {
      setEditError('Enter the JCR year for the metrics you changed.');
      return;
    }
    setEditError(null);
    onUpdateClarivateFacts(pickEditableJournalFacts({
      ...editedFacts,
      verificationStatus: 'user_provided',
      provenanceSource: 'user_provided',
      isVerifiedClarivate: false,
      sourceAttribution: 'Manually entered (unverified)',
      reportingYear: `JCR ${year}`,
      jcrYear: year,
      missingFields: [],
    }));
    setIsEditingMetrics(false);
  };

  const currentStageNormalized = normalizeStage(funnelStage);
  const stages: StageCode[] = ['AWA', 'CON', 'DEC'];
  const sourceKind = factSourceKind(clarivateFacts);
  const sourceCopy = factSourceCopy(sourceKind);
  const noChannelSelected = !selectedChannels.search && !selectedChannels.display;
  const channelSummary = selectedChannels.search && selectedChannels.display
    ? 'Search ads and display ads'
    : selectedChannels.search
      ? 'Search ads only'
      : selectedChannels.display
        ? 'Display ads only'
        : 'No channel selected';

  // Check if metrics are missing
  const isMissingMetrics = clarivateFacts?.verificationStatus === 'missing';

  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-5 sm:p-7 shadow-xs space-y-6">
      {/* ─────────────────────────────────────────────────────────────
          STEP 1: JOURNAL & SOURCE-VERIFIED FACTS
         ───────────────────────────────────────────────────────────── */}
      <section className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="w-6 h-6 rounded-full bg-[#002d62] text-white flex items-center justify-center text-xs font-bold">
              1
            </span>
            <h2 className="text-xs font-bold uppercase tracking-wider text-slate-800">
              Journal page
            </h2>
          </div>

          <div className="flex items-center gap-2 text-xs">
            {onOpenAddJournal && (
              <button
                type="button"
                onClick={onOpenAddJournal}
                className="flex items-center gap-1.5 px-3 py-1 bg-white hover:bg-slate-50 border border-slate-300 rounded-lg text-slate-700 font-semibold shadow-2xs transition"
              >
                <PlusCircle className="w-3.5 h-3.5 text-blue-600" />
                <span>Type the figures</span>
              </button>
            )}

            {onOpenPlaybook && (
              <button
                type="button"
                onClick={onOpenPlaybook}
                className={`flex items-center gap-1 px-3 py-1 rounded-lg border font-semibold transition ${
                  hasCustomPlaybook
                    ? 'bg-indigo-50 border-indigo-300 text-indigo-800'
                    : 'bg-white border-slate-300 text-slate-600 hover:bg-slate-50'
                }`}
              >
                <Sliders className="w-3.5 h-3.5 text-indigo-600" />
                <span>Writing rules</span>
                {hasCustomPlaybook && <span className="w-1.5 h-1.5 rounded-full bg-indigo-600 ml-0.5" />}
              </button>
            )}
          </div>
        </div>

        <p className="text-xs text-slate-500 -mt-1">
          Paste the journal page the ads should use. Nothing is filled in until you do.
        </p>

        <div className="flex flex-col sm:flex-row gap-2">
          <div className="relative flex-1">
            <LinkIcon className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              id="journal-url"
              type="text"
              value={landingPageUrl}
              onChange={(e) => onChangeUrl(e.target.value)}
              aria-label="Journal page"
              placeholder="Paste a journal page, such as https://www.nature.com/ncomms"
              className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-xs sm:text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600 transition"
            />
          </div>

          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => onFetchFacts(landingPageUrl)}
              disabled={isFetchingFacts || !landingPageUrl.trim()}
              className="px-4 py-2.5 bg-white hover:bg-slate-50 text-slate-800 border border-slate-300 rounded-xl text-xs font-bold shadow-2xs transition flex items-center justify-center gap-1.5 disabled:opacity-50"
            >
              {isFetchingFacts ? (
                <>
                  <div className="w-3.5 h-3.5 border-2 border-slate-400 border-t-slate-800 rounded-full animate-spin" />
                  <span>Looking up…</span>
                </>
              ) : (
                <>
                  <Search className="w-3.5 h-3.5 text-blue-600" />
                  <span>Look up this page</span>
                </>
              )}
            </button>

            <button
              type="button"
              onClick={() => onFetchFacts(landingPageUrl, true)}
              disabled={isFetchingFacts || !landingPageUrl.trim()}
              className="px-3 py-2.5 bg-white hover:bg-slate-50 text-slate-700 border border-slate-300 rounded-xl text-xs font-semibold shadow-2xs transition flex items-center gap-1.5 disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isFetchingFacts ? 'animate-spin' : ''}`} />
              <span>Look up again</span>
            </button>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-1.5 pt-1 text-xs">
          <span className="text-slate-400 font-medium text-[11px]">Or choose a journal:</span>
          {POPULAR_JOURNALS.map((j) => (
            <button
              key={j.url}
              type="button"
              onClick={() => handleSelectQuickJournal(j.url)}
              className={`px-2.5 py-1 rounded-lg border text-xs transition flex items-center gap-1.5 ${
                journalUrlsMatch(normalizeJournalUrl(landingPageUrl), normalizeJournalUrl(j.url))
                  ? 'bg-blue-50 text-blue-900 border-blue-300 font-semibold'
                  : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
              }`}
            >
              <span>{j.name}</span>
              <span className="text-[10px] text-slate-500">{j.tag}</span>
            </button>
          ))}
        </div>

        {/* BLOCKING ALERT: MISSING METRICS DETECTED */}
        {isMissingMetrics && clarivateFacts && (
          <div className="p-4 rounded-xl bg-amber-50/80 border border-amber-300 text-amber-950 space-y-3 text-xs">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 font-bold text-amber-900">
                <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                <span>These figures are missing</span>
              </div>
              <span className="bg-amber-200 text-amber-800 text-[10px] font-bold px-2 py-0.5 rounded">
                Ads are paused
              </span>
            </div>

            <p className="text-amber-800 leading-relaxed">
              No trusted metric record exists for <strong>"{clarivateFacts.journalName}"</strong>.
              Campaign generation stays blocked, and the app will not fill in an impact factor, quartile, review time, or fee.
              Add the values manually if you want them in the ads.
            </p>

            {/* Badges for missing metrics */}
            <div className="flex flex-wrap gap-2 pt-1">
              {['Impact Factor (IF)', 'CAS Zone (中科院分区)', 'First Decision Time', 'APC Publishing Fee'].map(
                (metric, idx) => (
                  <span
                    key={idx}
                    className="px-2.5 py-1 rounded-md bg-white border border-rose-300 text-rose-700 font-semibold text-[11px] flex items-center gap-1 shadow-2xs"
                  >
                    <AlertCircle className="w-3 h-3 text-rose-500" />
                    <span>{metric}: Missing</span>
                  </span>
                )
              )}
            </div>

            <div className="flex items-center gap-2 pt-2">
              <button
                type="button"
                onClick={onOpenAddJournal || (() => setIsEditingMetrics(true))}
                className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white font-bold rounded-lg transition flex items-center gap-1.5 shadow-xs"
              >
                <PlusCircle className="w-3.5 h-3.5" />
                <span>Enter the figures</span>
              </button>
              <button
                type="button"
                onClick={() => setIsEditingMetrics(true)}
                className="px-3 py-2 bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 rounded-lg font-medium transition"
              >
                Edit on this page
              </button>
            </div>
          </div>
        )}

        {/* Verified Facts Card with Progressive Disclosure */}
        {clarivateFacts && !isMissingMetrics && (
          <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-3 text-xs">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2 border-b border-slate-200">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-[#002d62] text-white flex items-center justify-center font-bold text-xs shrink-0">
                  {(clarivateFacts.journalName || 'J').slice(0, 2)}
                </div>
                <div>
                  <div className="font-bold text-slate-900 text-sm flex flex-wrap items-center gap-2">
                    <span>{clarivateFacts.journalName}</span>
                    <span className="text-[11px] font-normal px-2 py-0.5 rounded-full bg-slate-200 text-slate-700">
                      {clarivateFacts.publisher}
                    </span>
                    {/* Provenance Badge */}
                    <span
                      className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                        sourceKind === 'clarivate'
                          ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                          : sourceKind === 'website' || sourceKind === 'entered'
                          ? 'bg-blue-100 text-blue-800 border border-blue-300'
                          : 'bg-amber-100 text-amber-800 border border-amber-300'
                      }`}
                    >
                      {sourceCopy.badge}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-600 leading-relaxed mt-1">{sourceCopy.detail}</p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setShowAdvancedMetrics(!showAdvancedMetrics)}
                  className="text-xs text-slate-600 hover:text-slate-900 font-medium flex items-center gap-1"
                >
                  <span>{showAdvancedMetrics ? 'Hide scope' : 'Show scope'}</span>
                  {showAdvancedMetrics ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (isEditingMetrics) closeMetricsEditor();
                    else setIsEditingMetrics(true);
                  }}
                  className="text-xs text-blue-700 hover:text-blue-900 font-semibold flex items-center gap-1"
                >
                  <Edit3 className="w-3.5 h-3.5" />
                  <span>{isEditingMetrics ? 'Cancel' : 'Edit figures'}</span>
                </button>
              </div>
            </div>

            {/* Read-Only Metric Highlights */}
            {!isEditingMetrics ? (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                <div className="bg-white p-2.5 rounded-lg border border-slate-200">
                  <span className="text-[10px] text-slate-400 font-semibold uppercase block">Impact factor</span>
                  <div className="text-base font-extrabold text-slate-900 flex items-center gap-1.5">
                    <span>{shownFigure(clarivateFacts.impactFactor, sourceKind)}</span>
                    {clarivateFacts.jcrQuartile && (
                      <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border ${
                        sourceCopy.impactFactorIsClarivate
                          ? 'text-emerald-700 bg-emerald-50 border-emerald-200'
                          : 'text-slate-600 bg-slate-100 border-slate-200'
                      }`}>
                        {clarivateFacts.jcrQuartile}
                      </span>
                    )}
                  </div>
                  <span className="text-[10px] text-slate-400 block">
                    5-year: {shownFigure(clarivateFacts.fiveYearImpactFactor, sourceKind)}
                  </span>
                  <span className="text-[10px] text-slate-500 block mt-1 leading-snug">{metricCaption(sourceKind, 'impact')}</span>
                </div>

                <div className="bg-white p-2.5 rounded-lg border border-slate-200">
                  <span className="text-[10px] text-slate-400 font-semibold uppercase block">CAS zone (中科院)</span>
                  <span className="text-xs font-bold text-slate-900 line-clamp-1">
                    {clarivateFacts.casZone || (sourceKind === 'sample' ? 'Not in this sample' : 'Not stated')}
                  </span>
                  <span className="text-[10px] text-slate-500 block mt-1 leading-snug">{metricCaption(sourceKind, 'other')}</span>
                </div>

                <div className="bg-white p-2.5 rounded-lg border border-slate-200">
                  <span className="text-[10px] text-slate-400 font-semibold uppercase block">First decision</span>
                  <span className="text-sm font-bold text-slate-900">
                    {typeof clarivateFacts.firstDecisionDays === 'number'
                      ? `${clarivateFacts.firstDecisionDays} days`
                      : shownFigure(clarivateFacts.firstDecisionDays, sourceKind)}
                  </span>
                  <span className="text-[10px] text-slate-500 block mt-1 leading-snug">{metricCaption(sourceKind, 'other')}</span>
                </div>

                <div className="bg-white p-2.5 rounded-lg border border-slate-200">
                  <span className="text-[10px] text-slate-400 font-semibold uppercase block">Publishing fee</span>
                  <span className="text-xs font-bold text-slate-900 line-clamp-1">
                    {clarivateFacts.openAccessType || 'Not stated'}
                  </span>
                  <span className="text-[10px] text-slate-500 font-medium block">
                    {typeof clarivateFacts.apcUsd === 'number'
                      ? `Fee: $${clarivateFacts.apcUsd}`
                      : sourceKind === 'sample' ? 'Fee not in this sample' : 'Fee not stated'}
                  </span>
                  <span className="text-[10px] text-slate-500 block mt-1 leading-snug">{metricCaption(sourceKind, 'other')}</span>
                </div>
              </div>
            ) : (
              /* Inline Editable Form */
              <div className="space-y-3 bg-white p-3 rounded-lg border border-blue-200">
                <span className="font-bold text-xs text-slate-800 block">Edit the figures on this page</span>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  <div>
                    <label className="text-[10px] text-slate-500 font-semibold block">Journal Name</label>
                    <input
                      type="text"
                      value={editedFacts?.journalName || ''}
                      onChange={(e) =>
                        setEditedFacts((prev) => (prev ? { ...prev, journalName: e.target.value } : null))
                      }
                      className="w-full text-xs p-1.5 border border-slate-300 rounded bg-slate-50 text-slate-900"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-slate-500 font-semibold block">Impact Factor (IF)</label>
                    <input
                      type="number"
                      step="0.1"
                      value={editedFacts?.impactFactor || ''}
                      onChange={(e) =>
                        setEditedFacts((prev) =>
                          prev ? { ...prev, impactFactor: parseFloat(e.target.value) || null } : null
                        )
                      }
                      className="w-full text-xs p-1.5 border border-slate-300 rounded bg-slate-50 text-slate-900 font-bold"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-slate-500 font-semibold block">CAS Zone (中科院分区)</label>
                    <input
                      type="text"
                      value={editedFacts?.casZone || ''}
                      onChange={(e) =>
                        setEditedFacts((prev) => (prev ? { ...prev, casZone: e.target.value } : null))
                      }
                      className="w-full text-xs p-1.5 border border-slate-300 rounded bg-slate-50 text-slate-900"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-slate-500 font-semibold block">1st Decision (Days)</label>
                    <input
                      type="number"
                      value={editedFacts?.firstDecisionDays || ''}
                      onChange={(e) =>
                        setEditedFacts((prev) =>
                          prev ? { ...prev, firstDecisionDays: parseInt(e.target.value) || null } : null
                        )
                      }
                      className="w-full text-xs p-1.5 border border-slate-300 rounded bg-slate-50 text-slate-900"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-slate-500 font-semibold block">JCR year</label>
                    <input
                      type="number"
                      inputMode="numeric"
                      placeholder="2024"
                      value={editedFacts?.jcrYear ?? ''}
                      onChange={(e) => {
                        const raw = e.target.value.trim();
                        const year = raw === '' ? undefined : Number(raw);
                        setEditedFacts((prev) => (
                          prev ? { ...prev, jcrYear: year !== undefined && Number.isFinite(year) ? year : undefined } : null
                        ));
                      }}
                      className="w-full text-xs p-1.5 border border-slate-300 rounded bg-slate-50 text-slate-900"
                    />
                  </div>
                </div>
                <p className="text-[10px] text-slate-500">
                  Required only when you change a metric. An unchanged record keeps its original source.
                </p>
                {editError && (
                  <p className="text-[11px] text-rose-700">{editError}</p>
                )}
                <div className="flex justify-end gap-2 pt-1">
                  <button
                    type="button"
                    onClick={closeMetricsEditor}
                    className="px-2.5 py-1 text-xs text-slate-600 hover:bg-slate-100 rounded"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleSaveMetrics}
                    className="px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded flex items-center gap-1"
                  >
                    <Check className="w-3.5 h-3.5" />
                    <span>Save these figures</span>
                  </button>
                </div>
              </div>
            )}

            {/* Cache indicator */}
            <div className="flex items-center justify-between text-[11px] text-slate-500 pt-1 border-t border-slate-200/60">
              <div className="flex items-center gap-1.5">
                <Clock className="w-3 h-3 text-slate-400" />
                <span>{factCacheLine(clarivateFacts)}</span>
              </div>
            </div>

            {/* Progressive Disclosure: Scope & Indexing details */}
            {showAdvancedMetrics && (
              <div className="pt-2 border-t border-slate-200 space-y-1.5 text-[11px] text-slate-600">
                <p>
                  <strong>Aims &amp; Scope Summary:</strong> {clarivateFacts.aimsAndScopeSummary}
                </p>
                <div className="flex flex-wrap items-center gap-4 text-slate-500">
                  <span>
                    Indexing: <strong>{clarivateFacts.indexing?.length ? clarivateFacts.indexing.join(', ') : 'Not stated'}</strong>
                  </span>
                  <span>
                    Discipline: <strong>{clarivateFacts.primaryDiscipline}</strong>
                  </span>
                  <span>
                    Reporting Period: <strong>{clarivateFacts.reportingYear || 'JCR 2024'}</strong>
                  </span>
                </div>
              </div>
            )}
          </div>
        )}
      </section>

      {/* ─────────────────────────────────────────────────────────────
          STEP 2: AUDIENCE STAGE, CHANNELS & LANGUAGE
         ───────────────────────────────────────────────────────────── */}
      <section className="space-y-4 pt-2 border-t border-slate-200">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="w-6 h-6 rounded-full bg-[#002d62] text-white flex items-center justify-center text-xs font-bold">
              2
            </span>
            <h2 className="text-xs font-bold uppercase tracking-wider text-slate-800">
              Stage and channels
            </h2>
          </div>

          {onOpenCompareStages && (
            <button
              type="button"
              onClick={onOpenCompareStages}
              className="text-xs font-bold text-blue-700 hover:text-blue-900 bg-blue-50 hover:bg-blue-100 px-3 py-1.5 rounded-xl border border-blue-200 transition flex items-center gap-1.5 self-start sm:self-auto"
            >
              <Compass className="w-3.5 h-3.5 text-blue-600" />
              <span>Compare the three stages</span>
            </button>
          )}
        </div>

        <p className="text-xs text-slate-500">
          Choose the stage the author is in. This changes the message, the button in the ad, and the page the ad opens. Choosing a stage does not write the ads until you generate them.
        </p>

        {/* Rich Selectable Cards for AWA, CON, DEC */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {stages.map((st) => {
            const cfg = STAGE_CONFIGS[st];
            const isSelected = currentStageNormalized === st;

            return (
              <button
                key={st}
                type="button"
                onClick={() => onChangeFunnel(st)}
                className={`p-4 rounded-xl border text-left transition flex flex-col justify-between gap-2 ${
                  isSelected
                    ? 'bg-blue-50/70 border-blue-600 ring-2 ring-blue-500/20 shadow-xs'
                    : 'bg-slate-50/60 border-slate-200 text-slate-700 hover:bg-slate-100/80 hover:border-slate-300'
                }`}
              >
                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <span
                      className={`text-sm font-bold ${
                        isSelected ? 'text-blue-950' : 'text-slate-800'
                      }`}
                    >
                      {cfg.shortLabel}
                    </span>
                    <span
                      className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                        isSelected
                          ? 'bg-blue-600 text-white'
                          : 'bg-slate-200 text-slate-600'
                      }`}
                    >
                      {isSelected ? 'Chosen' : 'Choose'}
                    </span>
                  </div>

                  <div className="text-[11px] text-slate-600 italic bg-white p-2 rounded-lg border border-slate-200/80 leading-relaxed">
                    {cfg.authorMindset}
                  </div>
                </div>

                <div className="pt-2 border-t border-slate-200/70 text-[11px] text-slate-500">
                  Button in the ad: <strong className="text-slate-800">"{cfg.exampleCtas[0]}"</strong>
                </div>
              </button>
            );
          })}
        </div>

        {/* Ad Channels & Output Language Row */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
          {/* Ad Channels */}
          <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-600 block">
              Where the ads run
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() =>
                  onChangeChannels({ ...selectedChannels, search: !selectedChannels.search })
                }
                className={`flex-1 p-2 rounded-lg border text-xs transition flex items-center gap-2 ${
                  selectedChannels.search
                    ? 'bg-white border-blue-600 text-blue-950 font-bold shadow-2xs'
                    : 'bg-slate-100 border-slate-200 text-slate-600'
                }`}
              >
                {selectedChannels.search ? (
                  <CheckSquare className="w-4 h-4 text-blue-600 shrink-0" />
                ) : (
                  <Square className="w-4 h-4 text-slate-400 shrink-0" />
                )}
                <span className="text-left leading-tight">
                  <span className="block">Search ads</span>
                  <span className="block text-[10px] font-normal text-slate-500">15 headlines, 4 descriptions</span>
                </span>
              </button>

              <button
                type="button"
                onClick={() =>
                  onChangeChannels({ ...selectedChannels, display: !selectedChannels.display })
                }
                className={`flex-1 p-2 rounded-lg border text-xs transition flex items-center gap-2 ${
                  selectedChannels.display
                    ? 'bg-white border-blue-600 text-blue-950 font-bold shadow-2xs'
                    : 'bg-slate-100 border-slate-200 text-slate-600'
                }`}
              >
                {selectedChannels.display ? (
                  <CheckSquare className="w-4 h-4 text-blue-600 shrink-0" />
                ) : (
                  <Square className="w-4 h-4 text-slate-400 shrink-0" />
                )}
                <span className="text-left leading-tight">
                  <span className="block">Display ads</span>
                  <span className="block text-[10px] font-normal text-slate-500">Banners on other sites</span>
                </span>
              </button>
            </div>
          </div>

          {/* Output Language Selector */}
          <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-600 block">
              Language
            </span>
            <div className="flex items-center gap-1.5">
              {[
                { id: 'all', label: 'English and Chinese' },
                { id: 'EN', label: 'English only' },
                { id: 'ZH', label: 'Chinese only' },
              ].map((lang) => (
                <button
                  key={lang.id}
                  type="button"
                  onClick={() => onChangeOutputLanguage(lang.id as OutputLanguage)}
                  className={`flex-1 py-2 px-2 rounded-lg border text-xs transition font-semibold text-center ${
                    outputLanguage === lang.id
                      ? 'bg-white border-blue-600 text-blue-950 shadow-2xs'
                      : 'bg-slate-100 border-slate-200 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  {lang.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ─────────────────────────────────────────────────────────────
          STEP 3: GENERATE, REVIEW & EXPORT
         ───────────────────────────────────────────────────────────── */}
      <section className="pt-2 border-t border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="w-6 h-6 rounded-full bg-[#002d62] text-white flex items-center justify-center text-xs font-bold">
            3
          </span>
          <div>
            <span className="text-xs font-bold uppercase tracking-wider text-slate-800 block">Write the ads</span>
            <span className="text-xs text-slate-600">
              {STAGE_CONFIGS[currentStageNormalized].shortLabel} · {channelSummary}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {!landingPageUrl.trim() && (
            <span className="text-xs text-slate-500">Paste a journal page first.</span>
          )}
          {noChannelSelected && landingPageUrl.trim() && (
            <span className="text-xs font-medium text-amber-700">Choose search ads, display ads, or both.</span>
          )}
          {isMissingMetrics && (
            <span className="text-xs font-medium text-amber-700 bg-amber-50 px-2.5 py-1 rounded-lg border border-amber-200">
              Enter the journal figures before generating.
            </span>
          )}

          <button
            type="button"
            onClick={onGenerate}
            disabled={isLoading || !landingPageUrl.trim() || isMissingMetrics || noChannelSelected}
            className="w-full sm:w-auto px-6 py-2.5 bg-[#002d62] hover:bg-[#00224a] text-white text-xs font-bold rounded-xl shadow transition flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isLoading ? (
              <>
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                <span>Writing the ads…</span>
              </>
            ) : (
              <>
                <Sparkles className="w-4 h-4 text-sky-300" />
                <span>Generate campaign</span>
              </>
            )}
          </button>
        </div>
      </section>
    </div>
  );
};
