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
import { journalUrlsMatch, normalizeJournalUrl } from '../utils/journalUrl';

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

  const handleSaveMetrics = () => {
    if (editedFacts && onUpdateClarivateFacts) {
      onUpdateClarivateFacts({
        ...editedFacts,
        verificationStatus: 'user_provided',
        isVerifiedClarivate: false,
        sourceAttribution: 'Manually verified and supplied by user (User Verified)',
        missingFields: [],
      });
      setIsEditingMetrics(false);
    }
  };

  const currentStageNormalized = normalizeStage(funnelStage);
  const stages: StageCode[] = ['AWA', 'CON', 'DEC'];

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
              Journal facts
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
                <span>Add / Edit Journal</span>
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
                <span>Playbook &amp; Skills</span>
                {hasCustomPlaybook && <span className="w-1.5 h-1.5 rounded-full bg-indigo-600 ml-0.5" />}
              </button>
            )}
          </div>
        </div>

        {/* Input bar */}
        <div className="flex flex-col sm:flex-row gap-2">
          <div className="relative flex-1">
            <LinkIcon className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              value={landingPageUrl}
              onChange={(e) => onChangeUrl(e.target.value)}
              placeholder="Paste Springer Nature or Nature Portfolio journal URL..."
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
                  <span>Checking Facts...</span>
                </>
              ) : (
                <>
                  <Search className="w-3.5 h-3.5 text-blue-600" />
                  <span>Fetch Metrics</span>
                </>
              )}
            </button>

            <button
              type="button"
              onClick={() => onFetchFacts(landingPageUrl, true)}
              disabled={isFetchingFacts || !landingPageUrl.trim()}
              title="Force fresh lookup and bypass cache"
              className="p-2.5 bg-white hover:bg-slate-50 text-slate-600 hover:text-slate-900 border border-slate-300 rounded-xl shadow-2xs transition"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isFetchingFacts ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>

        {/* Quick select journals */}
        <div className="flex flex-wrap items-center gap-1.5 pt-1 text-xs">
          <span className="text-slate-400 font-medium text-[11px]">Popular Journals:</span>
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
                <span>Journal Metrics Incomplete — Action Required</span>
              </div>
              <span className="bg-amber-200 text-amber-800 text-[10px] font-bold px-2 py-0.5 rounded">
                Generation Blocked
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
                <span>Supply Metrics Manually</span>
              </button>
              <button
                type="button"
                onClick={() => setIsEditingMetrics(true)}
                className="px-3 py-2 bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 rounded-lg font-medium transition"
              >
                Inline Edit
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
                  <div className="font-bold text-slate-900 text-sm flex items-center gap-2">
                    <span>{clarivateFacts.journalName}</span>
                    <span className="text-[11px] font-normal px-2 py-0.5 rounded-full bg-slate-200 text-slate-700">
                      {clarivateFacts.publisher}
                    </span>
                    {/* Provenance Badge */}
                    <span
                      className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                        clarivateFacts.provenanceSource === 'clarivate_wos_journals_api'
                          ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                          : clarivateFacts.verificationStatus === 'user_provided' ||
                            clarivateFacts.verificationStatus === 'page_sourced'
                          ? 'bg-blue-100 text-blue-800 border border-blue-300'
                          : 'bg-amber-100 text-amber-800 border border-amber-300'
                      }`}
                    >
                      {clarivateFacts.provenanceSource === 'clarivate_wos_journals_api'
                        ? `WOS Journals API${clarivateFacts.jcrYear ? ` JCR ${clarivateFacts.jcrYear}` : ''}`
                        : clarivateFacts.verificationStatus === 'user_provided'
                        ? 'User provided'
                        : clarivateFacts.verificationStatus === 'page_sourced'
                        ? 'Page sourced'
                        : clarivateFacts.verificationStatus === 'catalog_snapshot'
                        ? 'Catalog snapshot'
                        : 'Metrics missing'}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-500">{clarivateFacts.sourceAttribution}</p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setShowAdvancedMetrics(!showAdvancedMetrics)}
                  className="text-xs text-slate-600 hover:text-slate-900 font-medium flex items-center gap-1"
                >
                  <span>{showAdvancedMetrics ? 'Hide Details' : 'View Scope & Details'}</span>
                  {showAdvancedMetrics ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                </button>
                <button
                  type="button"
                  onClick={() => setIsEditingMetrics(!isEditingMetrics)}
                  className="text-xs text-blue-700 hover:text-blue-900 font-semibold flex items-center gap-1"
                >
                  <Edit3 className="w-3.5 h-3.5" />
                  <span>{isEditingMetrics ? 'Cancel Edit' : 'Edit Facts'}</span>
                </button>
              </div>
            </div>

            {/* Read-Only Metric Highlights */}
            {!isEditingMetrics ? (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                <div className="bg-white p-2.5 rounded-lg border border-slate-200">
                  <span className="text-[10px] text-slate-400 font-semibold uppercase block">Impact Factor</span>
                  <div className="text-base font-extrabold text-slate-900 flex items-center gap-1.5">
                    <span>{clarivateFacts.impactFactor || 'N/A'}</span>
                    {clarivateFacts.jcrQuartile && (
                      <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-1.5 py-0.2 rounded border border-emerald-200">
                        {clarivateFacts.jcrQuartile}
                      </span>
                    )}
                  </div>
                  <span className="text-[10px] text-slate-400">
                    5-Yr: {clarivateFacts.fiveYearImpactFactor || 'N/A'}
                  </span>
                </div>

                <div className="bg-white p-2.5 rounded-lg border border-slate-200">
                  <span className="text-[10px] text-slate-400 font-semibold uppercase block">CAS Zone (中科院)</span>
                  <span className="text-xs font-bold text-slate-900 line-clamp-1">
                    {clarivateFacts.casZone || 'Not stated'}
                  </span>
                  <span className="text-[10px] text-slate-400">Chinese Academy of Sciences</span>
                </div>

                <div className="bg-white p-2.5 rounded-lg border border-slate-200">
                  <span className="text-[10px] text-slate-400 font-semibold uppercase block">1st Decision Time</span>
                  <span className="text-sm font-bold text-slate-900">
                    {clarivateFacts.firstDecisionDays ? `${clarivateFacts.firstDecisionDays} Days` : 'N/A'}
                  </span>
                  <span className="text-[10px] text-slate-500 block">Initial editorial review</span>
                </div>

                <div className="bg-white p-2.5 rounded-lg border border-slate-200">
                  <span className="text-[10px] text-slate-400 font-semibold uppercase block">Publishing Model &amp; APC</span>
                  <span className="text-xs font-bold text-slate-900 line-clamp-1">
                    {clarivateFacts.openAccessType || 'Not stated'}
                  </span>
                  <span className="text-[10px] text-slate-500 font-medium">
                    {clarivateFacts.apcUsd
                      ? `APC: $${clarivateFacts.apcUsd}`
                      : 'APC not stated'}
                  </span>
                </div>
              </div>
            ) : (
              /* Inline Editable Form */
              <div className="space-y-3 bg-white p-3 rounded-lg border border-blue-200">
                <span className="font-bold text-xs text-slate-800 block">Override or Verify Journal Metrics:</span>
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
                </div>
                <div className="flex justify-end gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => setIsEditingMetrics(false)}
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
                    <span>Apply Override</span>
                  </button>
                </div>
              </div>
            )}

            {/* Cache indicator */}
            <div className="flex items-center justify-between text-[11px] text-slate-400 pt-1 border-t border-slate-200/60">
              <div className="flex items-center gap-1.5">
                <Clock className="w-3 h-3 text-slate-400" />
                <span>
                  {clarivateFacts.isFromCache
                    ? 'Cached record (refreshed automatically)'
                    : 'Real-time verified source'}
                </span>
                {clarivateFacts.reportingYear && (
                  <span>· {clarivateFacts.reportingYear}</span>
                )}
              </div>
              <button
                type="button"
                onClick={() => onFetchFacts(landingPageUrl, true)}
                className="text-blue-700 hover:underline font-medium"
              >
                Force refresh metrics
              </button>
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
              Audience Stage &amp; Channels
            </h2>
          </div>

          {onOpenCompareStages && (
            <button
              type="button"
              onClick={onOpenCompareStages}
              className="text-xs font-bold text-blue-700 hover:text-blue-900 bg-blue-50 hover:bg-blue-100 px-3 py-1.5 rounded-xl border border-blue-200 transition flex items-center gap-1.5 self-start sm:self-auto"
            >
              <Compass className="w-3.5 h-3.5 text-blue-600" />
              <span>Compare All 3 Stages Side-by-Side</span>
            </button>
          )}
        </div>

        <p className="text-xs text-slate-500">
          Choose what the author needs next. This changes the messaging focus, primary CTA, keyword intent, and recommended destination.
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
                className={`p-4 rounded-xl border text-left transition flex flex-col justify-between gap-3 ${
                  isSelected
                    ? 'bg-blue-50/70 border-blue-600 ring-2 ring-blue-500/20 shadow-xs'
                    : 'bg-slate-50/60 border-slate-200 text-slate-700 hover:bg-slate-100/80 hover:border-slate-300'
                }`}
              >
                <div className="space-y-2">
                  {/* Stage Name & Tag */}
                  <div className="flex items-center justify-between">
                    <span
                      className={`text-xs font-bold ${
                        isSelected ? 'text-blue-950 font-extrabold' : 'text-slate-800'
                      }`}
                    >
                      {cfg.name}
                    </span>
                    <span
                      className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                        isSelected
                          ? 'bg-blue-600 text-white'
                          : 'bg-slate-200 text-slate-600'
                      }`}
                    >
                      {cfg.shortLabel}
                    </span>
                  </div>

                  {/* Author Mindset */}
                  <div className="text-[11px] text-slate-600 italic bg-white p-2 rounded-lg border border-slate-200/80 leading-relaxed">
                    {cfg.authorMindset}
                  </div>

                  {/* Campaign Objective */}
                  <div className="text-[11px] text-slate-700 leading-snug">
                    <span className="font-semibold text-slate-900 block text-[10px] uppercase text-slate-400">
                      Objective:
                    </span>
                    {cfg.campaignObjective}
                  </div>
                </div>

                {/* Example CTA & Destination */}
                <div className="pt-2 border-t border-slate-200/70 flex items-center justify-between text-[11px]">
                  <span className="text-slate-500">
                    CTA: <strong className="text-slate-800">"{cfg.exampleCtas[0]}"</strong>
                  </span>
                  <span
                    className={`font-semibold text-[10px] ${
                      isSelected ? 'text-blue-700' : 'text-slate-400'
                    }`}
                  >
                    {isSelected ? '✓ Selected' : 'Select'}
                  </span>
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
              Google Ad Networks:
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
                <span>Search (15H / 4D)</span>
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
                <span>Display (RDA Banners)</span>
              </button>
            </div>
          </div>

          {/* Output Language Selector */}
          <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-600 block">
              Campaign Language Focus:
            </span>
            <div className="flex items-center gap-1.5">
              {[
                { id: 'all', label: 'Bilingual (EN + ZH)' },
                { id: 'EN', label: 'English Only' },
                { id: 'ZH', label: 'Chinese (中文)' },
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
          <span className="text-xs text-slate-600">
            Generating for <strong>{STAGE_CONFIGS[currentStageNormalized].name}</strong> ·{' '}
            {selectedChannels.search && selectedChannels.display
              ? 'Search & Display'
              : selectedChannels.search
              ? 'Search Only'
              : 'Display Only'}
          </span>
        </div>

        <div className="flex items-center gap-2">
          {isMissingMetrics && (
            <span className="text-xs font-medium text-amber-700 bg-amber-50 px-2.5 py-1 rounded-lg border border-amber-200">
              Please complete journal metrics to continue.
            </span>
          )}

          <button
            type="button"
            onClick={onGenerate}
            disabled={isLoading || !landingPageUrl.trim() || isMissingMetrics}
            className="w-full sm:w-auto px-6 py-2.5 bg-[#002d62] hover:bg-[#00224a] text-white text-xs font-bold rounded-xl shadow transition flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isLoading ? (
              <>
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                <span>Generating Campaign Copy...</span>
              </>
            ) : (
              <>
                <Sparkles className="w-4 h-4 text-sky-300" />
                <span>Generate {STAGE_CONFIGS[currentStageNormalized].shortLabel} Campaign</span>
              </>
            )}
          </button>
        </div>
      </section>
    </div>
  );
};
