import React, { useState } from 'react';
import {
  Search,
  ExternalLink,
  Shuffle,
  Smartphone,
  Monitor,
  Star,
  Sparkles,
  Info,
  CheckCircle2,
  AlertTriangle,
  Globe,
  Sliders,
} from 'lucide-react';
import {
  GoogleSearchAds,
  StageCode,
  STAGE_CONFIGS,
  normalizeStage,
  ClarivateJournalMetrics,
} from '../types';
import { countCharacterWidth, formatCharCountLabel } from '../utils/textUtils';
import { deriveDisplayUrl } from '../utils/csvExporter';
import { metricsFromClarivateWos, trustedImpactFactor } from '../utils/metricClaims';

interface Props {
  ads: GoogleSearchAds;
  displayUrl: string;
  stage: StageCode;
  facts: ClarivateJournalMetrics;
  onEditHeadline?: (index: number, text: string) => void;
  onEditDescription?: (index: number, text: string) => void;
}

export const SearchResultsMockup: React.FC<Props> = ({
  ads,
  displayUrl,
  stage,
  facts,
  onEditHeadline,
  onEditDescription,
}) => {
  const [deviceMode, setDeviceMode] = useState<'desktop' | 'mobile'>('desktop');
  const [activeHeadlineIndices, setActiveHeadlineIndices] = useState<number[]>([0, 1, 2]);
  const [activeDescIndices, setActiveDescIndices] = useState<number[]>([0, 1]);
  const [isEditing, setIsEditing] = useState(false);

  const stageCfg = STAGE_CONFIGS[normalizeStage(stage)];
  const headlines = ads.headlines || [];
  const descriptions = ads.descriptions || [];

  // Stage example query for the search bar
  const defaultQuery =
    stage === 'AWA'
      ? `${facts.primaryDiscipline?.split('(')[0]?.trim().toLowerCase() || 'scientific'} research articles`
      : stage === 'CON'
      ? trustedImpactFactor(facts) != null
        ? `[${facts.journalName.toLowerCase()} impact factor]`
        : `"${facts.journalName.toLowerCase()} aims and scope"`
      : `[submit manuscript ${facts.journalName.toLowerCase()}]`;

  const [searchQuery, setSearchQuery] = useState(defaultQuery);

  // Shuffle headlines & descriptions to simulate Google Ads Machine Learning rotation
  const handleShuffle = () => {
    if (headlines.length < 3) return;
    const allHIndices = headlines.map((_, i) => i);
    const shuffledH = [...allHIndices].sort(() => 0.5 - Math.random());
    setActiveHeadlineIndices(shuffledH.slice(0, 3));

    if (descriptions.length >= 2) {
      const allDIndices = descriptions.map((_, i) => i);
      const shuffledD = [...allDIndices].sort(() => 0.5 - Math.random());
      setActiveDescIndices(shuffledD.slice(0, 2));
    }
  };

  // Selected headlines for display
  const h1 = headlines[activeHeadlineIndices[0]]?.text || headlines[0]?.text || facts.journalName;
  const h2 =
    headlines[activeHeadlineIndices[1]]?.text ||
    headlines[1]?.text ||
    `${facts.publisher} Journals`;
  const h3 = headlines[activeHeadlineIndices[2]]?.text || headlines[2]?.text || stageCfg.primaryCta;

  // Selected descriptions for display
  const d1 =
    descriptions[activeDescIndices[0]]?.text ||
    descriptions[0]?.text ||
    facts.aimsAndScopeSummary ||
    '';
  const d2 =
    descriptions[activeDescIndices[1]]?.text ||
    descriptions[1]?.text ||
    `Published by ${facts.publisher}. Peer-reviewed research.`;

  // Calculated Ad Strength (1 to 4 stars)
  const calculateAdStrength = (): { score: number; label: string; tips: string[] } => {
    let score = 1;
    const tips: string[] = [];

    if (headlines.length >= 10) score += 1;
    else tips.push('Add more headlines (up to 15) to improve machine-learning rotation');

    if (descriptions.length >= 3) score += 1;
    else tips.push('Provide at least 4 descriptions');

    const coversBrand = headlines.some((h) =>
      h.text.toLowerCase().includes(facts.journalName.toLowerCase())
    );
    const coversCta = headlines.some((h) =>
      h.category?.includes('Call to Action') || h.text.toLowerCase().includes('explore') || h.text.toLowerCase().includes('submit') || h.text.toLowerCase().includes('fit')
    );
    if (coversBrand && coversCta) score += 1;
    else tips.push('Ensure both journal branding and stage-specific CTAs are present');

    const cappedScore = Math.min(score, 4);
    const label =
      cappedScore === 4
        ? 'Excellent'
        : cappedScore === 3
        ? 'Good'
        : cappedScore === 2
        ? 'Average'
        : 'Poor';

    return { score: cappedScore, label, tips };
  };

  const adStrength = calculateAdStrength();
  const fullDisplayUrl = deriveDisplayUrl(ads.recommendedFinalUrl || displayUrl);

  return (
    <div className="space-y-6">
      {/* SERP Toolbar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-100 p-3 rounded-xl border border-slate-200">
        <div className="flex items-center gap-3">
          {/* Device Toggle */}
          <div className="flex items-center bg-white border border-slate-200 rounded-lg p-0.5 shadow-2xs">
            <button
              onClick={() => setDeviceMode('desktop')}
              className={`flex items-center gap-1.5 px-3 py-1 text-xs font-semibold rounded-md transition ${
                deviceMode === 'desktop'
                  ? 'bg-[#002d62] text-white shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Monitor className="w-3.5 h-3.5" />
              <span>Desktop SERP</span>
            </button>
            <button
              onClick={() => setDeviceMode('mobile')}
              className={`flex items-center gap-1.5 px-3 py-1 text-xs font-semibold rounded-md transition ${
                deviceMode === 'mobile'
                  ? 'bg-[#002d62] text-white shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Smartphone className="w-3.5 h-3.5" />
              <span>Mobile SERP (375px)</span>
            </button>
          </div>

          {/* Shuffle Button */}
          <button
            onClick={handleShuffle}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 rounded-lg shadow-2xs transition"
            title="Simulate Google Ads Responsive Search Ad rotation"
          >
            <Shuffle className="w-3.5 h-3.5 text-blue-600" />
            <span>Shuffle RSA Rotation</span>
          </button>
        </div>

        {/* Ad Strength Rating */}
        <div className="flex items-center gap-2 bg-white px-3 py-1 rounded-lg border border-slate-200 shadow-2xs text-xs">
          <span className="text-slate-500 font-medium">Ad Strength:</span>
          <div className="flex items-center text-amber-500">
            {[1, 2, 3, 4].map((i) => (
              <Star
                key={i}
                className={`w-3.5 h-3.5 ${
                  i <= adStrength.score ? 'fill-amber-400 text-amber-400' : 'text-slate-300'
                }`}
              />
            ))}
          </div>
          <span
            className={`font-bold ${
              adStrength.score >= 3 ? 'text-emerald-700' : 'text-amber-700'
            }`}
          >
            {adStrength.label}
          </span>
        </div>
      </div>

      {/* Simulated Google Search Results Page */}
      <div
        className={`mx-auto bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden transition-all duration-300 ${
          deviceMode === 'mobile' ? 'max-w-[390px]' : 'w-full'
        }`}
      >
        {/* Google Header & Search Bar */}
        <div className="p-4 border-b border-slate-200 bg-white">
          <div className="flex items-center gap-3">
            <span className="text-xl font-bold tracking-tight">
              <span className="text-[#4285F4]">G</span>
              <span className="text-[#EA4335]">o</span>
              <span className="text-[#FBBC05]">o</span>
              <span className="text-[#4285F4]">g</span>
              <span className="text-[#34A853]">l</span>
              <span className="text-[#EA4335]">e</span>
            </span>
            <div className="flex-1 flex items-center gap-2 bg-slate-50 border border-slate-300 rounded-full px-4 py-2 text-xs text-slate-800 shadow-inner">
              <Search className="w-3.5 h-3.5 text-slate-400 shrink-0" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-transparent focus:outline-none font-medium truncate"
                placeholder="Search Google..."
              />
            </div>
          </div>
        </div>

        {/* SERP Search Results Container */}
        <div className="p-5 sm:p-7 space-y-6 bg-white font-sans text-slate-800">
          {/* 1. Candidate Google Sponsored Ad */}
          <div className="space-y-1.5 pb-6 border-b border-slate-200">
            {/* Top Advertiser Row */}
            <div className="flex items-center gap-2 text-xs">
              <span className="font-bold text-slate-900 text-[11px] bg-slate-100 px-1.5 py-0.5 rounded text-black">
                Sponsored
              </span>
              <span className="text-slate-300">·</span>
              <div className="w-4 h-4 rounded-full bg-blue-100 text-[#002d62] flex items-center justify-center font-bold text-[9px]">
                {facts.publisher?.charAt(0) || 'S'}
              </div>
              <span className="font-medium text-slate-700 text-xs truncate max-w-[200px]">
                {facts.publisher || 'Springer Nature'}
              </span>
              <span className="text-slate-400">https://{fullDisplayUrl}</span>
            </div>

            {/* Blue Headline (H1 | H2 | H3) */}
            <h2 className="text-base sm:text-lg font-normal text-[#1a0dab] hover:underline cursor-pointer leading-snug">
              {h1} | {h2} | {h3}
            </h2>

            {/* Description lines */}
            <p className="text-xs sm:text-[13px] text-[#4d5156] leading-relaxed">
              {d1} {d2}
            </p>

            {/* Callouts */}
            {ads.callouts && ads.callouts.length > 0 && (
              <div className="text-xs text-[#4d5156] pt-0.5">
                {ads.callouts.slice(0, 4).join(' · ')}
              </div>
            )}

            {/* Structured Snippets */}
            {ads.structuredSnippet && (
              <div className="text-xs text-[#4d5156]">
                <span className="font-semibold">{ads.structuredSnippet.header}:</span>{' '}
                {ads.structuredSnippet.values.join(', ')}
              </div>
            )}

            {/* Sitelink Extensions */}
            {ads.sitelinks && ads.sitelinks.length > 0 && (
              <div
                className={`pt-3 ${
                  deviceMode === 'mobile'
                    ? 'flex gap-2 overflow-x-auto pb-1'
                    : 'grid grid-cols-2 gap-x-4 gap-y-2'
                }`}
              >
                {ads.sitelinks.slice(0, 4).map((site, sIdx) => (
                  <div
                    key={sIdx}
                    className={`rounded-lg p-2 transition ${
                      deviceMode === 'mobile'
                        ? 'min-w-[180px] bg-slate-50 border border-slate-200'
                        : 'hover:bg-slate-50'
                    }`}
                  >
                    <div className="text-xs font-medium text-[#1a0dab] hover:underline cursor-pointer truncate">
                      {site.title}
                    </div>
                    <div className="text-[11px] text-[#4d5156] line-clamp-1">
                      {site.desc}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* 2. Realistic Organic Search Results (Contextual Backdrop) */}
          <div className="space-y-5 opacity-75">
            <div className="space-y-1">
              <div className="flex items-center gap-1.5 text-[11px] text-slate-500">
                <Globe className="w-3 h-3 text-slate-400" />
                <span>www.nature.com &gt; articles</span>
              </div>
              <h3 className="text-sm font-normal text-[#1a0dab] hover:underline cursor-pointer">
                {facts.journalName} - Latest Published Research &amp; Articles
              </h3>
              <p className="text-xs text-[#4d5156] leading-relaxed">
                Browse open-access and original research articles recently accepted in{' '}
                {facts.journalName}. Featuring peer-reviewed findings in{' '}
                {facts.primaryDiscipline || 'scientific research'}.
              </p>
            </div>

            <div className="space-y-1">
              <div className="flex items-center gap-1.5 text-[11px] text-slate-500">
                <Globe className="w-3 h-3 text-slate-400" />
                <span>clarivate.com &gt; jcr &gt; browse</span>
              </div>
              <h3 className="text-sm font-normal text-[#1a0dab] hover:underline cursor-pointer">
                {facts.journalName} journal information
              </h3>
              <p className="text-xs text-[#4d5156] leading-relaxed">
                {trustedImpactFactor(facts) != null
                  ? `${facts.journalName} impact factor ${trustedImpactFactor(facts)}${metricsFromClarivateWos(facts) ? ` (clarivate_wos_journals_api JCR ${facts.jcrYear ?? ''})` : ''}.`
                  : `${facts.journalName}. Aims, scope, and author information.`}
                {facts.indexing?.length ? ` Indexed in ${facts.indexing.join(', ')}.` : ''}
              </p>
            </div>

            <div className="space-y-1">
              <div className="flex items-center gap-1.5 text-[11px] text-slate-500">
                <Globe className="w-3 h-3 text-slate-400" />
                <span>springer.com &gt; authors &gt; submission-guide</span>
              </div>
              <h3 className="text-sm font-normal text-[#1a0dab] hover:underline cursor-pointer">
                Author Guidelines &amp; Formatting Guide for {facts.journalName}
              </h3>
              <p className="text-xs text-[#4d5156] leading-relaxed">
                Prepare your manuscript for peer review. Download article templates, check open
                access APC details (${facts.apcUsd || 'standard'}), and view submission checklists.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
