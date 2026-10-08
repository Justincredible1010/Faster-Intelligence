import React, { useState } from 'react';
import {
  Layout,
  ExternalLink,
  Info,
  CheckCircle2,
  AlertCircle,
  Copy,
  Check,
  Sparkles,
  Sliders,
  Maximize2,
  Layers,
} from 'lucide-react';
import {
  GoogleDisplayAd,
  StageCode,
  STAGE_CONFIGS,
  normalizeStage,
  ClarivateJournalMetrics,
} from '../types';
import { countCharacterWidth, formatCharCountLabel } from '../utils/textUtils';
import { deriveDisplayUrl } from '../utils/csvExporter';
import {
  formatJifClaim,
  trustedCasZone,
  trustedFirstDecisionDays,
} from '../utils/metricClaims';

interface Props {
  content: GoogleDisplayAd;
  facts: ClarivateJournalMetrics;
  stage: StageCode;
  onUpdateContent?: (updated: GoogleDisplayAd) => void;
}

export const DisplayAdCanvas: React.FC<Props> = ({
  content,
  facts,
  stage,
  onUpdateContent,
}) => {
  const [selectedFormat, setSelectedFormat] = useState<string>('all');
  const [copiedBrief, setCopiedBrief] = useState(false);
  const jifClaim = formatJifClaim(facts);
  const casZone = trustedCasZone(facts);
  const firstDecisionDays = trustedFirstDecisionDays(facts);

  const stageCfg = STAGE_CONFIGS[normalizeStage(stage)];
  const shortH = content.shortHeadline || `Discover ${facts.journalName}`;
  const longH = content.longHeadline || `High-Impact Research in ${facts.journalName}`;
  const desc = content.description || facts.aimsAndScopeSummary || '';
  const cta = content.ctaText || stageCfg.primaryCta;
  const publisher = facts.publisher || 'Springer Nature';
  const journalName = facts.journalName || 'Journal';

  // Validation
  const shortHWidth = countCharacterWidth(shortH);
  const longHWidth = countCharacterWidth(longH);
  const descWidth = countCharacterWidth(desc);

  // Stage theme colors
  const stageThemeColors: Record<StageCode, { primary: string; hover: string; bg: string; border: string }> = {
    AWA: { primary: '#0284c7', hover: '#0369a1', bg: '#f0f9ff', border: '#bae6fd' }, // Blue
    CON: { primary: '#4f46e5', hover: '#4338ca', bg: '#eef2ff', border: '#c7d2fe' }, // Indigo
    DEC: { primary: '#059669', hover: '#047857', bg: '#ecfdf5', border: '#a7f3d0' }, // Emerald
  };

  const theme = stageThemeColors[normalizeStage(stage)];

  const copyDesignBrief = () => {
    const brief = `Google Display Ad Creative Brief:
Journal: ${journalName} (${publisher})
Stage: ${stageCfg.name}
CTA: "${cta}"
Short Headline (<=30 width): "${shortH}" (${shortHWidth}/30)
Long Headline (<=90 width): "${longH}" (${longHWidth}/90)
Description (<=90 width): "${desc}" (${descWidth}/90)
Chinese Subtext: "${content.bannerHeadlineZh}"
Visual Direction Prompt: ${content.visualConceptPrompt}
Target GDN Placements: ${content.targetPlacements?.join(', ')}`;

    navigator.clipboard.writeText(brief);
    setCopiedBrief(true);
    setTimeout(() => setCopiedBrief(false), 2000);
  };

  return (
    <div className="space-y-6">
      {/* Top Banner Toolbar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 rounded-xl bg-slate-100 border border-slate-200">
        <div>
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800 flex items-center gap-1.5">
            <Layout className="w-4 h-4 text-blue-600" />
            <span>Banner sizes</span>
          </h3>
          <p className="text-[11px] text-slate-500">
            Real-time layout simulation across desktop leaderboards, mobile units, rectangles &amp; native cards
          </p>
        </div>

        <div className="flex items-center gap-2">
          <select
            value={selectedFormat}
            onChange={(e) => setSelectedFormat(e.target.value)}
            className="px-3 py-1.5 text-xs font-medium bg-white border border-slate-300 rounded-lg shadow-2xs focus:outline-none"
          >
            <option value="all">All banner sizes</option>
            <option value="300x250">Medium Rectangle (300×250)</option>
            <option value="728x90">Leaderboard (728×90)</option>
            <option value="300x600">Half Page (300×600)</option>
            <option value="320x50">Mobile Banner (320×50)</option>
            <option value="250x250">Square (250×250)</option>
            <option value="landscape">Landscape 1.91:1 (728×380)</option>
            <option value="native">Native In-Feed Card</option>
          </select>

          <button
            onClick={copyDesignBrief}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-white hover:bg-slate-50 text-slate-700 border border-slate-300 rounded-lg shadow-2xs transition"
          >
            {copiedBrief ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
            <span>Copy the design note</span>
          </button>
        </div>
      </div>

      {/* Real-time Character Width Warnings if any */}
      {(shortHWidth > 30 || longHWidth > 90 || descWidth > 90) && (
        <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-800 space-y-1">
          <div className="font-bold flex items-center gap-1.5 text-rose-900">
            <AlertCircle className="w-4 h-4 text-rose-600" />
            <span>Character Limit Warning in Display Ad Copy</span>
          </div>
          {shortHWidth > 30 && (
            <p>• Short Headline exceeds Google Ads 30-width limit ({shortHWidth}/30 width).</p>
          )}
          {longHWidth > 90 && (
            <p>• Long Headline exceeds Google Ads 90-width limit ({longHWidth}/90 width).</p>
          )}
          {descWidth > 90 && (
            <p>• Description exceeds Google Ads 90-width limit ({descWidth}/90 width).</p>
          )}
        </div>
      )}

      {/* Responsive Display Canvas Grid */}
      <div className="space-y-8">
        {/* Unit 1: 300x250 Medium Rectangle & 250x250 Square */}
        {(selectedFormat === 'all' || selectedFormat === '300x250' || selectedFormat === '250x250') && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-start">
            {/* Medium Rectangle: 300x250 */}
            {(selectedFormat === 'all' || selectedFormat === '300x250') && (
              <div className="space-y-2">
                <div className="flex items-center justify-between text-[11px] text-slate-500 font-mono">
                  <span>Medium Rectangle (300 × 250)</span>
                  <span>Common banner sizes</span>
                </div>
                <div className="w-[300px] h-[250px] mx-auto bg-slate-900 text-white rounded-lg p-4 flex flex-col justify-between border border-slate-700 shadow-md relative overflow-hidden">
                  {/* Top Header */}
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] text-blue-300 font-bold uppercase tracking-wider">
                      {publisher}
                    </span>
                    <span className="text-[9px] bg-white/20 text-slate-200 px-1 py-0.5 rounded">
                      AdChoices
                    </span>
                  </div>

                  {/* Body Content */}
                  <div className="space-y-1.5 my-auto">
                    <div className="text-xs text-amber-300 font-semibold truncate">
                      {journalName}{jifClaim ? ` · ${jifClaim}` : ''}
                    </div>
                    <h4 className="text-sm font-bold leading-snug line-clamp-2 text-white">
                      {shortH}
                    </h4>
                    <p className="text-[11px] text-slate-300 line-clamp-2 leading-tight">
                      {desc}
                    </p>
                  </div>

                  {/* Bottom CTA */}
                  <div className="flex items-center justify-between pt-2 border-t border-white/10">
                    <span className="text-[10px] text-slate-400 font-mono truncate max-w-[120px]">
                      {deriveDisplayUrl(facts.url || '')}
                    </span>
                    <button
                      style={{ backgroundColor: theme.primary }}
                      className="px-3 py-1.5 text-[11px] font-bold text-white rounded shadow-sm hover:opacity-90 transition truncate max-w-[140px]"
                    >
                      {cta}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Square: 250x250 / 300x300 */}
            {(selectedFormat === 'all' || selectedFormat === '250x250') && (
              <div className="space-y-2">
                <div className="flex items-center justify-between text-[11px] text-slate-500 font-mono">
                  <span>Square (250 × 250)</span>
                  <span>1:1 Ratio</span>
                </div>
                <div className="w-[250px] h-[250px] mx-auto bg-gradient-to-br from-slate-900 to-slate-800 text-white rounded-lg p-3.5 flex flex-col justify-between border border-slate-700 shadow-md relative">
                  <div className="flex items-center justify-between text-[9px]">
                    <span className="text-sky-300 font-bold truncate max-w-[170px]">{publisher}</span>
                    <span className="bg-white/20 px-1 py-0.5 rounded">Ad</span>
                  </div>

                  <div className="text-center space-y-2 my-auto">
                    <div className="inline-block px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-300 text-[10px] font-bold">
                      {casZone ? casZone.slice(0, 11) : 'Peer-Reviewed'}
                    </div>
                    <div className="font-bold text-xs text-white line-clamp-2">
                      {shortH}
                    </div>
                    <div className="text-[10px] text-slate-300 line-clamp-2">
                      {content.bannerHeadlineZh || desc}
                    </div>
                  </div>

                  <button
                    style={{ backgroundColor: theme.primary }}
                    className="w-full py-1.5 text-xs font-bold text-white rounded hover:opacity-90 transition"
                  >
                    {cta}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Unit 2: 728x90 Leaderboard */}
        {(selectedFormat === 'all' || selectedFormat === '728x90') && (
          <div className="space-y-2">
            <div className="flex items-center justify-between text-[11px] text-slate-500 font-mono">
              <span>Leaderboard (728 × 90)</span>
              <span>Desktop Standard</span>
            </div>
            <div className="max-w-[728px] h-[90px] mx-auto bg-slate-900 text-white rounded-lg px-4 py-2.5 flex items-center justify-between gap-4 border border-slate-700 shadow-md overflow-hidden">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded bg-[#002d62] text-white flex items-center justify-center font-bold text-xs border border-blue-400 shrink-0">
                  {journalName.slice(0, 2)}
                </div>
                <div className="space-y-0.5 max-w-[340px]">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] text-blue-300 font-semibold">{publisher}</span>
                    <span className="text-[9px] bg-slate-800 text-slate-300 px-1 rounded">Sponsored</span>
                  </div>
                  <div className="text-xs font-bold truncate text-white">{longH}</div>
                  <div className="text-[11px] text-slate-300 truncate">{desc}</div>
                </div>
              </div>

              <div className="flex items-center gap-3 shrink-0">
                <div className="text-right hidden sm:block">
                  <div className="text-[10px] text-amber-300 font-bold">
                    {jifClaim || journalName}
                  </div>
                  <div className="text-[9px] text-slate-400">
                    {firstDecisionDays != null ? `${firstDecisionDays} Days Review` : 'Peer-Reviewed'}
                  </div>
                </div>
                <button
                  style={{ backgroundColor: theme.primary }}
                  className="px-4 py-2 text-xs font-bold text-white rounded shadow-sm hover:opacity-90 transition shrink-0"
                >
                  {cta}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Unit 3: 320x50 Mobile Banner */}
        {(selectedFormat === 'all' || selectedFormat === '320x50') && (
          <div className="space-y-2">
            <div className="flex items-center justify-between text-[11px] text-slate-500 font-mono">
              <span>Mobile Leaderboard (320 × 50)</span>
              <span>Smartphone Standard</span>
            </div>
            <div className="w-[320px] h-[50px] mx-auto bg-slate-900 text-white rounded px-2.5 py-1.5 flex items-center justify-between gap-2 border border-slate-700 shadow-xs">
              <div className="truncate max-w-[210px]">
                <div className="flex items-center gap-1.5">
                  <span className="text-[9px] bg-blue-600 text-white font-bold px-1 rounded">Ad</span>
                  <span className="text-[10px] font-bold truncate text-white">{shortH}</span>
                </div>
                <div className="text-[9px] text-slate-300 truncate">
                  {journalName} · {publisher}
                </div>
              </div>

              <button
                style={{ backgroundColor: theme.primary }}
                className="px-2.5 py-1 text-[10px] font-bold text-white rounded shrink-0"
              >
                {cta}
              </button>
            </div>
          </div>
        )}

        {/* Unit 4: 1.91:1 Landscape & Half Page 300x600 */}
        {(selectedFormat === 'all' || selectedFormat === 'landscape' || selectedFormat === '300x600') && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            {/* Landscape: 728x380 (1.91:1) */}
            {(selectedFormat === 'all' || selectedFormat === 'landscape') && (
              <div className="lg:col-span-8 space-y-2">
                <div className="flex items-center justify-between text-[11px] text-slate-500 font-mono">
                  <span>Landscape Display Asset (1.91:1 Ratio)</span>
                  <span>Responsive Display Core</span>
                </div>
                <div className="w-full h-[280px] bg-gradient-to-r from-[#001433] to-[#002d62] text-white rounded-xl p-6 flex flex-col justify-between border border-blue-900/60 shadow-lg relative overflow-hidden">
                  {/* Decorative background grid */}
                  <div className="absolute inset-0 opacity-10 bg-[radial-gradient(#38bdf8_1px,transparent_1px)] [background-size:16px_16px] pointer-events-none" />

                  {/* Top Bar */}
                  <div className="flex items-center justify-between relative z-10">
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-sky-300 font-bold uppercase tracking-wider">
                        {publisher}
                      </span>
                      <span className="text-slate-400">·</span>
                      <span className="text-xs text-white font-medium">{facts.primaryDiscipline}</span>
                    </div>
                    <span className="text-[10px] bg-white/20 text-slate-200 px-1.5 py-0.5 rounded">
                      AdChoices
                    </span>
                  </div>

                  {/* Center Hero */}
                  <div className="space-y-2.5 relative z-10 max-w-xl">
                    <h3 className="text-xl sm:text-2xl font-bold tracking-tight text-white leading-tight">
                      {longH}
                    </h3>
                    <p className="text-xs sm:text-sm text-slate-200 line-clamp-2 leading-relaxed">
                      {desc}
                    </p>
                    {content.bannerHeadlineZh && (
                      <div className="text-xs text-sky-200 font-medium pt-1">
                        {content.bannerHeadlineZh}
                      </div>
                    )}
                  </div>

                  {/* Bottom Row */}
                  <div className="flex items-center justify-between pt-3 border-t border-white/10 relative z-10">
                    <div className="flex items-center gap-3 text-xs">
                      {jifClaim && (
                        <span className="bg-amber-400/20 text-amber-300 border border-amber-400/30 px-2 py-0.5 rounded text-[11px] font-bold">
                          {jifClaim}
                        </span>
                      )}
                      {casZone && (
                        <span className="text-slate-300 text-[11px] hidden sm:inline">
                          {casZone}
                        </span>
                      )}
                    </div>
                    <button
                      style={{ backgroundColor: theme.primary }}
                      className="px-5 py-2 text-xs font-bold text-white rounded-lg shadow-md hover:opacity-90 transition flex items-center gap-1.5"
                    >
                      <span>{cta}</span>
                      <ExternalLink className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Half Page: 300x600 */}
            {(selectedFormat === 'all' || selectedFormat === '300x600') && (
              <div className="lg:col-span-4 space-y-2">
                <div className="flex items-center justify-between text-[11px] text-slate-500 font-mono">
                  <span>Half Page (300 × 600)</span>
                  <span>Tall and wide banners</span>
                </div>
                <div className="w-[300px] h-[480px] mx-auto bg-slate-950 text-white rounded-xl p-5 flex flex-col justify-between border border-slate-800 shadow-lg relative overflow-hidden">
                  <div className="space-y-3">
                    <div className="flex items-center justify-between text-[10px]">
                      <span className="text-sky-300 font-bold uppercase">{publisher}</span>
                      <span className="bg-slate-800 text-slate-300 px-1 rounded">Ad</span>
                    </div>

                    <div className="space-y-1">
                      <div className="text-xs text-amber-300 font-bold">{journalName}</div>
                      <h4 className="text-base font-bold leading-snug text-white">{shortH}</h4>
                    </div>

                    <div className="p-3 rounded-lg bg-slate-900 border border-slate-800 space-y-1.5">
                      <div className="text-[11px] font-semibold text-slate-300">Journal Highlights:</div>
                      <div className="text-[11px] text-slate-400 space-y-1">
                        {jifClaim && <div>• <strong className="text-white">{jifClaim}</strong></div>}
                        {casZone && <div>• Ranking: <strong className="text-white">{casZone}</strong></div>}
                        {firstDecisionDays != null && <div>• First Decision: <strong className="text-white">{firstDecisionDays} days</strong></div>}
                        {facts.openAccessType && <div>• Publishing: <strong className="text-white">{facts.openAccessType}</strong></div>}
                      </div>
                    </div>

                    <p className="text-xs text-slate-300 leading-relaxed line-clamp-4">
                      {desc}
                    </p>
                  </div>

                  <div className="space-y-2 pt-3 border-t border-slate-800">
                    <button
                      style={{ backgroundColor: theme.primary }}
                      className="w-full py-2.5 text-xs font-bold text-white rounded-lg shadow-sm hover:opacity-90 transition"
                    >
                      {cta}
                    </button>
                    <div className="text-[10px] text-slate-400 text-center font-mono truncate">
                      {deriveDisplayUrl(facts.url || '')}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Unit 5: Native In-Feed Card */}
        {(selectedFormat === 'all' || selectedFormat === 'native') && (
          <div className="space-y-2">
            <div className="flex items-center justify-between text-[11px] text-slate-500 font-mono">
              <span>Native In-Feed Sponsored Placement (ResearchGate / LinkedIn Academic Feed)</span>
              <span>Native Layout</span>
            </div>
            <div className="max-w-xl mx-auto p-4 rounded-xl bg-white border border-slate-200 shadow-2xs space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-full bg-[#002d62] text-white flex items-center justify-center font-bold text-xs">
                    {publisher.charAt(0)}
                  </div>
                  <div>
                    <div className="text-xs font-bold text-slate-900">{publisher}</div>
                    <div className="text-[10px] text-slate-400 flex items-center gap-1">
                      <span>Promoted</span>
                      <span>·</span>
                      <span>{facts.primaryDiscipline}</span>
                    </div>
                  </div>
                </div>
                <button
                  style={{ backgroundColor: theme.primary }}
                  className="px-3 py-1 text-xs font-semibold text-white rounded-full hover:opacity-90 transition"
                >
                  {cta}
                </button>
              </div>

              <p className="text-xs text-slate-700 leading-relaxed">
                {desc}
              </p>

              <div className="p-3 rounded-lg bg-slate-50 border border-slate-200 flex items-center justify-between">
                <div>
                  <div className="text-xs font-bold text-slate-900">{longH}</div>
                  <div className="text-[11px] text-slate-500">
                    {facts.journalName}{jifClaim ? ` · ${jifClaim}` : ''}
                  </div>
                </div>
                <ExternalLink className="w-4 h-4 text-slate-400 shrink-0" />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Visual Direction Design Brief Card */}
      <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-2 text-xs">
        <div className="flex items-center justify-between font-bold text-slate-800">
          <div className="flex items-center gap-1.5">
            <Sparkles className="w-4 h-4 text-indigo-600" />
            <span>Note for the person making the pictures</span>
          </div>
          <span className="text-[11px] font-mono text-slate-500">Targeting Academic Researchers</span>
        </div>
        <p className="text-slate-600 leading-relaxed italic">
          "{content.visualConceptPrompt}"
        </p>
        <div className="flex flex-wrap items-center gap-2 pt-1 text-[11px]">
          <span className="font-semibold text-slate-700">Recommended GDN Placements:</span>
          {content.targetPlacements?.map((p, pIdx) => (
            <span key={pIdx} className="bg-white px-2 py-0.5 rounded border border-slate-200 text-slate-700 font-mono">
              {p}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
};
