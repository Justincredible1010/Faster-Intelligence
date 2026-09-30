import React, { useState, useEffect } from 'react';
import {
  Link as LinkIcon,
  CheckSquare,
  Square,
  Award,
  Clock,
  Globe2,
  Sparkles,
  Layers,
  Search,
  CheckCircle,
  Edit2,
  Check,
  BookOpen,
  ArrowRight,
  Sliders,
  ExternalLink,
} from 'lucide-react';
import { FunnelStage, ClarivateJournalMetrics } from '../types';

interface Props {
  landingPageUrl: string;
  onChangeUrl: (url: string) => void;
  selectedChannels: { search: boolean; display: boolean };
  onChangeChannels: (channels: { search: boolean; display: boolean }) => void;
  funnelStage: FunnelStage;
  onChangeFunnel: (stage: FunnelStage) => void;
  clarivateFacts: ClarivateJournalMetrics | null;
  onUpdateClarivateFacts?: (facts: ClarivateJournalMetrics) => void;
  onFetchFacts: (url: string) => void;
  onGenerate: () => void;
  onOpenPlaybook?: () => void;
  hasCustomPlaybook?: boolean;
  isLoading: boolean;
  isFetchingFacts: boolean;
}

const POPULAR_JOURNALS = [
  { name: 'Nature', url: 'https://www.nature.com/nature', ifValue: 50.5, tag: 'Flagship' },
  { name: 'Acta Pharmacologica Sinica (APS)', url: 'https://www.nature.com/aps', ifValue: 6.9, tag: 'CAS 1区 Top' },
  { name: 'Cell Research', url: 'https://www.nature.com/cr', ifValue: 44.1, tag: 'CAS 1区 Top' },
  { name: 'Nature Communications', url: 'https://www.nature.com/ncomms', ifValue: 14.7, tag: 'Gold OA' },
  { name: 'Scientific Reports', url: 'https://www.nature.com/srep', ifValue: 3.8, tag: 'Gold OA' },
  { name: 'STTT', url: 'https://www.nature.com/sttt', ifValue: 40.8, tag: 'CAS 1区 Top' },
  { name: 'Nature Medicine', url: 'https://www.nature.com/nm', ifValue: 58.7, tag: 'CAS 1区 Top' },
  { name: 'Bone Research', url: 'https://www.nature.com/boneres', ifValue: 9.8, tag: 'Gold OA' },
];

