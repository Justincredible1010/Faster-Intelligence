import React, { useState, useEffect, useRef } from 'react';
import { Navbar } from './components/Navbar';
import { InputStudio } from './components/InputStudio';
import { ChannelSuite } from './components/ChannelSuite';
import { FrameworkModal } from './components/FrameworkModal';
import { PlaybookSkillModal, PRESET_SKILLS } from './components/PlaybookSkillModal';
import { StageComparisonModal } from './components/StageComparisonModal';
import { StrategySummaryBanner } from './components/StrategySummaryBanner';
import { ManualJournalModal } from './components/ManualJournalModal';
import { ValidationReportModal } from './components/ValidationReportModal';
import {
  StageCode,
  OutputLanguage,
  STAGE_CONFIGS,
  normalizeStage,
  ClarivateJournalMetrics,
  GeneratedAdCampaign,
  ComplianceValidationReport,
} from './types';
import { runComplianceAudit, autoFixComplianceIssues } from './utils/complianceValidator';
import { downloadGoogleAdsEditorPackage } from './utils/csvExporter';
import { chinaChannelsExportSection } from './china/exportText';
import { AlertCircle, AlertTriangle, Sparkles } from 'lucide-react';
import { apiFetch } from './auth/api';
import { pickEditableJournalFacts } from './utils/editableJournalFacts';
import { NATURE_HOMEPAGE_URL } from './utils/journalUrl';
import { trustedApcUsd, trustedCasZone, trustedImpactFactor, trustedQuartile } from './utils/metricClaims';

const DEFAULT_LANDING_URL = NATURE_HOMEPAGE_URL;

