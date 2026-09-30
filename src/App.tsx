import React, { useState, useEffect } from 'react';
import { Navbar } from './components/Navbar';
import { InputStudio } from './components/InputStudio';
import { ChannelSuite } from './components/ChannelSuite';
import { FrameworkModal } from './components/FrameworkModal';
import { PlaybookSkillModal, PRESET_SKILLS } from './components/PlaybookSkillModal';
import { FunnelStage, ClarivateJournalMetrics, GeneratedAdCampaign } from './types';
import { AlertCircle } from 'lucide-react';

const DEFAULT_LANDING_URL = 'https://www.nature.com/nature';

export default function App() {
  const [landingPageUrl, setLandingPageUrl] = useState<string>(DEFAULT_LANDING_URL);
  const [selectedChannels, setSelectedChannels] = useState<{ search: boolean; display: boolean }>({
    search: true,
    display: true,
  });
  const [funnelStage, setFunnelStage] = useState<FunnelStage>('MOFU');
  const [clarivateFacts, setClarivateFacts] = useState<ClarivateJournalMetrics | null>(null);
  const [campaign, setCampaign] = useState<GeneratedAdCampaign | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isFetchingFacts, setIsFetchingFacts] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [isGuideOpen, setIsGuideOpen] = useState<boolean>(false);
  const [isPlaybookOpen, setIsPlaybookOpen] = useState<boolean>(false);
  const [customPlaybook, setCustomPlaybook] = useState<string>(PRESET_SKILLS.default);

  // Initial load
  useEffect(() => {
    fetchClarivateFacts(landingPageUrl);
    handleGenerateCampaign(landingPageUrl, funnelStage, selectedChannels, customPlaybook);
  }, []);

  const fetchClarivateFacts = async (url: string) => {
    if (!url || !url.trim()) return;
    setIsFetchingFacts(true);
    setError(null);
    try {
      const res = await fetch('/api/fetch-clarivate-facts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: url.trim() }),
      });
      const data = await res.json();
      if (data.facts) {
        setClarivateFacts(data.facts);
        if (campaign) {
          setCampaign({
            ...campaign,
            clarivateFacts: data.facts,
          });
        }
      }
    } catch (err: any) {
      console.error('Failed to fetch Clarivate JCR facts:', err);
    } finally {
      setIsFetchingFacts(false);
    }
  };

  const handleChangeFunnel = (newFunnel: FunnelStage) => {
    setFunnelStage(newFunnel);
    handleGenerateCampaign(landingPageUrl, newFunnel, selectedChannels, customPlaybook);
  };

  const handleGenerateCampaign = async (
    url = landingPageUrl,
    funnel = funnelStage,
    channels = selectedChannels,
    playbook = customPlaybook
  ) => {
    if (!url.trim()) return;
    setIsLoading(true);
    setError(null);

    const activeChannels = [];
    if (channels.search) activeChannels.push('search');
    if (channels.display) activeChannels.push('display');

    try {
      const res = await fetch('/api/generate-campaign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          landingPageUrl: url.trim(),
          funnelStage: funnel,
          channels: activeChannels,
          customPlaybook: playbook,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to generate campaign');
      }

      setCampaign(data.campaign);
      if (data.campaign?.clarivateFacts) {
        setClarivateFacts(data.campaign.clarivateFacts);
      }
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'Generation failed. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleUpdateClarivateFacts = (updated: ClarivateJournalMetrics) => {
    setClarivateFacts(updated);
    if (campaign) {
      setCampaign({
        ...campaign,
        clarivateFacts: updated,
      });
    }
  };

  const handleEditHeadline = (index: number, newText: string) => {
    if (!campaign || !campaign.searchAds) return;
    const updatedHeadlines = [...campaign.searchAds.headlines];
    updatedHeadlines[index] = {
      ...updatedHeadlines[index],
      text: newText,
      charCount: newText.length,
    };
    setCampaign({
      ...campaign,
      searchAds: {
        ...campaign.searchAds,
        headlines: updatedHeadlines,
      },
    });
  };

  const handleEditDescription = (index: number, newText: string) => {
    if (!campaign || !campaign.searchAds) return;
    const updatedDescs = [...campaign.searchAds.descriptions];
    updatedDescs[index] = {
      ...updatedDescs[index],
      text: newText,
      charCount: newText.length,
    };
    setCampaign({
      ...campaign,
      searchAds: {
        ...campaign.searchAds,
        descriptions: updatedDescs,
      },
    });
  };

  const handleSavePlaybook = (newPlaybook: string) => {
    setCustomPlaybook(newPlaybook);
    handleGenerateCampaign(landingPageUrl, funnelStage, selectedChannels, newPlaybook);
  };

  const handleExportBrief = () => {
    if (!campaign) return;

    const markdownBrief = `# Springer Nature Google Ads Campaign Brief
**Journal:** ${campaign.clarivateFacts.journalName} (${campaign.clarivateFacts.publisher})
**Clarivate JCR Impact Factor:** ${campaign.clarivateFacts.impactFactor} (5-Year IF: ${campaign.clarivateFacts.fiveYearImpactFactor})
**Quartile & CAS Zone:** JCR ${campaign.clarivateFacts.jcrQuartile} · ${campaign.clarivateFacts.casZone}
**Funnel Stage:** ${campaign.funnelStage} (${campaign.funnelStrategyNote})
**Landing Page:** ${campaign.clarivateFacts.url}

---

## 1. Google Responsive Search Ads (RSA)
### Headlines (Strictly <= 30 Characters Each - Google Recommended 15 Headlines):
${campaign.searchAds?.headlines
  .map(
    (h, idx) =>
      `${idx + 1}. [${h.language}] ${h.text} (${h.charCount}/30 chars) - Role: ${h.category || 'Standard'}`
  )
  .join('\n')}

### Descriptions (Strictly <= 90 Characters Each - Google Recommended 4 Descriptions):
${campaign.searchAds?.descriptions
  .map(
    (d, idx) =>
      `${idx + 1}. [${d.language}] ${d.text} (${d.charCount}/90 chars) - Theme: ${d.theme || 'Standard'}`
  )
  .join('\n\n')}

### Sitelinks Extensions:
${campaign.searchAds?.sitelinks
  .map((s, idx) => `${idx + 1}. **${s.title}**: ${s.desc}`)
  .join('\n')}

### Callouts:
${campaign.searchAds?.callouts?.map((c) => `- ${c}`).join('\n')}

---

## 2. Google Display Ads (Responsive Display)
- **Short Headline:** ${campaign.displayAds?.shortHeadline} (${campaign.displayAds?.shortHeadlineCharCount}/30)
- **Long Headline:** ${campaign.displayAds?.longHeadline} (${campaign.displayAds?.longHeadlineCharCount}/90)
- **Description:** ${campaign.displayAds?.description} (${campaign.displayAds?.descriptionCharCount}/90)
- **Chinese Banner Copy:** ${campaign.displayAds?.bannerHeadlineZh}
- **Call-to-Action:** ${campaign.displayAds?.ctaText}
- **Recommended GDN Placements:** ${campaign.displayAds?.targetPlacements.join(', ')}

---

## 3. Academic Keywords & Integrity Shield
### English High-Intent Search Queries:
${campaign.keywords.englishSearchKeywords
  .map((k) => `- ${k.keyword} [${k.matchType}] (Intent: ${k.intent})`)
  .join('\n')}

### Chinese Author Search Queries:
${campaign.keywords.chineseAuthorKeywords
  .map((k) => `- ${k.keywordZh} [${k.matchType}] (意图: ${k.intentZh})`)
  .join('\n')}

### Negative Keywords (Paper Mill Anti-Fraud Firewall):
${campaign.keywords.negativeKeywords.map((neg) => `-${neg}`).join(', ')}
`;

    const blob = new Blob([markdownBrief], { type: 'text/markdown;charset=utf-8' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.setAttribute(
      'download',
      `${campaign.clarivateFacts.journalName.toLowerCase().replace(/\s+/g, '-')}-google-campaign.md`
    );
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 flex flex-col font-sans selection:bg-blue-100 selection:text-blue-900">
      {/* Top Navbar */}
      <Navbar
        onOpenGuide={() => setIsGuideOpen(true)}
        onOpenPlaybook={() => setIsPlaybookOpen(true)}
        onExport={handleExportBrief}
        hasCampaign={!!campaign}
        hasCustomPlaybook={!!customPlaybook}
      />

      {/* Main Content */}
      <main className="flex-1 max-w-6xl w-full mx-auto p-4 sm:p-6 space-y-6">
        {/* Error notification */}
        {error && (
          <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-center justify-between shadow-2xs">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
              <span>{error}</span>
            </div>
            <button
              onClick={() => setError(null)}
              className="text-rose-600 hover:text-rose-900 font-semibold"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* Step 1: Input Studio with Real Clarivate JCR Integration */}
        <section>
          <InputStudio
            landingPageUrl={landingPageUrl}
            onChangeUrl={(url) => setLandingPageUrl(url)}
            selectedChannels={selectedChannels}
            onChangeChannels={setSelectedChannels}
            funnelStage={funnelStage}
            onChangeFunnel={handleChangeFunnel}
            clarivateFacts={clarivateFacts}
            onUpdateClarivateFacts={handleUpdateClarivateFacts}
            onFetchFacts={fetchClarivateFacts}
            onGenerate={() => handleGenerateCampaign()}
            onOpenPlaybook={() => setIsPlaybookOpen(true)}
            hasCustomPlaybook={!!customPlaybook}
            isLoading={isLoading}
            isFetchingFacts={isFetchingFacts}
          />
        </section>

        {/* Step 2: Channel Suite & Ad Presentation Demos */}
        {campaign && (
          <section>
            <ChannelSuite
              campaign={campaign}
              landingPageUrl={landingPageUrl}
              selectedChannels={selectedChannels}
              onEditHeadline={handleEditHeadline}
              onEditDescription={handleEditDescription}
            />
          </section>
        )}
      </main>

      {/* Footer */}
      <footer className="mt-auto border-t border-slate-200 bg-white py-4 px-6 text-center text-xs text-slate-500">
        <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-2">
          <span>
            Springer Nature AdEngine · Google Search &amp; Display Ads for Greater China Authors
          </span>
          <div className="flex items-center gap-3">
            <button
              onClick={() => setIsPlaybookOpen(true)}
              className="text-blue-700 hover:underline font-medium"
            >
              Playbook &amp; Skills Guidelines
            </button>
            <span>·</span>
            <button
              onClick={() => setIsGuideOpen(true)}
              className="text-blue-700 hover:underline font-medium"
            >
              Review Funnel Calibration &amp; Clarivate Integration
            </button>
          </div>
        </div>
      </footer>

      {/* Strategy Guide Modal */}
      <FrameworkModal isOpen={isGuideOpen} onClose={() => setIsGuideOpen(false)} />

      {/* Custom Playbook & Guidelines Skill Modal */}
      <PlaybookSkillModal
        isOpen={isPlaybookOpen}
        onClose={() => setIsPlaybookOpen(false)}
        customPlaybook={customPlaybook}
        onSavePlaybook={handleSavePlaybook}
      />
    </div>
  );
}