export const InputStudio: React.FC<Props> = ({
  landingPageUrl,
  onChangeUrl,
  selectedChannels,
  onChangeChannels,
  funnelStage,
  onChangeFunnel,
  clarivateFacts,
  onUpdateClarivateFacts,
  onFetchFacts,
  onGenerate,
  onOpenPlaybook,
  hasCustomPlaybook,
  isLoading,
  isFetchingFacts,
}) => {
  const [isEditingMetrics, setIsEditingMetrics] = useState(false);
  const [editedFacts, setEditedFacts] = useState<ClarivateJournalMetrics | null>(null);

  useEffect(() => {
    if (clarivateFacts) {
      setEditedFacts(clarivateFacts);
    }
  }, [clarivateFacts]);

  // Debounced auto-fetch when user types or changes the URL
  useEffect(() => {
    const trimmed = landingPageUrl.trim();
    if (!trimmed) return;

    const timer = setTimeout(() => {
      onFetchFacts(trimmed);
    }, 600);

    return () => clearTimeout(timer);
  }, [landingPageUrl]);

  const handleSaveMetrics = () => {
    if (editedFacts && onUpdateClarivateFacts) {
      onUpdateClarivateFacts(editedFacts);
    }
    setIsEditingMetrics(false);
  };

  const handleSelectQuickJournal = (url: string) => {
    onChangeUrl(url);
    onFetchFacts(url);
  };

  return (
    <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-5 sm:p-6 space-y-6">
      {/* 1. Master Landing Page URL & Clarivate Live API Fetcher */}
      <div className="space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <label className="text-xs font-bold uppercase tracking-wider text-slate-800 flex items-center gap-1.5">
            <LinkIcon className="w-4 h-4 text-blue-600" />
            <span>1. Target Journal URL or Domain (Live Clarivate JCR Grounding):</span>
          </label>
          <div className="flex items-center gap-2">
            {onOpenPlaybook && (
              <button
                type="button"
                onClick={onOpenPlaybook}
                className="flex items-center gap-1.5 text-[11px] font-semibold text-blue-900 bg-blue-50 hover:bg-blue-100 px-2.5 py-0.5 rounded-full border border-blue-200 transition"
              >
                <Sliders className="w-3 h-3 text-blue-600" />
                <span>Custom Playbook &amp; Skill</span>
                {hasCustomPlaybook && <span className="w-2 h-2 rounded-full bg-emerald-500" />}
              </button>
            )}
            <div className="flex items-center gap-1.5 text-[11px] font-semibold text-emerald-700 bg-emerald-50 px-2.5 py-0.5 rounded-full border border-emerald-200">
              <CheckCircle className="w-3.5 h-3.5 text-emerald-600" />
              <span>Clarivate JCR API: Active</span>
            </div>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row gap-2">
          <div className="relative flex-1">
            <input
              type="text"
              value={landingPageUrl}
              onChange={(e) => onChangeUrl(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  onFetchFacts(landingPageUrl);
                }
              }}
              placeholder="e.g. nature.com, https://www.nature.com/aps, or ncomms"
              className="w-full px-3.5 py-2.5 text-sm bg-slate-50 border border-slate-300 rounded-xl text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition"
            />
          </div>

          <button
            type="button"
            onClick={() => onFetchFacts(landingPageUrl)}
            disabled={isFetchingFacts || !landingPageUrl.trim()}
            className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-semibold rounded-xl border border-slate-300 shadow-2xs transition flex items-center justify-center gap-1.5 shrink-0 disabled:opacity-50"
          >
            {isFetchingFacts ? (
              <>
                <div className="w-3.5 h-3.5 border-2 border-slate-400 border-t-slate-800 rounded-full animate-spin" />
                <span>Checking Clarivate...</span>
              </>
            ) : (
              <>
                <Search className="w-3.5 h-3.5 text-blue-600" />
                <span>Fetch Journal Facts</span>
              </>
            )}
          </button>

          <button
            type="button"
            onClick={onGenerate}
            disabled={isLoading || !landingPageUrl.trim()}
            className="px-6 py-2.5 bg-[#002d62] hover:bg-[#00224a] text-white text-xs font-bold rounded-xl shadow transition flex items-center justify-center gap-2 shrink-0 disabled:opacity-50"
          >
            {isLoading ? (
              <>
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                <span>Generating Ads...</span>
              </>
            ) : (
              <>
                <Sparkles className="w-4 h-4 text-sky-300" />
                <span>Generate Ad Campaign</span>
              </>
            )}
          </button>
        </div>

        {/* Quick select journals */}
        <div className="flex flex-wrap items-center gap-1.5 pt-1 text-[11px]">
          <span className="text-slate-500 font-medium">Quick Select:</span>
          {POPULAR_JOURNALS.map((j) => (
            <button
              key={j.url}
              type="button"
              onClick={() => handleSelectQuickJournal(j.url)}
              className={`px-2.5 py-1 rounded-lg border text-xs transition flex items-center gap-1 ${
                landingPageUrl.toLowerCase().includes(j.url.split('/').pop() || 'none') ||
                (j.name === 'Nature' && (landingPageUrl === 'nature.com' || landingPageUrl === 'https://www.nature.com' || landingPageUrl === 'https://www.nature.com/nature'))
                  ? 'bg-blue-100 text-blue-900 border-blue-300 font-semibold'
                  : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
              }`}
            >
              <span>{j.name}</span>
              <span className="text-[10px] text-blue-700 font-semibold font-mono">IF {j.ifValue}</span>
            </button>
          ))}
        </div>
      </div>

      {/* 2. Auto-Retrieved Clarivate JCR Fact Card */}
      {clarivateFacts && (
        <div className="p-4 bg-blue-50/60 border border-blue-200 rounded-xl space-y-3 text-xs">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-blue-100 pb-2.5">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-blue-600 text-white flex items-center justify-center font-bold text-xs shrink-0 shadow-sm">
                JCR
              </div>
              <div>
                <div className="font-bold text-slate-900 text-sm flex items-center gap-2">
                  <span>{clarivateFacts.journalName}</span>
                  <span className="text-[11px] font-normal px-2 py-0.2 rounded-full bg-blue-100 text-blue-800">
                    {clarivateFacts.publisher}
                  </span>
                </div>
                <p className="text-[11px] text-slate-500">{clarivateFacts.sourceAttribution}</p>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setIsEditingMetrics(!isEditingMetrics)}
              className="text-xs text-blue-700 hover:text-blue-900 font-medium flex items-center gap-1 self-start sm:self-auto"
            >
              <Edit2 className="w-3.5 h-3.5" />
              <span>{isEditingMetrics ? 'Cancel Edit' : 'Edit Metrics'}</span>
            </button>
          </div>

          {/* Fact Badges Display or Edit Form */}
          {!isEditingMetrics ? (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
              <div className="bg-white p-2.5 rounded-lg border border-blue-100 shadow-2xs">
                <span className="text-[10px] text-slate-500 font-semibold uppercase block">Impact Factor</span>
                <div className="text-base font-extrabold text-blue-950 flex items-center gap-1.5">
                  <span>{clarivateFacts.impactFactor}</span>
                  <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-1.5 py-0.2 rounded border border-emerald-200">
                    {clarivateFacts.jcrQuartile}
                  </span>
                </div>
                <span className="text-[10px] text-slate-400">5-Yr IF: {clarivateFacts.fiveYearImpactFactor}</span>
              </div>

              <div className="bg-white p-2.5 rounded-lg border border-blue-100 shadow-2xs">
                <span className="text-[10px] text-slate-500 font-semibold uppercase block">CAS Zone (中科院)</span>
                <span className="text-xs font-bold text-slate-900 line-clamp-1">{clarivateFacts.casZone}</span>
                <span className="text-[10px] text-slate-400">Tenure &amp; NSFC Standard</span>
              </div>

              <div className="bg-white p-2.5 rounded-lg border border-blue-100 shadow-2xs">
                <span className="text-[10px] text-slate-500 font-semibold uppercase block">Turnaround Speed</span>
                <span className="text-sm font-bold text-slate-900">
                  {clarivateFacts.firstDecisionDays} Days to 1st Decision
                </span>
                <span className="text-[10px] text-emerald-600 block">Fast Track Editorial</span>
              </div>

              <div className="bg-white p-2.5 rounded-lg border border-blue-100 shadow-2xs">
                <span className="text-[10px] text-slate-500 font-semibold uppercase block">Open Access &amp; APC</span>
                <span className="text-xs font-bold text-slate-900 line-clamp-1">{clarivateFacts.openAccessType}</span>
                <span className="text-[10px] text-blue-600 font-semibold">
                  {clarivateFacts.chinaWaiverAvailable ? 'China Waivers Available' : `Standard APC: $${clarivateFacts.apcUsd}`}
                </span>
              </div>
            </div>
          ) : (
            <div className="space-y-3 bg-white p-3 rounded-lg border border-blue-200">
              <span className="font-bold text-xs text-slate-800 block">Manually Override Clarivate JCR Metrics:</span>
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
                  <span>Update &amp; Apply</span>
                </button>
              </div>
            </div>
          )}

          <div className="flex items-center justify-between text-[11px] text-slate-500 pt-1">
            <span>
              Indexing: <strong>{clarivateFacts.indexing.join(', ')}</strong> · Discipline: <strong>{clarivateFacts.primaryDiscipline}</strong>
            </span>
          </div>
        </div>
      )}

      {/* 3. Funnel Stage Calibration & Channel Selectors */}
      <div className="grid md:grid-cols-2 gap-4 pt-1">
        {/* Funnel Selection */}
        <div className="space-y-2">
          <label className="text-xs font-bold uppercase tracking-wider text-slate-800 flex items-center gap-1.5">
            <Layers className="w-4 h-4 text-blue-600" />
            <span>2. Marketing Funnel Stage:</span>
          </label>
          <div className="grid grid-cols-3 gap-2">
            {[
              {
                id: 'TOFU',
                name: 'TOFU (Awareness)',
                desc: 'Prestige, IF authority, & global readership reach',
              },
              {
                id: 'MOFU',
                name: 'MOFU (Consideration)',
                desc: 'Call for Papers (CFP), Special Issue, & CAS Zone 1',
              },
              {
                id: 'BOFU',
                name: 'BOFU (Decision)',
                desc: 'Fast 1st decision days, urgent deadline, & portal submission',
              },
            ].map((stage) => {
              const active = funnelStage === stage.id;
              return (
                <button
                  key={stage.id}
                  type="button"
                  onClick={() => onChangeFunnel(stage.id as FunnelStage)}
                  className={`p-2.5 rounded-xl border text-left transition flex flex-col justify-between ${
                    active
                      ? 'bg-blue-50 border-blue-600 text-blue-900 font-bold shadow-2xs'
                      : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100 font-normal'
                  }`}
                >
                  <span className="text-xs">{stage.name}</span>
                  <span className="text-[10px] text-slate-500 font-normal leading-tight mt-1 line-clamp-2">
                    {stage.desc}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Channel Selection */}
        <div className="space-y-2">
          <label className="text-xs font-bold uppercase tracking-wider text-slate-800 flex items-center gap-1.5">
            <Globe2 className="w-4 h-4 text-blue-600" />
            <span>3. Google Ad Networks:</span>
          </label>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => onChangeChannels({ ...selectedChannels, search: !selectedChannels.search })}
              className={`p-2.5 rounded-xl border text-left transition flex items-center gap-2.5 ${
                selectedChannels.search
                  ? 'bg-blue-50 border-blue-600 text-blue-900 font-bold'
                  : 'bg-slate-50 border-slate-200 text-slate-700'
              }`}
            >
              {selectedChannels.search ? (
                <CheckSquare className="w-4 h-4 text-blue-600 shrink-0" />
              ) : (
                <Square className="w-4 h-4 text-slate-400 shrink-0" />
              )}
              <div>
                <span className="text-xs block">Google Search (RSA)</span>
                <span className="text-[10px] text-slate-500 font-normal">15 Headlines &amp; 4 Descriptions</span>
              </div>
            </button>

            <button
              type="button"
              onClick={() => onChangeChannels({ ...selectedChannels, display: !selectedChannels.display })}
              className={`p-2.5 rounded-xl border text-left transition flex items-center gap-2.5 ${
                selectedChannels.display
                  ? 'bg-blue-50 border-blue-600 text-blue-900 font-bold'
                  : 'bg-slate-50 border-slate-200 text-slate-700'
              }`}
            >
              {selectedChannels.display ? (
                <CheckSquare className="w-4 h-4 text-blue-600 shrink-0" />
              ) : (
                <Square className="w-4 h-4 text-slate-400 shrink-0" />
              )}
              <div>
                <span className="text-xs block">Google Display (RDA)</span>
                <span className="text-[10px] text-slate-500 font-normal">Banners, Stock Images &amp; Formats</span>
              </div>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
