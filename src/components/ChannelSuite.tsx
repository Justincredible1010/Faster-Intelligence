import React, { useState } from 'react';
import { Search, Layout, Target, ArrowRight, Info } from 'lucide-react';
import { GeneratedAdCampaign } from '../types';
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
  const [activeTab, setActiveTab] = useState<'search' | 'display' | 'keywords'>('search');

  return (
    <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden flex flex-col">
      {/* Top Header & Channel Switcher */}
      <div className="px-5 py-3.5 border-b border-slate-200 bg-slate-50/50 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        {/* Navigation Tabs */}
        <div className="flex items-center gap-1.5">
          {selectedChannels.search && (
            <button
              onClick={() => setActiveTab('search')}
              className={`flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs font-semibold transition ${
                activeTab === 'search'
                  ? 'bg-blue-600 text-white shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
              }`}
            >
              <Search className="w-3.5 h-3.5" />
              <span>Google Search Ads</span>
            </button>
          )}

          {selectedChannels.display && (
            <button
              onClick={() => setActiveTab('display')}
              className={`flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs font-semibold transition ${
                activeTab === 'display'
                  ? 'bg-blue-600 text-white shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
              }`}
            >
              <Layout className="w-3.5 h-3.5" />
              <span>Google Display Ads</span>
            </button>
          )}

          <button
            onClick={() => setActiveTab('keywords')}
            className={`flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs font-semibold transition ${
              activeTab === 'keywords'
                ? 'bg-blue-600 text-white shadow-2xs'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
            }`}
          >
            <Target className="w-3.5 h-3.5" />
            <span>Keywords & Negative Shield</span>
          </button>
        </div>

        {/* Funnel Note Badge */}
        <div className="flex items-center gap-1.5 text-xs text-slate-600 bg-white border border-slate-200 px-3 py-1 rounded-lg shadow-2xs">
          <span className="font-bold text-blue-700 font-mono">{campaign.funnelStage}</span>
          <span className="text-slate-300">|</span>
          <span className="truncate max-w-[260px] text-[11px]">{campaign.funnelStrategyNote}</span>
        </div>
      </div>

      {/* Main Tab View */}
      <div className="p-5 sm:p-6">
        {activeTab === 'search' && campaign.searchAds && (
          <GoogleAdPreview
            content={campaign.searchAds}
            displayUrl={landingPageUrl}
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
          />
        )}

        {activeTab === 'keywords' && (
          <TargetingViewer
            keywords={campaign.keywords}
            journalName={campaign.clarivateFacts.journalName}
          />
        )}
      </div>
    </div>
  );
};
