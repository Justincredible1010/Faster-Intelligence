import React from 'react';
import {
  Compass,
  ArrowRight,
  ExternalLink,
  Sparkles,
  Bot,
  FileCheck,
  CheckCircle2,
  Info,
} from 'lucide-react';
import { GeneratedAdCampaign, STAGE_CONFIGS, normalizeStage } from '../types';

interface Props {
  campaign: GeneratedAdCampaign;
  onOpenCompareStages?: () => void;
}

export const StrategySummaryBanner: React.FC<Props> = ({ campaign, onOpenCompareStages }) => {
  const stage = normalizeStage(campaign.funnelStage);
  const cfg = STAGE_CONFIGS[stage];

  const isAi = campaign.generationSource === 'ai_grounded';

  return (
    <div className="bg-white border border-slate-200 rounded-2xl shadow-xs overflow-hidden">
      {/* Top Banner Row */}
      <div className="px-5 py-3 bg-gradient-to-r from-slate-50 via-blue-50/40 to-slate-50 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
        <div className="flex items-center gap-2.5">
          <span className="font-extrabold text-[#002d62] text-xs uppercase tracking-wider bg-white border border-slate-300 px-2 py-0.5 rounded-md shadow-2xs">
            {cfg.name}
          </span>
          <span className="text-slate-500 font-medium text-[11px] truncate max-w-md hidden sm:inline">
            {cfg.campaignObjective}
          </span>
        </div>

        <div className="flex items-center gap-2">
          {/* Generation Source Discloser */}
          <div
            className={`inline-flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-0.5 rounded-full border ${
              isAi
                ? 'bg-purple-50 text-purple-900 border-purple-200'
                : 'bg-emerald-50 text-emerald-900 border-emerald-200'
            }`}
          >
            {isAi ? <Bot className="w-3.5 h-3.5 text-purple-600" /> : <FileCheck className="w-3.5 h-3.5 text-emerald-600" />}
            <span>{isAi ? 'AI-Grounded (Gemini 2.5)' : 'Curated Publishing Strategy Fallback'}</span>
          </div>

          {onOpenCompareStages && (
            <button
              type="button"
              onClick={onOpenCompareStages}
              className="text-[11px] font-semibold text-blue-700 hover:text-blue-900 hover:underline flex items-center gap-1 ml-1"
            >
              <span>Compare Stages</span>
              <ArrowRight className="w-3 h-3" />
            </button>
          )}
        </div>
      </div>

      {/* 4-Cell Compact Strategy Metadata Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 divide-y sm:divide-y-0 sm:divide-x divide-slate-200 text-xs">
        {/* Cell 1: Author's Main Question / Mindset */}
        <div className="p-3.5 space-y-1">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
            Author's Question:
          </span>
          <p className="text-slate-800 italic text-[11px] font-medium leading-snug">
            {cfg.authorMindset}
          </p>
        </div>

        {/* Cell 2: Messaging Focus */}
        <div className="p-3.5 space-y-1">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
            Messaging Focus:
          </span>
          <p className="text-slate-700 text-[11px] leading-snug">
            {stage === 'AWA'
              ? 'Research scope, scientific discovery, broad community, and publisher prestige.'
              : stage === 'CON'
              ? 'Aims, article types, editorial rigor, transparent fees, and indexing metrics.'
              : 'Practical author guidelines, submission checklist, formatting, and verified portal.'}
          </p>
        </div>

        {/* Cell 3: Primary CTA */}
        <div className="p-3.5 space-y-1">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
            Primary Call-to-Action:
          </span>
          <div className="font-bold text-slate-900 text-xs flex items-center gap-1.5 mt-0.5">
            <span className="w-2 h-2 rounded-full bg-blue-600 shrink-0" />
            <span>"{campaign.primaryCta || cfg.primaryCta}"</span>
          </div>
          <span className="text-[10px] text-slate-400 block">Aligned with author readiness</span>
        </div>

        {/* Cell 4: Recommended Destination */}
        <div className="p-3.5 space-y-1">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
            Recommended Destination:
          </span>
          <a
            href={campaign.recommendedDestination?.url || '#'}
            target="_blank"
            rel="noopener noreferrer"
            className="font-semibold text-blue-700 hover:text-blue-900 hover:underline flex items-center gap-1 text-[11px] truncate group"
          >
            <span className="truncate">{campaign.recommendedDestination?.label || cfg.recommendedDestination.label}</span>
            <ExternalLink className="w-3 h-3 shrink-0 opacity-70 group-hover:opacity-100" />
          </a>
          <p className="text-[10px] text-slate-400 truncate">
            {campaign.recommendedDestination?.description || cfg.recommendedDestination.purpose}
          </p>
        </div>
      </div>
    </div>
  );
};
