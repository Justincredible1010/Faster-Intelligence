import React, { useState, useEffect } from 'react';
import {
  X,
  Layers,
  ArrowRight,
  CheckCircle,
  ExternalLink,
  Search,
  Layout,
  Compass,
  CheckSquare,
  HelpCircle,
  Sparkles,
} from 'lucide-react';
import { StageCode, STAGE_CONFIGS, ClarivateJournalMetrics, GeneratedAdCampaign } from '../types';
import { apiFetch } from '../auth/api';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  landingPageUrl: string;
  clarivateFacts: ClarivateJournalMetrics | null;
  onSelectStage: (stage: StageCode) => void;
  currentStage: StageCode;
}

export const StageComparisonModal: React.FC<Props> = ({
  isOpen,
  onClose,
  landingPageUrl,
  clarivateFacts,
  onSelectStage,
  currentStage,
}) => {
  const [stagesData, setStagesData] = useState<{
    AWA?: GeneratedAdCampaign;
    CON?: GeneratedAdCampaign;
    DEC?: GeneratedAdCampaign;
  } | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);

  useEffect(() => {
    if (isOpen && landingPageUrl) {
      fetchComparison();
    }
  }, [isOpen, landingPageUrl]);

  const fetchComparison = async () => {
    setIsLoading(true);
    try {
      const res = await apiFetch('/api/compare-stages', {
        method: 'POST',
        body: JSON.stringify({ landingPageUrl }),
      });
      const data = await res.json();
      if (data.stages) {
        setStagesData(data.stages);
      }
    } catch (e) {
      console.error('Failed to load stage comparison:', e);
    } finally {
      setIsLoading(false);
    }
  };

  if (!isOpen) return null;

  const stages: StageCode[] = ['AWA', 'CON', 'DEC'];

  const stageColorStyles = {
    AWA: {
      border: 'border-sky-300',
      headerBg: 'bg-sky-50 text-sky-950',
      badge: 'bg-sky-100 text-sky-800 border-sky-200',
      activeBorder: 'ring-2 ring-sky-500',
    },
    CON: {
      border: 'border-indigo-300',
      headerBg: 'bg-indigo-50 text-indigo-950',
      badge: 'bg-indigo-100 text-indigo-800 border-indigo-200',
      activeBorder: 'ring-2 ring-indigo-500',
    },
    DEC: {
      border: 'border-emerald-300',
      headerBg: 'bg-emerald-50 text-emerald-950',
      badge: 'bg-emerald-100 text-emerald-800 border-emerald-200',
      activeBorder: 'ring-2 ring-emerald-500',
    },
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-slate-900/60 backdrop-blur-xs overflow-y-auto">
      <div className="relative w-full max-w-6xl max-h-[92vh] bg-white border border-slate-200 rounded-2xl shadow-2xl flex flex-col text-slate-800 animate-in fade-in zoom-in-95 duration-150">
        {/* Modal Header */}
        <div className="sticky top-0 z-20 flex items-center justify-between px-6 py-4 bg-white border-b border-slate-200">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-[#002d62] text-white flex items-center justify-center font-bold shadow-sm">
              <Layers className="w-5 h-5 text-sky-300" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <span>Side-by-Side Funnel Stage Comparison</span>
                <span className="text-[11px] font-semibold px-2.5 py-0.5 rounded-full bg-blue-100 text-blue-900 border border-blue-200">
                  {clarivateFacts?.journalName || 'Target Journal'}
                </span>
              </h2>
              <p className="text-xs text-slate-500">
                Review how author mindsets, messaging priorities, CTAs, and recommended destinations adapt across AWA, CON, and DEC
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg hover:bg-slate-100 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Content */}
        <div className="p-6 overflow-y-auto flex-1 space-y-6">
          {isLoading ? (
            <div className="py-20 flex flex-col items-center justify-center gap-3 text-slate-500">
              <div className="w-8 h-8 border-3 border-blue-200 border-t-blue-600 rounded-full animate-spin" />
              <p className="text-xs font-medium">Generating stage comparison matrix across AWA, CON, and DEC...</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
              {stages.map((st) => {
                const cfg = STAGE_CONFIGS[st];
                const styles = stageColorStyles[st];
                const campaign = stagesData ? stagesData[st] : null;
                const isCurrent = currentStage === st;

                return (
                  <div
                    key={st}
                    className={`rounded-2xl border ${styles.border} bg-white shadow-sm flex flex-col overflow-hidden transition-all ${
                      isCurrent ? styles.activeBorder : ''
                    }`}
                  >
                    {/* Column Header */}
                    <div className={`p-4 border-b ${styles.headerBg} flex items-center justify-between`}>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-bold">{cfg.name}</span>
                          {isCurrent && (
                            <span className="text-[10px] font-extrabold px-2 py-0.5 rounded bg-blue-700 text-white">
                              ACTIVE
                            </span>
                          )}
                        </div>
                        <span className="text-[11px] opacity-80 block mt-0.5">{cfg.shortLabel} Stage</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          onSelectStage(st);
                          onClose();
                        }}
                        className={`text-xs px-2.5 py-1 rounded-lg font-semibold transition ${
                          isCurrent
                            ? 'bg-blue-600 text-white'
                            : 'bg-white text-slate-700 hover:bg-slate-100 border border-slate-300'
                        }`}
                      >
                        {isCurrent ? 'Selected' : 'Use Stage'}
                      </button>
                    </div>

                    <div className="p-4 space-y-4 text-xs flex-1 flex flex-col justify-between">
                      {/* Author Mindset */}
                      <div className="space-y-1">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
                          Author Mindset:
                        </span>
                        <blockquote className="p-2.5 bg-slate-50 border-l-2 border-slate-300 rounded-r-lg text-slate-800 italic leading-relaxed text-[11px]">
                          {cfg.authorMindset}
                        </blockquote>
                      </div>

                      {/* Campaign Objective */}
                      <div className="space-y-1">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
                          Campaign Objective:
                        </span>
                        <p className="text-slate-700 text-[11px] leading-relaxed">
                          {cfg.campaignObjective}
                        </p>
                      </div>

                      {/* Primary CTA & Recommended Destination */}
                      <div className="p-2.5 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
                        <div>
                          <span className="text-[10px] font-bold uppercase text-slate-400 block">Primary Action / CTA:</span>
                          <span className="font-bold text-slate-900 text-xs flex items-center gap-1.5 mt-0.5">
                            <span className="w-1.5 h-1.5 rounded-full bg-blue-600" />
                            <span>"{campaign?.primaryCta || cfg.primaryCta}"</span>
                          </span>
                        </div>
                        <div>
                          <span className="text-[10px] font-bold uppercase text-slate-400 block">Recommended Destination:</span>
                          <span className="text-[11px] font-medium text-blue-900 block truncate">
                            {cfg.recommendedDestination.label}
                          </span>
                        </div>
                      </div>

                      {/* Sample Search Headlines */}
                      {campaign?.searchAds?.headlines && (
                        <div className="space-y-1.5">
                          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1">
                            <Search className="w-3 h-3 text-blue-600" />
                            <span>Sample Google RSA Headlines (max 30 chars):</span>
                          </span>
                          <div className="space-y-1">
                            {campaign.searchAds.headlines.slice(0, 3).map((h, i) => (
                              <div
                                key={i}
                                className="p-1.5 bg-slate-50 border border-slate-200 rounded-md font-medium text-slate-800 text-[11px] flex items-center justify-between"
                              >
                                <span className="truncate pr-1">{h.text}</span>
                                <span className="text-[9px] font-mono text-slate-400 shrink-0">{h.charCount}/30</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Sample Search Description */}
                      {campaign?.searchAds?.descriptions && (
                        <div className="space-y-1">
                          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
                            Key Ad Description (max 90 chars):
                          </span>
                          <p className="p-2 bg-slate-50 border border-slate-200 rounded-md text-[11px] text-slate-700 leading-snug">
                            {campaign.searchAds.descriptions[0]?.text}
                          </p>
                        </div>
                      )}

                      {/* Display Ad Hook */}
                      {campaign?.displayAds && (
                        <div className="space-y-1">
                          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1">
                            <Layout className="w-3 h-3 text-blue-600" />
                            <span>Google Display Ad Hook:</span>
                          </span>
                          <div className="p-2 bg-blue-50/50 border border-blue-100 rounded-md text-[11px] text-blue-950 font-medium">
                            <div>"{campaign.displayAds.shortHeadline}"</div>
                            <div className="text-[10px] text-slate-500 mt-0.5">CTA: {campaign.displayAds.ctaText}</div>
                          </div>
                        </div>
                      )}

                      {/* Select Button at bottom */}
                      <button
                        type="button"
                        onClick={() => {
                          onSelectStage(st);
                          onClose();
                        }}
                        className={`w-full py-2 rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 mt-2 ${
                          isCurrent
                            ? 'bg-slate-100 text-slate-600 border border-slate-200'
                            : 'bg-[#002d62] hover:bg-[#00224a] text-white shadow-xs'
                        }`}
                      >
                        {isCurrent ? (
                          <>
                            <CheckCircle className="w-3.5 h-3.5 text-blue-600" />
                            <span>Current Active Stage</span>
                          </>
                        ) : (
                          <>
                            <span>Select &amp; Apply {cfg.shortLabel} Stage</span>
                            <ArrowRight className="w-3.5 h-3.5" />
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="sticky bottom-0 px-6 py-3.5 bg-slate-50 border-t border-slate-200 flex items-center justify-between text-xs text-slate-500">
          <span>All 3 stages use the same journal record and change the message for the author's stage.</span>
          <button
            onClick={onClose}
            className="px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-200 rounded-lg transition"
          >
            Close Comparison
          </button>
        </div>
      </div>
    </div>
  );
};
