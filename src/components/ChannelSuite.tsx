import React, { useState } from 'react';
import { Search, Layout, Target, ArrowRight, Info, Layers } from 'lucide-react';
import { GeneratedAdCampaign, STAGE_CONFIGS, normalizeStage } from '../types';
import { GoogleAdPreview } from './GoogleAdPreview';
import { GoogleDisplayPreview } from './GoogleDisplayPreview';
import { TargetingViewer } from './TargetingViewer';

interface Props {
  campaign: GeneratedAdCampaign;
  landingPageUrl: string;
  selectedChannels: { search: boolean; display: boolean };
  onEditHeadline?: (index: number, text: string) => void;
  onEditDescription?: (index: number, text: string) => void;
}

export const ChannelSuite: React.FC<Props> = ({
  campaign,
  landingPageUrl,
  selectedChannels,
  onEditHeadline,
  onEditDescription,
}) => {
  const [activeTab, setActiveTab] = useState<'search' | 'display' | 'keywords'>(
    selectedChannels.search ? 'search' : 'display'
  );

  const stage = normalizeStage(campaign.funnelStage);
  const cfg = STAGE_CONFIGS[stage];

  return (
    <div className="bg-white border border-slate-200 rounded-2xl shadow-xs overflow-hidden flex flex-col">
      {/* Top Header & Channel Switcher */}
      <div className="px-5 py-3.5 border-b border-slate-200 bg-slate-50/60 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        {/* Navigation Tabs */}
        <div className="flex items-center gap-1.5 flex-wrap">
          {selectedChannels.search && (
            <button
              onClick={() => setActiveTab('search')}
              className={`flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs font-semibold transition ${
                activeTab === 'search'
                  ? 'bg-[#002d62] text-white shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
              }`}
            >
              <Search className="w-3.5 h-3.5" />
              <span>Google Search (RSA)</span>
            </button>
          )}

          {selectedChannels.display && (
            <button
              onClick={() => setActiveTab('display')}
              className={`flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs font-semibold transition ${
                activeTab === 'display'
                  ? 'bg-[#002d62] text-white shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
              }`}
            >
              <Layout className="w-3.5 h-3.5" />
              <span>Google Display (RDA)</span>
            </button>
          )}

          <button
            onClick={() => setActiveTab('keywords')}
            className={`flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs font-semibold transition ${
              activeTab === 'keywords'
                ? 'bg-[#002d62] text-white shadow-2xs'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
            }`}
          >
            <Target className="w-3.5 h-3.5" />
            <span>Keywords &amp; Anti-Fraud Shield</span>
          </button>
        </div>

        {/* Funnel Note Badge */}
        <div className="flex items-center gap-2 text-xs text-slate-600 bg-white border border-slate-200 px-3 py-1 rounded-xl shadow-2xs">
          <span className="font-extrabold text-[#002d62] font-mono">{cfg.code}</span>
          <span className="text-slate-300">|</span>
          <span className="truncate max-w-[280px] text-[11px] text-slate-700 font-medium">
            CTA: "{campaign.primaryCta || cfg.primaryCta}"
          </span>
        </div>
      </div>

      {/* Main Tab View */}
      <div className="p-5 sm:p-7">
        {activeTab === 'search' && campaign.searchAds && (
          <GoogleAdPreview
            content={campaign.searchAds}
            displayUrl={landingPageUrl}
            stage={stage}
            onEditHeadline={onEditHeadline}
            onEditDescription={onEditDescription}
          />
        )}

        {activeTab === 'display' && campaign.displayAds && (
          <GoogleDisplayPreview
            content={campaign.displayAds}
            journalName={campaign.clarivateFacts.journalName}
            impactFactor={campaign.clarivateFacts.impactFactor}
            casZone={campaign.clarivateFacts.casZone}
            publisher={campaign.clarivateFacts.publisher}
            stage={stage}
          />
        )}

        {activeTab === 'keywords' && (
          <TargetingViewer
            keywords={campaign.keywords}
            journalName={campaign.clarivateFacts.journalName}
            stage={stage}
          />
        )}
      </div>
    </div>
  );
};
