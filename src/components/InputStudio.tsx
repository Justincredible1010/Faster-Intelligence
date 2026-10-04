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
} from 'lucide-react';
import {
  StageCode,
  STAGE_CONFIGS,
  ClarivateJournalMetrics,
  OutputLanguage,
  normalizeStage,
} from '../types';

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
  onFetchFacts: (url: string) => void;
  onGenerate: () => void;
  onOpenPlaybook?: () => void;
  onOpenCompareStages?: () => void;
  hasCustomPlaybook?: boolean;
  isLoading: boolean;
  isFetchingFacts: boolean;
}

const POPULAR_JOURNALS = [
  { name: 'Nature', url: 'https://www.nature.com/nature', ifValue: 50.5, tag: 'Flagship' },
  { name: 'Acta Pharmacologica Sinica (APS)', url: 'https://www.nature.com/aps', ifValue: 6.9, tag: 'CAS 1区' },
  { name: 'Cell Research', url: 'https://www.nature.com/cr', ifValue: 44.1, tag: 'CAS 1区' },
  { name: 'Nature Communications', url: 'https://www.nature.com/ncomms', ifValue: 14.7, tag: 'Gold OA' },
  { name: 'Scientific Reports', url: 'https://www.nature.com/srep', ifValue: 3.8, tag: 'Gold OA' },
  { name: 'STTT', url: 'https://www.nature.com/sttt', ifValue: 40.8, tag: 'CAS 1区' },
  { name: 'Discover Oncology', url: 'https://link.springer.com/journal/12672', ifValue: 3.4, tag: 'Springer' },
];

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

  const handleSaveMetrics = () => {
    if (editedFacts && onUpdateClarivateFacts) {
      onUpdateClarivateFacts({
        ...editedFacts,
        verificationStatus: 'user_provided',
        sourceAttribution: 'User-Provided & Verified in Campaign Studio',
      });
    }
    setIsEditingMetrics(false);
  };

  const handleSelectQuickJournal = (url: string) => {
    onChangeUrl(url);
    onFetchFacts(url);
  };

  const currentStageNormalized = normalizeStage(funnelStage);
  const stages: StageCode[] = ['AWA', 'CON', 'DEC'];

  const verificationBadge = () => {
    if (!clarivateFacts) return null;
    if (clarivateFacts.verificationStatus === 'source_verified') {
      return (
        <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-800 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full">
          <CheckCircle className="w-3.5 h-3.5 text-emerald-600" />
          <span>Source-Verified (Clarivate JCR 2024)</span>
        </span>
      );
    }
    if (clarivateFacts.verificationStatus === 'user_provided') {
      return (
        <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-blue-800 bg-blue-50 border border-blue-200 px-2 py-0.5 rounded-full">
          <FileCheck className="w-3.5 h-3.5 text-blue-600" />
          <span>User-Provided Metrics</span>
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-800 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full">
        <AlertCircle className="w-3.5 h-3.5 text-amber-600" />
        <span>Unverified / Estimated Metadata</span>
      </span>
    );
  };

  return (
    <div className="bg-white border border-slate-200 rounded-2xl shadow-xs p-5 sm:p-7 space-y-7">
      {/* ─────────────────────────────────────────────────────────────
          STEP 1: JOURNAL & FACTUAL FOUNDATION
         ───────────────────────────────────────────────────────────── */}
      <section className="space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="w-6 h-6 rounded-full bg-[#002d62] text-white flex items-center justify-center text-xs font-bold">
              1
            </span>
            <h2 className="text-xs font-bold uppercase tracking-wider text-slate-800">
              Journal &amp; Verified Facts
            </h2>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {verificationBadge()}
            {onOpenPlaybook && (
              <button
                type="button"
                onClick={onOpenPlaybook}
                className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 px-2.5 py-1 rounded-lg border border-slate-200 transition"
              >
                <Sliders className="w-3 h-3 text-slate-600" />
                <span>Custom Playbook &amp; Skill</span>
                {hasCustomPlaybook && <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />}
              </button>
            )}
          </div>
        </div>

        <div className="flex flex-col sm:flex-row gap-2">
          <div className="relative flex-1">
            <input
              type="text"
              value={landingPageUrl}
              onChange={(e) => onChangeUrl(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') onFetchFacts(landingPageUrl);
              }}
              placeholder="Enter journal URL or name (e.g. nature.com/nature, https://www.nature.com/aps, or ncomms)"
              className="w-full px-3.5 py-2.5 text-sm bg-slate-50 border border-slate-300 rounded-xl text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-600 focus:bg-white transition"
            />
          </div>

          <button
            type="button"
            onClick={() => onFetchFacts(landingPageUrl)}
            disabled={isFetchingFacts || !landingPageUrl.trim()}
            className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-semibold rounded-xl border border-slate-300 transition flex items-center justify-center gap-1.5 shrink-0 disabled:opacity-50"
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
        </div>

        {/* Quick select journals */}
        <div className="flex flex-wrap items-center gap-1.5 pt-1 text-xs">
          <span className="text-slate-400 font-medium text-[11px]">Quick Select:</span>
          {POPULAR_JOURNALS.map((j) => (
            <button
              key={j.url}
              type="button"
              onClick={() => handleSelectQuickJournal(j.url)}
              className={`px-2.5 py-1 rounded-lg border text-xs transition flex items-center gap-1.5 ${
                landingPageUrl.toLowerCase().includes(j.url.split('/').pop() || 'none') ||
                (j.name === 'Nature' && (landingPageUrl === 'nature.com' || landingPageUrl === 'https://www.nature.com' || landingPageUrl === 'https://www.nature.com/nature'))
                  ? 'bg-blue-50 text-blue-900 border-blue-300 font-semibold'
                  : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
              }`}
            >
              <span>{j.name}</span>
              <span className="text-[10px] text-blue-700 font-mono font-bold">IF {j.ifValue}</span>
            </button>
          ))}
        </div>

        {/* Verified Facts Card with Progressive Disclosure */}
        {clarivateFacts && (
          <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-3 text-xs">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2 border-b border-slate-200">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-[#002d62] text-white flex items-center justify-center font-bold text-xs shrink-0">
                  JCR
                </div>
                <div>
                  <div className="font-bold text-slate-900 text-sm flex items-center gap-2">
                    <span>{clarivateFacts.journalName}</span>
                    <span className="text-[11px] font-normal px-2 py-0.5 rounded-full bg-slate-200 text-slate-700">
                      {clarivateFacts.publisher}
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
                    <span>{clarivateFacts.impactFactor}</span>
                    <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-1.5 py-0.2 rounded border border-emerald-200">
                      {clarivateFacts.jcrQuartile}
                    </span>
                  </div>
                  <span className="text-[10px] text-slate-400">5-Yr: {clarivateFacts.fiveYearImpactFactor}</span>
                </div>

                <div className="bg-white p-2.5 rounded-lg border border-slate-200">
                  <span className="text-[10px] text-slate-400 font-semibold uppercase block">CAS Zone (中科院)</span>
                  <span className="text-xs font-bold text-slate-900 line-clamp-1">{clarivateFacts.casZone}</span>
                  <span className="text-[10px] text-slate-400">Institutional Tenure</span>
                </div>

                <div className="bg-white p-2.5 rounded-lg border border-slate-200">
                  <span className="text-[10px] text-slate-400 font-semibold uppercase block">1st Decision Time</span>
                  <span className="text-sm font-bold text-slate-900">
                    {clarivateFacts.firstDecisionDays} Days
                  </span>
                  <span className="text-[10px] text-slate-500 block">Initial editorial review</span>
                </div>

                <div className="bg-white p-2.5 rounded-lg border border-slate-200">
                  <span className="text-[10px] text-slate-400 font-semibold uppercase block">Publishing Model &amp; APC</span>
                  <span className="text-xs font-bold text-slate-900 line-clamp-1">{clarivateFacts.openAccessType}</span>
                  <span className="text-[10px] text-slate-500 font-medium">
                    {clarivateFacts.chinaWaiverAvailable ? 'Institutional Waiver Eligible' : `Standard APC: $${clarivateFacts.apcUsd}`}
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
                      onChange={(e) => setEditedFacts(prev => prev ? { ...prev, journalName: e.target.value } : null)}
                      className="w-full text-xs p-1.5 border border-slate-300 rounded bg-slate-50 text-slate-900"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-slate-500 font-semibold block">Impact Factor (IF)</label>
                    <input
                      type="number"
                      step="0.1"
                      value={editedFacts?.impactFactor || 0}
                      onChange={(e) => setEditedFacts(prev => prev ? { ...prev, impactFactor: parseFloat(e.target.value) || 0 } : null)}
                      className="w-full text-xs p-1.5 border border-slate-300 rounded bg-slate-50 text-slate-900 font-bold"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-slate-500 font-semibold block">CAS Zone (中科院分区)</label>
                    <input
                      type="text"
                      value={editedFacts?.casZone || ''}
                      onChange={(e) => setEditedFacts(prev => prev ? { ...prev, casZone: e.target.value } : null)}
                      className="w-full text-xs p-1.5 border border-slate-300 rounded bg-slate-50 text-slate-900"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-slate-500 font-semibold block">1st Decision (Days)</label>
                    <input
                      type="number"
                      value={editedFacts?.firstDecisionDays || 0}
                      onChange={(e) => setEditedFacts(prev => prev ? { ...prev, firstDecisionDays: parseInt(e.target.value) || 0 } : null)}
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

            {/* Progressive Disclosure: Scope & Indexing details */}
            {showAdvancedMetrics && (
              <div className="pt-2 border-t border-slate-200 space-y-1.5 text-[11px] text-slate-600">
                <p>
                  <strong>Aims &amp; Scope Summary:</strong> {clarivateFacts.aimsAndScopeSummary}
                </p>
                <div className="flex flex-wrap items-center gap-4 text-slate-500">
                  <span>Indexing: <strong>{clarivateFacts.indexing.join(', ')}</strong></span>
                  <span>Discipline: <strong>{clarivateFacts.primaryDiscipline}</strong></span>
                  <span>Reporting Period: <strong>{clarivateFacts.reportingYear || 'JCR 2024'}</strong></span>
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
                    <span className={`text-xs font-bold ${isSelected ? 'text-blue-950 font-extrabold' : 'text-slate-800'}`}>
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
                    <span className="font-semibold text-slate-900 block text-[10px] uppercase text-slate-400">Objective:</span>
                    {cfg.campaignObjective}
                  </div>
                </div>

                {/* Example CTA & Destination */}
                <div className="pt-2 border-t border-slate-200/70 flex items-center justify-between text-[11px]">
                  <span className="text-slate-500">
                    CTA: <strong className="text-slate-800">"{cfg.exampleCtas[0]}"</strong>
                  </span>
                  <span className={`font-semibold text-[10px] ${isSelected ? 'text-blue-700' : 'text-slate-400'}`}>
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
                onClick={() => onChangeChannels({ ...selectedChannels, search: !selectedChannels.search })}
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
                onClick={() => onChangeChannels({ ...selectedChannels, display: !selectedChannels.display })}
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
            {selectedChannels.search && selectedChannels.display ? 'Search & Display' : selectedChannels.search ? 'Search Only' : 'Display Only'}
          </span>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onGenerate}
            disabled={isLoading || !landingPageUrl.trim()}
            className="w-full sm:w-auto px-6 py-2.5 bg-[#002d62] hover:bg-[#00224a] text-white text-xs font-bold rounded-xl shadow transition flex items-center justify-center gap-2 disabled:opacity-50"
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
