import React, { useState } from 'react';
import { Search, Layout, Target, ShieldCheck, Image as ImageIcon, MessageCircle, Megaphone } from 'lucide-react';
import { GeneratedAdCampaign, STAGE_CONFIGS, normalizeStage } from '../types';
import { formatJifClaim, trustedCasZone } from '../utils/metricClaims';
import { GoogleAdPreview } from './GoogleAdPreview';
import { DisplayAdCanvas } from './DisplayAdCanvas';
import { GoogleDisplayPreview } from './GoogleDisplayPreview';
import { TargetingViewer } from './TargetingViewer';
import { WeiboPreview } from './WeiboPreview';
import { WeChatAdPreview } from './WeChatAdPreview';
import type { PreviewTab } from './AppSidebar';

interface Props {
  campaign: GeneratedAdCampaign;
  landingPageUrl: string;
  selectedChannels: { search: boolean; display: boolean };
  previewTab: PreviewTab;
  onPreviewTabChange: (tab: PreviewTab) => void;
  onEditHeadline?: (index: number, text: string) => void;
  onEditDescription?: (index: number, text: string) => void;
  onOpenCompliance?: () => void;
}

export const ChannelSuite: React.FC<Props> = ({
  campaign,
  landingPageUrl,
  selectedChannels,
  previewTab,
  onPreviewTabChange,
  onEditHeadline,
  onEditDescription,
  onOpenCompliance,
}) => {
  const activeTab = previewTab;
  const setActiveTab = onPreviewTabChange;
  const [displayMode, setDisplayMode] = useState<'iab_canvas' | 'custom_generator'>('iab_canvas');

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
              <span>Search ads</span>
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
              <span>Display ads</span>
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
            <span>Keywords</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('weibo')}
            className={`flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs font-semibold transition ${
              activeTab === 'weibo'
                ? 'bg-[#002d62] text-white shadow-2xs'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
            }`}
          >
            <MessageCircle className="w-3.5 h-3.5" />
            <span>Weibo</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('wechat')}
            className={`flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs font-semibold transition ${
              activeTab === 'wechat'
                ? 'bg-[#002d62] text-white shadow-2xs'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
            }`}
          >
            <Megaphone className="w-3.5 h-3.5" />
            <span>WeChat Ads</span>
          </button>
        </div>

        {/* Right side: Funnel Badge & Policy Audit */}
        <div className="flex items-center gap-2">
          {onOpenCompliance && (
            <button
              type="button"
              onClick={onOpenCompliance}
              className="flex items-center gap-1.5 px-3 py-1 bg-white hover:bg-slate-50 text-slate-700 border border-slate-300 rounded-xl text-xs font-semibold shadow-2xs transition"
            >
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
              <span>Policy check</span>
            </button>
          )}

          <div className="flex items-center gap-2 text-xs text-slate-600 bg-white border border-slate-200 px-3 py-1 rounded-xl shadow-2xs">
            <span className="font-bold text-[#002d62]">{cfg.shortLabel}</span>
            <span className="text-slate-300">|</span>
            <span className="truncate max-w-[220px] text-[11px] text-slate-700 font-medium">
              Button: "{campaign.primaryCta || cfg.primaryCta}"
            </span>
          </div>
        </div>
      </div>

      {/* Main Tab View */}
      <div className="p-5 sm:p-7">
        {activeTab === 'search' && campaign.searchAds && (
          <GoogleAdPreview
            content={campaign.searchAds}
            displayUrl={landingPageUrl}
            stage={stage}
            facts={campaign.clarivateFacts}
            onEditHeadline={onEditHeadline}
            onEditDescription={onEditDescription}
          />
        )}

        {activeTab === 'display' && campaign.displayAds && (
          <div className="space-y-6">
            {/* Display Sub-View Switcher */}
            <div className="flex items-center justify-between pb-3 border-b border-slate-200">
              <span className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                Display ads
              </span>
              <div className="flex items-center bg-slate-100 p-1 rounded-xl border border-slate-200 text-xs">
                <button
                  type="button"
                  onClick={() => setDisplayMode('iab_canvas')}
                  className={`flex items-center gap-1.5 px-3 py-1 font-semibold rounded-lg transition ${
                    displayMode === 'iab_canvas'
                      ? 'bg-white text-slate-900 shadow-2xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <Layout className="w-3.5 h-3.5" />
                  <span>Banner sizes</span>
                </button>
                <button
                  type="button"
                  onClick={() => setDisplayMode('custom_generator')}
                  className={`flex items-center gap-1.5 px-3 py-1 font-semibold rounded-lg transition ${
                    displayMode === 'custom_generator'
                      ? 'bg-white text-slate-900 shadow-2xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <ImageIcon className="w-3.5 h-3.5" />
                  <span>Make banner images</span>
                </button>
              </div>
            </div>

            {displayMode === 'iab_canvas' ? (
              <DisplayAdCanvas
                content={campaign.displayAds}
                facts={campaign.clarivateFacts}
                stage={stage}
              />
            ) : (
              <GoogleDisplayPreview
                content={campaign.displayAds}
                journalName={campaign.clarivateFacts.journalName}
                impactLabel={formatJifClaim(campaign.clarivateFacts)}
                casZone={trustedCasZone(campaign.clarivateFacts) ?? undefined}
                publisher={campaign.clarivateFacts.publisher}
                stage={stage}
              />
            )}
          </div>
        )}

        {activeTab === 'keywords' && (
          <TargetingViewer
            keywords={campaign.keywords}
            journalName={campaign.clarivateFacts.journalName}
            stage={stage}
          />
        )}

        {activeTab === 'weibo' && (
          campaign.weiboPost ? (
            <WeiboPreview
              post={campaign.weiboPost}
              accountName={campaign.clarivateFacts.publisher || campaign.clarivateFacts.journalName}
              issues={campaign.complianceReport?.issues || []}
            />
          ) : (
            <p className="text-sm text-slate-500">Generate the campaign again to include the Weibo post.</p>
          )
        )}

        {activeTab === 'wechat' && (
          campaign.wechatAd ? (
            <WeChatAdPreview
              ad={campaign.wechatAd}
              accountName={campaign.clarivateFacts.publisher || campaign.clarivateFacts.journalName}
              issues={campaign.complianceReport?.issues || []}
            />
          ) : (
            <p className="text-sm text-slate-500">Generate the campaign again to include the WeChat ad.</p>
          )
        )}
      </div>
    </div>
  );
};
