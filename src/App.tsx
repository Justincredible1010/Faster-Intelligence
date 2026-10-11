import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from './auth/AuthGate';
import { AppSidebar, type AppNavId, type PreviewTab } from './components/AppSidebar';
import { StageUrlRulesModal } from './components/StageUrlRulesModal';
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
import { AlertCircle, AlertTriangle } from 'lucide-react';
import { apiFetch } from './auth/api';
import { pickEditableJournalFacts } from './utils/editableJournalFacts';
import { journalUrlsMatch, normalizeJournalUrl } from './utils/journalUrl';
import { formatJifClaim, trustedApcUsd, trustedCasZone, trustedQuartile } from './utils/metricClaims';
import { DEFAULT_STAGE_URL_RULES, type StageUrlRules } from './utils/stageUrlRules';

interface GeneratedFor {
  url: string;
  stage: StageCode;
  search: boolean;
  display: boolean;
  language: OutputLanguage;
}

export default function App() {
  const { admin, user, logout } = useAuth();
  const [landingPageUrl, setLandingPageUrl] = useState<string>('');
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
  const [confirmReplaceEdits, setConfirmReplaceEdits] = useState(false);
  const [generatedFor, setGeneratedFor] = useState<GeneratedFor | null>(null);
  const [stageUrlRules, setStageUrlRules] = useState<StageUrlRules | null>(null);
  const [stageUrlRulesSaved, setStageUrlRulesSaved] = useState(false);
  const [isStageUrlRulesOpen, setIsStageUrlRulesOpen] = useState(false);
  const [previewTab, setPreviewTab] = useState<PreviewTab>('search');
  const [observedNav, setObservedNav] = useState<AppNavId>('studio');
  const [pinnedNav, setPinnedNav] = useState<AppNavId | null>(null);
  const previewTabRef = useRef(previewTab);
  const pinnedNavRef = useRef(pinnedNav);
  previewTabRef.current = previewTab;
  pinnedNavRef.current = pinnedNav;

  // Request race-condition safeguard
  const latestRequestIdRef = useRef<number>(0);
  const activeAbortControllerRef = useRef<AbortController | null>(null);
  const resultsRef = useRef<HTMLElement | null>(null);
  const shouldScrollRef = useRef(false);

  const loadStageUrlRules = async () => {
    try {
      const res = await apiFetch('/api/stage-url-rules');
      if (!res.ok) return;
      const data = await res.json();
      if (data.rules) {
        setStageUrlRules(data.rules);
        setStageUrlRulesSaved(Boolean(data.saved));
      }
    } catch {
      // The suggestion falls back to the source defaults when the rules cannot be loaded.
    }
  };

  useEffect(() => {
    loadStageUrlRules();
  }, []);

  useEffect(() => {
    const order = ['campaign-studio', 'journal-facts', 'stage-and-url', 'campaign-preview', 'exports', 'account'];
    const sectionNav: Record<string, AppNavId> = {
      'campaign-studio': 'studio',
      'journal-facts': 'facts',
      'stage-and-url': 'stage',
      exports: 'exports',
      account: 'account',
    };
    let frame = 0;
    const update = () => {
      frame = 0;
      if (pinnedNavRef.current) return;
      let current: AppNavId = 'studio';
      for (const id of order) {
        const el = document.getElementById(id);
        if (!el) continue;
        if (el.getBoundingClientRect().top <= 140) {
          current = id === 'campaign-preview' ? previewTabRef.current : sectionNav[id];
        }
      }
      setObservedNav(current);
    };
    const onScroll = () => {
      if (frame) return;
      frame = window.requestAnimationFrame(update);
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    update();
    return () => {
      window.removeEventListener('scroll', onScroll);
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, []);

  useEffect(() => {
    if (pinnedNav === 'policy' && !isComplianceModalOpen) setPinnedNav(null);
    if (pinnedNav === 'patterns' && !isStageUrlRulesOpen) setPinnedNav(null);
    if (pinnedNav === 'guide' && !isGuideOpen) setPinnedNav(null);
    if (pinnedNav === 'compare' && !isCompareOpen) setPinnedNav(null);
    if (pinnedNav === 'rules' && !isPlaybookOpen) setPinnedNav(null);
  }, [pinnedNav, isComplianceModalOpen, isStageUrlRulesOpen, isGuideOpen, isCompareOpen, isPlaybookOpen]);

  useEffect(() => {
    if (!shouldScrollRef.current) return;
    if (!isLoading && !campaign) return;
    shouldScrollRef.current = false;
    resultsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [isLoading, campaign]);

  const fetchClarivateFacts = async (url: string, forceRefresh = false) => {
    if (!url || !url.trim()) return;
    setIsFetchingFacts(true);
    setError(null);
    try {
      const res = await apiFetch('/api/fetch-clarivate-facts', {
        method: 'POST',
        body: JSON.stringify({
          url: url.trim(),
          forceRefresh,
          issn: clarivateFacts?.issn || clarivateFacts?.eIssn,
        }),
      });
      const data = await res.json();
      if (data.facts) {
        setClarivateFacts(data.facts);
        await loadStageUrlRules();
        setCampaign((prev) => {
          if (!prev?.clarivateFacts) return prev;
          const samePage = journalUrlsMatch(
            normalizeJournalUrl(prev.clarivateFacts.url),
            normalizeJournalUrl(data.facts.url || url),
          );
          return samePage ? { ...prev, clarivateFacts: data.facts } : prev;
        });
      }
    } catch (err: any) {
      console.error('Failed to fetch Clarivate JCR facts:', err);
    } finally {
      setIsFetchingFacts(false);
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
      setError('Enter the missing journal figures before generating ads.');
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
    shouldScrollRef.current = true;

    const activeChannels = [];
    if (channels.search) activeChannels.push('search');
    if (channels.display) activeChannels.push('display');

    const savedFacts = manualFacts || clarivateFacts;
    const savedFactsMatchUrl = Boolean(
      savedFacts?.url && journalUrlsMatch(normalizeJournalUrl(savedFacts.url), normalizeJournalUrl(url))
    );
    const browserFacts = savedFacts?.verificationStatus === 'user_provided' && savedFactsMatchUrl
      ? savedFacts
      : null;

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
          issn: (manualFacts || clarivateFacts)?.issn || (manualFacts || clarivateFacts)?.eIssn,
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
          setError('Enter the missing journal figures, then generate the ads.');
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
      setGeneratedFor({
        url: url.trim(),
        stage,
        search: channels.search,
        display: channels.display,
        language: lang,
      });
      setHasManualEdits(false);
      setConfirmReplaceEdits(false);
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
**Impact factor:** ${formatJifClaim(campaign.clarivateFacts) ?? 'omitted'}
**Quartile:** ${trustedQuartile(campaign.clarivateFacts) ?? 'omitted (no trusted value)'}
**CAS zone:** ${trustedCasZone(campaign.clarivateFacts) ?? 'omitted (no trusted value)'}
**APC (USD):** ${trustedApcUsd(campaign.clarivateFacts) ?? 'omitted (no trusted value)'}
**Primary Call-to-Action:** "${campaign.primaryCta || cfg.primaryCta}"
**Recommended Destination:** ${campaign.recommendedDestination?.url || campaign.clarivateFacts.url} (${campaign.recommendedDestination?.label || cfg.recommendedDestination.label})
**How the ads were written:** ${campaign.generationSource === 'ai_grounded' ? 'Drafted with AI' : 'Drafted from saved templates'}
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

  const requestGenerate = () => {
    if (!landingPageUrl.trim()) return;
    if (hasManualEdits) {
      setConfirmReplaceEdits(true);
      return;
    }
    handleGenerateCampaign();
  };

  const playbookIsCustom = customPlaybook.trim() !== PRESET_SKILLS.default.trim();

  const scrollToSection = (id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const handlePreviewTab = (tab: PreviewTab) => {
    setPreviewTab(tab);
    if (!pinnedNavRef.current) setObservedNav(tab);
  };

  const handleNav = (id: AppNavId) => {
    if (id === 'search' || id === 'display' || id === 'weibo' || id === 'wechat' || id === 'keywords') {
      setPreviewTab(id);
      setPinnedNav(null);
      setObservedNav(id);
      scrollToSection('campaign-preview');
      return;
    }
    if (id === 'policy') {
      setPinnedNav('policy');
      setIsComplianceModalOpen(true);
      return;
    }
    if (id === 'patterns') {
      setPinnedNav('patterns');
      setIsStageUrlRulesOpen(true);
      return;
    }
    if (id === 'guide') {
      setPinnedNav('guide');
      setIsGuideOpen(true);
      return;
    }
    if (id === 'compare') {
      setPinnedNav('compare');
      setIsCompareOpen(true);
      return;
    }
    if (id === 'rules') {
      setPinnedNav('rules');
      setIsPlaybookOpen(true);
      return;
    }
    const target: Partial<Record<AppNavId, string>> = {
      studio: 'campaign-studio',
      facts: 'journal-facts',
      stage: 'stage-and-url',
      exports: 'exports',
      account: 'account',
    };
    setPinnedNav(null);
    setObservedNav(id);
    const sectionId = target[id];
    if (sectionId) scrollToSection(sectionId);
  };

  const previewIsStale = !!(
    campaign &&
    generatedFor &&
    (
      !journalUrlsMatch(normalizeJournalUrl(landingPageUrl), normalizeJournalUrl(generatedFor.url)) ||
      generatedFor.stage !== funnelStage ||
      generatedFor.language !== outputLanguage ||
      generatedFor.search !== selectedChannels.search ||
      generatedFor.display !== selectedChannels.display
    )
  );

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 font-sans selection:bg-blue-100 selection:text-blue-900">
      <AppSidebar
        mode="app"
        activeId={pinnedNav ?? observedNav}
        onSelect={handleNav}
        admin={admin}
        email={user.email}
        onSignOut={() => {
          logout().catch(() => undefined);
        }}
      />

      <div className="lg:pl-64 min-h-screen flex flex-col pt-14 lg:pt-0">
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

        {confirmReplaceEdits && (
          <div className="p-4 rounded-xl bg-amber-50 border border-amber-300 text-amber-950 text-xs space-y-2">
            <div className="flex items-center gap-2 font-bold">
              <AlertTriangle className="w-4 h-4 text-amber-600" />
              <span>You edited these ads</span>
            </div>
            <p className="text-amber-800 leading-relaxed">
              Generating again replaces the headlines and descriptions you changed.
            </p>
            <div className="flex items-center gap-2 pt-1">
              <button
                type="button"
                onClick={() => {
                  setConfirmReplaceEdits(false);
                  handleGenerateCampaign();
                }}
                className="px-3 py-1 bg-amber-600 hover:bg-amber-700 text-white font-bold rounded-lg transition"
              >
                Generate and replace my edits
              </button>
              <button
                type="button"
                onClick={() => setConfirmReplaceEdits(false)}
                className="px-3 py-1 bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 rounded-lg transition"
              >
                Keep my edits
              </button>
            </div>
          </div>
        )}

        <section>
          <InputStudio
            landingPageUrl={landingPageUrl}
            onChangeUrl={(url) => setLandingPageUrl(url)}
            selectedChannels={selectedChannels}
            onChangeChannels={setSelectedChannels}
            funnelStage={funnelStage}
            onChangeFunnel={setFunnelStage}
            outputLanguage={outputLanguage}
            onChangeOutputLanguage={setOutputLanguage}
            clarivateFacts={clarivateFacts}
            onUpdateClarivateFacts={handleUpdateClarivateFacts}
            onFetchFacts={fetchClarivateFacts}
            onGenerate={requestGenerate}
            onOpenPlaybook={() => setIsPlaybookOpen(true)}
            onOpenCompareStages={() => setIsCompareOpen(true)}
            onOpenAddJournal={() => setIsManualJournalOpen(true)}
            hasCustomPlaybook={playbookIsCustom}
            isLoading={isLoading}
            isFetchingFacts={isFetchingFacts}
            stageUrlRules={stageUrlRules}
          />
        </section>

        <section id="campaign-preview" ref={resultsRef} className="scroll-mt-20 space-y-6">
          <div>
            <h2 className="text-sm font-bold text-slate-900">Campaign preview</h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Search ads, display ads, Weibo, WeChat, and the keyword list show up here.
            </p>
          </div>

          {previewIsStale && campaign && !isLoading && (
            <div className="p-4 rounded-xl bg-amber-50 border border-amber-300 text-amber-950 text-xs">
              These ads were written for <strong>{campaign.clarivateFacts.journalName}</strong>
              {' '}({STAGE_CONFIGS[normalizeStage(generatedFor?.stage || campaign.funnelStage)].shortLabel}).
              The page, stage, language, or channels above have changed. Choose Generate campaign to update this preview.
            </div>
          )}

          {isLoading && (
            <div className="py-12 bg-white border border-slate-200 rounded-2xl shadow-xs flex flex-col items-center justify-center gap-3 text-slate-500">
              <div className="w-8 h-8 border-3 border-blue-200 border-t-blue-600 rounded-full animate-spin" />
              <div className="text-xs font-semibold text-slate-700">
                Writing the {STAGE_CONFIGS[funnelStage].shortLabel.toLowerCase()} ads…
              </div>
              <p className="text-[11px] text-slate-400">
                Checking line length and the stage you chose
              </p>
            </div>
          )}

          {!campaign && !isLoading && (
            <div className="py-10 px-6 bg-white border border-dashed border-slate-300 rounded-2xl text-center">
              <p className="text-sm font-semibold text-slate-800">Nothing generated yet</p>
              <p className="text-xs text-slate-500 mt-1 max-w-md mx-auto leading-relaxed">
                Paste a journal page, choose awareness, consideration, or decision, then choose Generate campaign.
              </p>
            </div>
          )}

          {campaign && !isLoading && (
            <>
              <StrategySummaryBanner
                campaign={campaign}
                onOpenCompareStages={() => setIsCompareOpen(true)}
              />
              <ChannelSuite
                campaign={campaign}
                landingPageUrl={landingPageUrl}
                selectedChannels={selectedChannels}
                previewTab={previewTab}
                onPreviewTabChange={handlePreviewTab}
                onEditHeadline={handleEditHeadline}
                onEditDescription={handleEditDescription}
                onOpenCompliance={() => {
                  setPinnedNav('policy');
                  setIsComplianceModalOpen(true);
                }}
              />
            </>
          )}
        </section>

        <section id="exports" className="scroll-mt-20 bg-white border border-slate-200 rounded-2xl p-5 sm:p-6 shadow-xs space-y-3">
          <h2 className="text-sm font-bold text-slate-900">Exports</h2>
          <p className="text-xs text-slate-500 leading-relaxed max-w-xl">
            Download a spreadsheet you can import into Google Ads Editor, or a brief you can share. Weibo and WeChat are in the note.
          </p>
          <div className="flex flex-col sm:flex-row gap-2">
            <button
              type="button"
              onClick={handleExportCsv}
              disabled={!campaign}
              className="px-4 py-2 bg-[#002d62] hover:bg-[#00224a] text-white text-xs font-semibold rounded-lg disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Spreadsheet
            </button>
            <button
              type="button"
              onClick={handleExportBrief}
              disabled={!campaign}
              className="px-4 py-2 bg-white hover:bg-slate-50 text-slate-800 border border-slate-300 text-xs font-semibold rounded-lg disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Campaign brief
            </button>
          </div>
          {!campaign && (
            <p className="text-[11px] text-slate-500">Generate a campaign before you export.</p>
          )}
        </section>

        <section id="account" className="scroll-mt-20 bg-white border border-slate-200 rounded-2xl p-5 sm:p-6 shadow-xs space-y-3">
          <h2 className="text-sm font-bold text-slate-900">Your account</h2>
          <p className="text-sm text-slate-800 font-medium">{user.email}</p>
          <p className="text-xs text-slate-500 leading-relaxed">
            {admin
              ? 'You are signed in. Open Page patterns in the menu to edit which pages each stage prefers.'
              : 'You are signed in with this email.'}
          </p>
          <button
            type="button"
            onClick={() => {
              logout().catch(() => undefined);
            }}
            className="px-4 py-2 bg-white hover:bg-slate-50 text-slate-800 border border-slate-300 text-xs font-semibold rounded-lg"
          >
            Sign out
          </button>
        </section>
      </main>

      {/* Footer */}
      <footer className="mt-auto border-t border-slate-200 bg-white py-4 px-6 text-center text-xs text-slate-500">
        <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-2">
          <span>
            Marketing Content Generation Engine · Google Search and Display campaigns for awareness, consideration, and decision
          </span>
          <div className="flex items-center gap-3">
            <button
              onClick={() => setIsCompareOpen(true)}
              className="text-blue-700 hover:underline font-medium"
            >
              Compare stages
            </button>
            <span>·</span>
            <button
              onClick={() => setIsPlaybookOpen(true)}
              className="text-blue-700 hover:underline font-medium"
            >
              Writing rules
            </button>
            <span>·</span>
            <button
              onClick={() => setIsComplianceModalOpen(true)}
              className="text-blue-700 hover:underline font-medium"
            >
              Policy check
            </button>
            <span>·</span>
            <button
              onClick={() => setIsGuideOpen(true)}
              className="text-blue-700 hover:underline font-medium"
            >
              How the stages differ
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
        onSelectStage={setFunnelStage}
        currentStage={funnelStage}
      />

      {/* Add / Edit Journal Metrics Modal */}
      <ManualJournalModal
        isOpen={isManualJournalOpen}
        onClose={() => setIsManualJournalOpen(false)}
        initialFacts={clarivateFacts}
        onSaveFacts={handleSaveManualJournal}
      />

      {admin && (
        <StageUrlRulesModal
          isOpen={isStageUrlRulesOpen}
          rules={stageUrlRules ?? DEFAULT_STAGE_URL_RULES}
          saved={stageUrlRulesSaved}
          onClose={() => setIsStageUrlRulesOpen(false)}
          onSaved={(rules, rulesSaved) => {
            setStageUrlRules(rules);
            setStageUrlRulesSaved(rulesSaved);
          }}
        />
      )}

      {/* Google Ads Policy Compliance Modal */}
      <ValidationReportModal
        isOpen={isComplianceModalOpen}
        onClose={() => setIsComplianceModalOpen(false)}
        report={campaign?.complianceReport || (campaign ? runComplianceAudit(campaign) : null)}
        onAutoFix={handleAutoFixCompliance}
      />
      </div>
    </div>
  );
}