export default function App() {
  const [landingPageUrl, setLandingPageUrl] = useState<string>(DEFAULT_LANDING_URL);
  const [selectedChannels, setSelectedChannels] = useState<{ search: boolean; display: boolean }>({
    search: true,
    display: true,
  });
  const [funnelStage, setFunnelStage] = useState<StageCode>('CON');
  const [outputLanguage, setOutputLanguage] = useState<OutputLanguage>('all');
  const [clarivateFacts, setClarivateFacts] = useState<ClarivateJournalMetrics | null>(null);
  const [campaign, setCampaign] = useState<GeneratedAdCampaign | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isFetchingFacts, setIsFetchingFacts] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [isGuideOpen, setIsGuideOpen] = useState<boolean>(false);
  const [isPlaybookOpen, setIsPlaybookOpen] = useState<boolean>(false);
  const [isCompareOpen, setIsCompareOpen] = useState<boolean>(false);
  const [isManualJournalOpen, setIsManualJournalOpen] = useState<boolean>(false);
  const [isComplianceModalOpen, setIsComplianceModalOpen] = useState<boolean>(false);
  const [customPlaybook, setCustomPlaybook] = useState<string>(PRESET_SKILLS.default);
  const [hasManualEdits, setHasManualEdits] = useState<boolean>(false);
  const [pendingStageChange, setPendingStageChange] = useState<StageCode | null>(null);

  // Request race-condition safeguard
  const latestRequestIdRef = useRef<number>(0);
  const activeAbortControllerRef = useRef<AbortController | null>(null);

  // Initial load
  useEffect(() => {
    fetchClarivateFacts(landingPageUrl);
    handleGenerateCampaign(landingPageUrl, funnelStage, selectedChannels, outputLanguage, customPlaybook);
  }, []);

  const fetchClarivateFacts = async (url: string, forceRefresh = false) => {
    if (!url || !url.trim()) return;
    setIsFetchingFacts(true);
    setError(null);
    try {
      const res = await apiFetch('/api/fetch-clarivate-facts', {
        method: 'POST',
        body: JSON.stringify({ url: url.trim(), forceRefresh }),
      });
      const data = await res.json();
      if (data.facts) {
        setClarivateFacts(data.facts);
        if (campaign) {
          setCampaign((prev) => (prev ? { ...prev, clarivateFacts: data.facts } : null));
        }
      }
    } catch (err: any) {
      console.error('Failed to fetch Clarivate JCR facts:', err);
    } finally {
      setIsFetchingFacts(false);
    }
  };

  const handleStageSelectRequest = (newStage: StageCode) => {
    if (newStage === funnelStage) return;

    if (hasManualEdits) {
      setPendingStageChange(newStage);
      return;
    }

    setFunnelStage(newStage);
    setHasManualEdits(false);
    handleGenerateCampaign(landingPageUrl, newStage, selectedChannels, outputLanguage, customPlaybook);
  };

  const confirmPendingStageChange = () => {
    if (pendingStageChange) {
      setFunnelStage(pendingStageChange);
      setHasManualEdits(false);
      handleGenerateCampaign(landingPageUrl, pendingStageChange, selectedChannels, outputLanguage, customPlaybook);
      setPendingStageChange(null);
    }
  };

  const handleGenerateCampaign = async (
    url = landingPageUrl,
    stage = funnelStage,
    channels = selectedChannels,
    lang = outputLanguage,
    playbook = customPlaybook,
    manualFacts: ClarivateJournalMetrics | null = null
  ) => {
    if (!url.trim()) return;

    // Check if facts are missing before generating
    const currentFacts = manualFacts || clarivateFacts;
    if (currentFacts && currentFacts.verificationStatus === 'missing') {
      setError('Please complete journal metrics before generating campaigns. Key metrics are missing.');
      setIsManualJournalOpen(true);
      return;
    }

    // Increment request ID to ignore stale responses
    const currentRequestId = ++latestRequestIdRef.current;

    // Abort any ongoing fetch
    if (activeAbortControllerRef.current) {
      activeAbortControllerRef.current.abort();
    }
    const abortController = new AbortController();
    activeAbortControllerRef.current = abortController;

    setIsLoading(true);
    setError(null);

    const activeChannels = [];
    if (channels.search) activeChannels.push('search');
    if (channels.display) activeChannels.push('display');

    const browserFacts = manualFacts
      ?? (clarivateFacts?.verificationStatus === 'user_provided' ? clarivateFacts : null);

    try {
      const res = await apiFetch('/api/generate-campaign', {
        method: 'POST',
        signal: abortController.signal,
        body: JSON.stringify({
          landingPageUrl: url.trim(),
          funnelStage: stage,
          outputLanguage: lang,
          channels: activeChannels,
          customPlaybook: playbook,
          userProvidedFacts: browserFacts ? pickEditableJournalFacts(browserFacts) : null,
        }),
      });

      const data = await res.json();

      // Check if this request is still the newest one
      if (currentRequestId !== latestRequestIdRef.current) {
        return;
      }

      if (!res.ok) {
        if (data.missingFields) {
          setError('Please complete journal metrics to continue.');
          setIsManualJournalOpen(true);
        } else {
          throw new Error(data.error || 'Failed to generate campaign');
        }
        return;
      }

      const generated = data.campaign as GeneratedAdCampaign;

      // Run compliance audit
      const audit = runComplianceAudit(generated, generated.clarivateFacts);
      generated.complianceReport = audit;

      setCampaign(generated);
      if (generated.clarivateFacts) {
        setClarivateFacts(generated.clarivateFacts);
      }
      setHasManualEdits(false);
    } catch (err: any) {
      if (err.name === 'AbortError') return;
      if (currentRequestId === latestRequestIdRef.current) {
        console.error(err);
        setError(err.message || 'Generation failed. Please try again.');
      }
    } finally {
      if (currentRequestId === latestRequestIdRef.current) {
        setIsLoading(false);
      }
    }
  };

  const handleSaveManualJournal = async (facts: ClarivateJournalMetrics) => {
    setClarivateFacts(facts);
    try {
      const saveRes = await apiFetch('/api/update-journal-metrics', {
        method: 'POST',
        body: JSON.stringify({ facts }),
      });
      if (!saveRes.ok) {
        const saveData = await saveRes.json().catch(() => ({}));
        setError(saveData.error || 'Failed to save journal metrics');
        return;
      }
    } catch (err) {
      console.warn('Failed to persist manual metrics to server:', err);
    }
    handleGenerateCampaign(landingPageUrl, funnelStage, selectedChannels, outputLanguage, customPlaybook, facts);
  };

  const handleAutoFixCompliance = () => {
    if (!campaign) return;
    const fixed = autoFixComplianceIssues(campaign);
    setCampaign(fixed);
  };

  const handleUpdateClarivateFacts = (updated: ClarivateJournalMetrics) => {
    setClarivateFacts(updated);
    if (campaign) {
      setCampaign((prev) => (prev ? { ...prev, clarivateFacts: updated } : null));
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
    const updatedCampaign = {
      ...campaign,
      searchAds: {
        ...campaign.searchAds,
        headlines: updatedHeadlines,
      },
    };
    updatedCampaign.complianceReport = runComplianceAudit(updatedCampaign);
    setCampaign(updatedCampaign);
    setHasManualEdits(true);
  };

  const handleEditDescription = (index: number, newText: string) => {
    if (!campaign || !campaign.searchAds) return;
    const updatedDescs = [...campaign.searchAds.descriptions];
    updatedDescs[index] = {
      ...updatedDescs[index],
      text: newText,
      charCount: newText.length,
    };
    const updatedCampaign = {
      ...campaign,
      searchAds: {
        ...campaign.searchAds,
        descriptions: updatedDescs,
      },
    };
    updatedCampaign.complianceReport = runComplianceAudit(updatedCampaign);
    setCampaign(updatedCampaign);
    setHasManualEdits(true);
  };

  const handleSavePlaybook = (newPlaybook: string) => {
    setCustomPlaybook(newPlaybook);
    handleGenerateCampaign(landingPageUrl, funnelStage, selectedChannels, outputLanguage, newPlaybook);
  };

  const handleExportCsv = () => {
    if (!campaign) return;
    downloadGoogleAdsEditorPackage(campaign);
  };

  const handleExportBrief = () => {
    if (!campaign) return;
    const stage = normalizeStage(campaign.funnelStage);
    const cfg = STAGE_CONFIGS[stage];

    const markdownBrief = `# Springer Nature Google Ads Campaign Brief
**Journal:** ${campaign.clarivateFacts.journalName} (${campaign.clarivateFacts.publisher})
**Author Stage:** ${cfg.name}
**Author Mindset:** ${cfg.authorMindset}
**Campaign Objective:** ${cfg.campaignObjective}
**Impact factor:** ${trustedImpactFactor(campaign.clarivateFacts) ?? 'omitted (no trusted value)'}
**Quartile:** ${trustedQuartile(campaign.clarivateFacts) ?? 'omitted (no trusted value)'}
**CAS zone:** ${trustedCasZone(campaign.clarivateFacts) ?? 'omitted (no trusted value)'}
**APC (USD):** ${trustedApcUsd(campaign.clarivateFacts) ?? 'omitted (no trusted value)'}
**Primary Call-to-Action:** "${campaign.primaryCta || cfg.primaryCta}"
**Recommended Destination:** ${campaign.recommendedDestination?.url || campaign.clarivateFacts.url} (${campaign.recommendedDestination?.label || cfg.recommendedDestination.label})
**Generation Engine:** ${campaign.generationSource === 'ai_grounded' ? 'AI-Grounded (Gemini 3.8)' : 'Curated Publishing Strategy Fallback'}
**Generated Date:** ${new Date().toLocaleDateString()}

---

## 1. Google Responsive Search Ads (RSA)
### Headlines (Strictly <= 30 Visual Width Each):
${campaign.searchAds?.headlines
  .map(
    (h, idx) =>
      `${idx + 1}. [${h.language}] ${h.text} (${h.charCount}/30 chars) - Category: ${h.category || 'General'}`
  )
  .join('\n')}

### Descriptions (Strictly <= 90 Visual Width Each):
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
- **Short Headline:** ${campaign.displayAds?.shortHeadline}
- **Long Headline:** ${campaign.displayAds?.longHeadline}
- **Description:** ${campaign.displayAds?.description}
- **Chinese Banner Copy:** ${campaign.displayAds?.bannerHeadlineZh}
- **Call-to-Action Text:** ${campaign.displayAds?.ctaText}
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

### Negative Keywords (Academic Integrity Firewall):
${campaign.keywords.negativeKeywords.map((neg) => `-${neg}`).join(', ')}

---

${chinaChannelsExportSection(campaign)}
`;

    const blob = new Blob([markdownBrief], { type: 'text/markdown;charset=utf-8' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.setAttribute(
      'download',
      `${campaign.clarivateFacts.journalName.toLowerCase().replace(/\s+/g, '-')}-${stage.toLowerCase()}-google-campaign.md`
    );
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const hasPolicyWarnings =
    campaign?.complianceReport?.status === 'has_warnings' ||
    campaign?.complianceReport?.status === 'has_errors';

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 flex flex-col font-sans selection:bg-blue-100 selection:text-blue-900">
      {/* Top Navbar */}
      <Navbar
        onOpenGuide={() => setIsGuideOpen(true)}
        onOpenPlaybook={() => setIsPlaybookOpen(true)}
        onOpenCompareStages={() => setIsCompareOpen(true)}
        onOpenCompliance={() => setIsComplianceModalOpen(true)}
        onExportMarkdown={handleExportBrief}
        onExportCsv={handleExportCsv}
        hasCampaign={!!campaign}
        hasCustomPlaybook={!!customPlaybook}
        hasPolicyWarnings={hasPolicyWarnings}
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

        {/* Unsaved manual edits warning before changing stage */}
        {pendingStageChange && (
          <div className="p-4 rounded-xl bg-amber-50 border border-amber-300 text-amber-950 text-xs space-y-2">
            <div className="flex items-center gap-2 font-bold">
              <AlertTriangle className="w-4 h-4 text-amber-600" />
              <span>Unsaved Manual Edits Detected</span>
            </div>
            <p className="text-amber-800 leading-relaxed">
              You have made custom edits to the current campaign headlines or descriptions. Switching to{' '}
              <strong>{STAGE_CONFIGS[pendingStageChange].name}</strong> will regenerate stage-tailored copy and discard unsaved edits.
            </p>
            <div className="flex items-center gap-2 pt-1">
              <button
                type="button"
                onClick={confirmPendingStageChange}
                className="px-3 py-1 bg-amber-600 hover:bg-amber-700 text-white font-bold rounded-lg transition"
              >
                Proceed &amp; Switch Stage
              </button>
              <button
                type="button"
                onClick={() => setPendingStageChange(null)}
                className="px-3 py-1 bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 rounded-lg transition"
              >
                Keep Current Edits
              </button>
            </div>
          </div>
        )}

        {/* Step 1 & 2: Input Studio with Clarivate JCR & Rich Stage Selector */}
        <section>
          <InputStudio
            landingPageUrl={landingPageUrl}
            onChangeUrl={(url) => setLandingPageUrl(url)}
            selectedChannels={selectedChannels}
            onChangeChannels={setSelectedChannels}
            funnelStage={funnelStage}
            onChangeFunnel={handleStageSelectRequest}
            outputLanguage={outputLanguage}
            onChangeOutputLanguage={(l) => {
              setOutputLanguage(l);
              handleGenerateCampaign(landingPageUrl, funnelStage, selectedChannels, l, customPlaybook);
            }}
            clarivateFacts={clarivateFacts}
            onUpdateClarivateFacts={handleUpdateClarivateFacts}
            onFetchFacts={fetchClarivateFacts}
            onGenerate={() => handleGenerateCampaign()}
            onOpenPlaybook={() => setIsPlaybookOpen(true)}
            onOpenCompareStages={() => setIsCompareOpen(true)}
            onOpenAddJournal={() => setIsManualJournalOpen(true)}
            hasCustomPlaybook={!!customPlaybook}
            isLoading={isLoading}
            isFetchingFacts={isFetchingFacts}
          />
        </section>

        {/* Compact Strategy Summary Banner above campaign results */}
        {campaign && !isLoading && (
          <section>
            <StrategySummaryBanner
              campaign={campaign}
              onOpenCompareStages={() => setIsCompareOpen(true)}
            />
          </section>
        )}

        {/* Loading overlay indicator while generating */}
        {isLoading && (
          <div className="py-12 bg-white border border-slate-200 rounded-2xl shadow-xs flex flex-col items-center justify-center gap-3 text-slate-500">
            <div className="w-8 h-8 border-3 border-blue-200 border-t-blue-600 rounded-full animate-spin" />
            <div className="text-xs font-semibold text-slate-700">
              Generating {STAGE_CONFIGS[funnelStage].name} campaign copy...
            </div>
            <p className="text-[11px] text-slate-400">
              Applying stage-specific messaging priorities and Google Ads constraints
            </p>
          </div>
        )}

        {/* Step 3: Channel Suite & Ad Previews */}
        {campaign && !isLoading && (
          <section>
            <ChannelSuite
              campaign={campaign}
              landingPageUrl={landingPageUrl}
              selectedChannels={selectedChannels}
              onEditHeadline={handleEditHeadline}
              onEditDescription={handleEditDescription}
              onOpenCompliance={() => setIsComplianceModalOpen(true)}
            />
          </section>
        )}
      </main>

      {/* Footer */}
      <footer className="mt-auto border-t border-slate-200 bg-white py-4 px-6 text-center text-xs text-slate-500">
        <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-2">
          <span>
            Marketing Content Generation Engine · Tailored Google Campaigns across Awareness, Consideration &amp; Decision
          </span>
          <div className="flex items-center gap-3">
            <button
              onClick={() => setIsCompareOpen(true)}
              className="text-blue-700 hover:underline font-medium"
            >
              Compare 3 Stages
            </button>
            <span>·</span>
            <button
              onClick={() => setIsPlaybookOpen(true)}
              className="text-blue-700 hover:underline font-medium"
            >
              Custom Playbook
            </button>
            <span>·</span>
            <button
              onClick={() => setIsComplianceModalOpen(true)}
              className="text-blue-700 hover:underline font-medium"
            >
              Policy Audit
            </button>
            <span>·</span>
            <button
              onClick={() => setIsGuideOpen(true)}
              className="text-blue-700 hover:underline font-medium"
            >
              Funnel Framework
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

      {/* Side-by-Side Stage Comparison Modal */}
      <StageComparisonModal
        isOpen={isCompareOpen}
        onClose={() => setIsCompareOpen(false)}
        landingPageUrl={landingPageUrl}
        clarivateFacts={clarivateFacts}
        onSelectStage={(st) => handleStageSelectRequest(st)}
        currentStage={funnelStage}
      />

      {/* Add / Edit Journal Metrics Modal */}
      <ManualJournalModal
        isOpen={isManualJournalOpen}
        onClose={() => setIsManualJournalOpen(false)}
        initialFacts={clarivateFacts}
        onSaveFacts={handleSaveManualJournal}
      />

      {/* Google Ads Policy Compliance Modal */}
      <ValidationReportModal
        isOpen={isComplianceModalOpen}
        onClose={() => setIsComplianceModalOpen(false)}
        report={campaign?.complianceReport || (campaign ? runComplianceAudit(campaign) : null)}
        onAutoFix={handleAutoFixCompliance}
      />
    </div>
  );
}
