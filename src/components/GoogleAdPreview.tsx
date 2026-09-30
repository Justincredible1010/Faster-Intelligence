import React, { useState } from 'react';
import {
  Search,
  ExternalLink,
  Globe,
  Check,
  Copy,
  Smartphone,
  Monitor,
  MoreVertical,
  AlertTriangle,
  Scissors,
  CheckCircle2,
  Shuffle,
  Pin,
  HelpCircle,
  Sparkles,
} from 'lucide-react';
import { GoogleSearchAds, GoogleSearchHeadline, GoogleSearchDescription } from '../types';

interface Props {
  content: GoogleSearchAds;
  displayUrl?: string;
  onEditHeadline?: (index: number, text: string) => void;
  onEditDescription?: (index: number, text: string) => void;
}

export const GoogleAdPreview: React.FC<Props> = ({
  content,
  displayUrl = 'https://www.nature.com/nature',
  onEditHeadline,
  onEditDescription,
}) => {
  const [deviceView, setDeviceView] = useState<'desktop' | 'mobile'>('desktop');
  const [langView, setLangView] = useState<'all' | 'EN' | 'ZH'>('all');
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  // RSA dynamic rotation simulator state
  const [selectedH1Index, setSelectedH1Index] = useState<number>(0);
  const [selectedH2Index, setSelectedH2Index] = useState<number>(3);
  const [selectedH3Index, setSelectedH3Index] = useState<number>(6);
  const [selectedD1Index, setSelectedD1Index] = useState<number>(0);
  const [selectedD2Index, setSelectedD2Index] = useState<number>(1);

  // Pinning simulation
  const [pinnedH1, setPinnedH1] = useState<number | null>(0);
  const [pinnedH2, setPinnedH2] = useState<number | null>(null);
  const [pinnedH3, setPinnedH3] = useState<number | null>(null);

  // Parse domain for SERP display
  let cleanDomain = 'nature.com';
  let pathBreadcrumb = 'submissions › call-for-papers';
  try {
    const parsed = new URL(displayUrl.startsWith('http') ? displayUrl : `https://${displayUrl}`);
    cleanDomain = parsed.hostname.replace(/^www\./, '');
    const segments = parsed.pathname.split('/').filter(Boolean);
    if (segments.length > 0) {
      pathBreadcrumb = segments.join(' › ');
    }
  } catch {
    // fallback
  }

  const headlines = content.headlines || [];
  const descriptions = content.descriptions || [];

  // Active headline texts for SERP title
  const h1Text = (headlines[pinnedH1 ?? selectedH1Index]?.text || headlines[0]?.text || 'Official Academic Journal').trim();
  const h2Text = (headlines[pinnedH2 ?? selectedH2Index]?.text || headlines[1]?.text || 'Clarivate JCR Q1').trim();
  const h3Text = (headlines[pinnedH3 ?? selectedH3Index]?.text || headlines[2]?.text || 'Fast Peer Review').trim();

  const previewTitle =
    deviceView === 'desktop'
      ? `${h1Text} | ${h2Text} | ${h3Text}`
      : `${h1Text} | ${h2Text}`;

  const desc1Text = (descriptions[selectedD1Index]?.text || descriptions[0]?.text || '').trim();
  const desc2Text = (descriptions[selectedD2Index]?.text || descriptions[1]?.text || '').trim();
  const previewDescription = `${desc1Text} ${desc2Text}`.trim();

  const copyToClipboard = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const handleAutoTrimHeadline = (index: number, text: string) => {
    if (onEditHeadline) {
      onEditHeadline(index, text.slice(0, 30).trim());
    }
  };

  const handleAutoTrimDesc = (index: number, text: string) => {
    if (onEditDescription) {
      onEditDescription(index, text.slice(0, 90).trim());
    }
  };

  const handleShuffleCombination = () => {
    if (headlines.length >= 3) {
      const availableIndices = headlines.map((_, i) => i);
      const shuffled = availableIndices.sort(() => 0.5 - Math.random());
      if (pinnedH1 === null) setSelectedH1Index(shuffled[0] || 0);
      if (pinnedH2 === null) setSelectedH2Index(shuffled[1] || 1);
      if (pinnedH3 === null) setSelectedH3Index(shuffled[2] || 2);
    }
    if (descriptions.length >= 2) {
      const dIndices = descriptions.map((_, i) => i).sort(() => 0.5 - Math.random());
      setSelectedD1Index(dIndices[0] || 0);
      setSelectedD2Index(dIndices[1] || 1);
    }
  };

  const filteredHeadlines =
    langView === 'all'
      ? headlines
      : headlines.filter((h) => h.language === langView);

  return (
    <div className="space-y-6">
      {/* 1. Live Google.com SERP Ad Presentation (Desktop & Mobile) */}
      <div className="space-y-2.5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div className="text-xs font-bold uppercase tracking-wider text-slate-800 flex items-center gap-1.5">
            <Search className="w-4 h-4 text-blue-600" />
            <span>Google Responsive Search Ad (Live SERP Presentation)</span>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleShuffleCombination}
              className="flex items-center gap-1.5 px-3 py-1 bg-blue-50 hover:bg-blue-100 text-blue-800 rounded-lg text-xs font-semibold border border-blue-200 transition"
              title="Simulate Google's dynamic machine-learning rotation of headlines and descriptions"
            >
              <Shuffle className="w-3.5 h-3.5 text-blue-600" />
              <span>Simulate Machine-Learning Rotation</span>
            </button>

            <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl text-xs">
              <button
                onClick={() => setDeviceView('desktop')}
                className={`flex items-center gap-1.5 px-3 py-1 rounded-lg font-medium transition ${
                  deviceView === 'desktop'
                    ? 'bg-white text-slate-900 shadow-2xs font-semibold'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Monitor className="w-3.5 h-3.5" />
                <span>Desktop SERP</span>
              </button>
              <button
                onClick={() => setDeviceView('mobile')}
                className={`flex items-center gap-1.5 px-3 py-1 rounded-lg font-medium transition ${
                  deviceView === 'mobile'
                    ? 'bg-white text-slate-900 shadow-2xs font-semibold'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Smartphone className="w-3.5 h-3.5" />
                <span>Mobile SERP</span>
              </button>
            </div>
          </div>
        </div>

        {/* Real Google Search Ad Container */}
        <div
          className={`mx-auto bg-white border border-slate-200 rounded-2xl shadow-sm p-5 font-sans transition-all ${
            deviceView === 'mobile' ? 'max-w-md' : 'max-w-3xl'
          }`}
        >
          {/* Top row: Favicon + Domain + Breadcrumb + 3 dots */}
          <div className="flex items-center justify-between text-xs mb-1.5">
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded-full bg-[#002d62] text-white flex items-center justify-center font-bold text-[10px] shrink-0">
                N
              </div>
              <div className="flex flex-col">
                <span className="text-[13px] font-medium text-slate-900 leading-tight">
                  {cleanDomain.includes('nature') ? 'Nature.com' : 'SpringerLink'}
                </span>
                <span className="text-[11px] text-slate-500 leading-tight truncate max-w-xs">
                  https://www.{cleanDomain} › {pathBreadcrumb}
                </span>
              </div>
            </div>
            <div className="flex items-center gap-1.5 text-slate-400">
              <span className="text-[11px] font-bold text-slate-900 border border-slate-300 rounded px-1.5 py-0.2 bg-slate-50">
                Sponsored
              </span>
              <MoreVertical className="w-3.5 h-3.5" />
            </div>
          </div>

          {/* Blue Title (Clickable) */}
          <h3 className="text-base sm:text-lg font-normal text-[#1a0dab] hover:underline cursor-pointer leading-snug mb-1">
            {previewTitle}
          </h3>

          {/* Description */}
          <p className="text-xs sm:text-[13px] text-[#4d5156] leading-relaxed mb-2.5">
            {previewDescription}
          </p>

          {/* Callout Extensions */}
          {content.callouts && content.callouts.length > 0 && (
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-[#4d5156] border-t border-slate-100 pt-2 mb-3">
              {content.callouts.map((callout, idx) => (
                <span key={idx} className="flex items-center gap-1 font-medium">
                  <span>· {callout}</span>
                </span>
              ))}
            </div>
          )}

          {/* Sitelinks (Real Google Ad Sitelinks Extensions) */}
          {content.sitelinks && content.sitelinks.length > 0 && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1 border-t border-slate-100">
              {content.sitelinks.map((link, idx) => (
                <div key={idx} className="group cursor-pointer">
                  <div className="text-xs font-medium text-[#1a0dab] group-hover:underline flex items-center gap-1">
                    <span>{link.title}</span>
                    <ExternalLink className="w-3 h-3 opacity-0 group-hover:opacity-100 transition" />
                  </div>
                  <p className="text-[11px] text-[#5f6368] leading-tight line-clamp-1">{link.desc}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* 2. Official Google Best Practice Specifications Banner */}
      <div className="p-4 rounded-xl bg-blue-50/70 border border-blue-200 text-xs space-y-2">
        <div className="flex items-center justify-between">
          <span className="font-bold text-blue-900 flex items-center gap-1.5 uppercase tracking-wider">
            <Sparkles className="w-4 h-4 text-blue-600" />
            <span>Google Responsive Search Ads (RSA) Best Practices</span>
          </span>
          <span className="text-[11px] font-semibold text-emerald-800 bg-emerald-100 px-2.5 py-0.5 rounded-full border border-emerald-300">
            Ad Strength: Excellent (15 Headlines / 4 Descriptions)
          </span>
        </div>
        <p className="text-slate-600 leading-relaxed text-[11px]">
          According to official Google Ads guidelines, providing the full maximum of <strong>15 distinct headlines</strong> (strict 30-char limit) and <strong>4 descriptions</strong> (strict 90-char limit) maximizes machine-learning auction competitiveness and ad rank.
        </p>
      </div>

      {/* 3. Headlines Specification Table (15 Headlines, Strictly <= 30 Chars) */}
      <div className="space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
              Google RSA Headlines (15 Generated, Strict Max 30 Characters Each)
            </h4>
            <span className="text-[11px] text-slate-500">
              Categorized by role: Brand &amp; Title (H1-H3), Authority &amp; IF (H4-H6), Speed (H7-H9), Scope (H10-H12), CTA (H13-H15)
            </span>
          </div>

          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1 bg-slate-100 p-0.5 rounded-lg text-xs">
              <button
                onClick={() => setLangView('all')}
                className={`px-2.5 py-1 rounded-md transition ${
                  langView === 'all' ? 'bg-white font-bold text-slate-900 shadow-2xs' : 'text-slate-600'
                }`}
              >
                All ({headlines.length})
              </button>
              <button
                onClick={() => setLangView('EN')}
                className={`px-2 py-1 rounded-md transition ${
                  langView === 'EN' ? 'bg-white font-bold text-slate-900 shadow-2xs' : 'text-slate-600'
                }`}
              >
                EN
              </button>
              <button
                onClick={() => setLangView('ZH')}
                className={`px-2 py-1 rounded-md transition ${
                  langView === 'ZH' ? 'bg-white font-bold text-slate-900 shadow-2xs' : 'text-slate-600'
                }`}
              >
                ZH
              </button>
            </div>

            <button
              onClick={() =>
                copyToClipboard(
                  headlines.map((h, i) => `H${i + 1} (${h.category || 'General'}): ${h.text}`).join('\n'),
                  'all-headlines'
                )
              }
              className="px-2.5 py-1 text-xs text-slate-700 bg-slate-100 hover:bg-slate-200 border border-slate-300 rounded-lg flex items-center gap-1 shadow-2xs transition"
            >
              {copiedKey === 'all-headlines' ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-600" />
                  <span>Copied All</span>
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5" />
                  <span>Copy 15 Headlines</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* Headlines Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {filteredHeadlines.map((h, index) => {
            const isOverLimit = h.text.length > 30;
            const isNearLimit = h.text.length >= 28 && !isOverLimit;

            return (
              <div
                key={index}
                className={`p-3 rounded-xl border transition-all ${
                  isOverLimit
                    ? 'bg-rose-50 border-rose-300 shadow-xs'
                    : 'bg-white border-slate-200 shadow-2xs hover:border-slate-300'
                }`}
              >
                {/* Meta Row: Number + Category + Pinning + Copy */}
                <div className="flex items-center justify-between text-xs mb-1.5">
                  <div className="flex items-center gap-1.5">
                    <span className="font-extrabold text-[#002d62] text-[11px] bg-slate-100 px-1.5 py-0.5 rounded">
                      H{index + 1}
                    </span>
                    <span className="text-[10px] font-semibold text-slate-600 bg-slate-100 px-1.5 py-0.5 rounded">
                      {h.category || (index < 3 ? 'Brand' : index < 6 ? 'Authority' : index < 9 ? 'Speed' : index < 12 ? 'Scope' : 'CTA')}
                    </span>
                    <span className="text-[10px] font-bold text-slate-500">
                      [{h.language}]
                    </span>
                  </div>

                  <div className="flex items-center gap-1">
                    {/* Pin button */}
                    <button
                      type="button"
                      onClick={() => {
                        if (pinnedH1 === index) setPinnedH1(null);
                        else setPinnedH1(index);
                      }}
                      className={`p-1 rounded text-[10px] transition ${
                        pinnedH1 === index
                          ? 'bg-blue-600 text-white font-bold'
                          : 'text-slate-400 hover:text-slate-700'
                      }`}
                      title={pinnedH1 === index ? 'Pinned to Position 1' : 'Pin to Position 1'}
                    >
                      <Pin className="w-3 h-3" />
                    </button>

                    <button
                      onClick={() => copyToClipboard(h.text, `h-${index}`)}
                      className="p-1 text-slate-400 hover:text-slate-700 rounded transition"
                      title="Copy headline"
                    >
                      {copiedKey === `h-${index}` ? (
                        <Check className="w-3.5 h-3.5 text-emerald-600" />
                      ) : (
                        <Copy className="w-3.5 h-3.5" />
                      )}
                    </button>
                  </div>
                </div>

                {/* Editable Text Input */}
                <input
                  type="text"
                  value={h.text}
                  onChange={(e) => onEditHeadline && onEditHeadline(index, e.target.value)}
                  className={`w-full text-xs font-medium p-2 rounded-lg border focus:outline-none transition ${
                    isOverLimit
                      ? 'bg-white border-rose-400 text-rose-900 focus:ring-2 focus:ring-rose-500'
                      : 'bg-slate-50/70 border-slate-200 text-slate-900 focus:bg-white focus:ring-2 focus:ring-blue-500'
                  }`}
                />

                {/* Footer: Character Counter & Auto-trim */}
                <div className="flex items-center justify-between mt-2 text-[11px]">
                  <span className="text-[10px] text-slate-400 truncate max-w-[140px]" title={h.sourceFact}>
                    {h.sourceFact}
                  </span>

                  <div className="flex items-center gap-1.5">
                    {isOverLimit && (
                      <button
                        type="button"
                        onClick={() => handleAutoTrimHeadline(index, h.text)}
                        className="px-1.5 py-0.5 bg-rose-600 hover:bg-rose-700 text-white font-bold rounded flex items-center gap-0.5 text-[10px] transition"
                        title="Auto-trim to strict 30 character limit"
                      >
                        <Scissors className="w-3 h-3" />
                        <span>Trim</span>
                      </button>
                    )}

                    <span
                      className={`font-mono font-bold text-[10px] px-1.5 py-0.2 rounded ${
                        isOverLimit
                          ? 'bg-rose-100 text-rose-700 border border-rose-300'
                          : isNearLimit
                          ? 'bg-amber-100 text-amber-800 border border-amber-300'
                          : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                      }`}
                    >
                      {h.text.length}/30
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* 4. Descriptions Specification Table (4 Descriptions, Strictly <= 90 Chars) */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
              Google RSA Descriptions (4 Generated, Strict Max 90 Characters Each)
            </h4>
            <span className="text-[11px] text-slate-500">
              High-converting angles: Prestige, Fast Turnaround, Special Issue Scope, &amp; China NSFC Author Support
            </span>
          </div>

          <button
            onClick={() =>
              copyToClipboard(
                descriptions.map((d, i) => `D${i + 1}: ${d.text}`).join('\n\n'),
                'all-descs'
              )
            }
            className="px-2.5 py-1 text-xs text-slate-700 bg-slate-100 hover:bg-slate-200 border border-slate-300 rounded-lg flex items-center gap-1 shadow-2xs transition"
          >
            {copiedKey === 'all-descs' ? (
              <>
                <Check className="w-3.5 h-3.5 text-emerald-600" />
                <span>Copied All</span>
              </>
            ) : (
              <>
                <Copy className="w-3.5 h-3.5" />
                <span>Copy 4 Descriptions</span>
              </>
            )}
          </button>
        </div>

        {/* Descriptions Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {descriptions.map((d, index) => {
            const isOverLimit = d.text.length > 90;
            const isNearLimit = d.text.length >= 85 && !isOverLimit;

            return (
              <div
                key={index}
                className={`p-3.5 rounded-xl border transition-all ${
                  isOverLimit
                    ? 'bg-rose-50 border-rose-300 shadow-xs'
                    : 'bg-white border-slate-200 shadow-2xs hover:border-slate-300'
                }`}
              >
                {/* Meta Row */}
                <div className="flex items-center justify-between text-xs mb-1.5">
                  <div className="flex items-center gap-1.5">
                    <span className="font-extrabold text-[#002d62] text-[11px] bg-slate-100 px-1.5 py-0.5 rounded">
                      Description {index + 1}
                    </span>
                    <span className="text-[10px] font-semibold text-slate-600 bg-slate-100 px-1.5 py-0.5 rounded">
                      {d.theme || (index === 0 ? 'Prestige & Metrics' : index === 1 ? 'Turnaround Speed' : index === 2 ? 'China NSFC Support' : 'Urgent Call to Action')}
                    </span>
                    <span className="text-[10px] font-bold text-slate-500">[{d.language}]</span>
                  </div>

                  <button
                    onClick={() => copyToClipboard(d.text, `d-${index}`)}
                    className="p-1 text-slate-400 hover:text-slate-700 rounded transition"
                  >
                    {copiedKey === `d-${index}` ? (
                      <Check className="w-3.5 h-3.5 text-emerald-600" />
                    ) : (
                      <Copy className="w-3.5 h-3.5" />
                    )}
                  </button>
                </div>

                {/* Editable Text Area */}
                <textarea
                  value={d.text}
                  rows={2}
                  onChange={(e) => onEditDescription && onEditDescription(index, e.target.value)}
                  className={`w-full text-xs font-medium p-2 rounded-lg border focus:outline-none transition resize-none leading-relaxed ${
                    isOverLimit
                      ? 'bg-white border-rose-400 text-rose-900 focus:ring-2 focus:ring-rose-500'
                      : 'bg-slate-50/70 border-slate-200 text-slate-900 focus:bg-white focus:ring-2 focus:ring-blue-500'
                  }`}
                />

                {/* Footer */}
                <div className="flex items-center justify-between mt-2 text-[11px]">
                  <span className="text-[10px] text-slate-400 truncate max-w-[200px]" title={d.sourceFact}>
                    {d.sourceFact}
                  </span>

                  <div className="flex items-center gap-1.5">
                    {isOverLimit && (
                      <button
                        type="button"
                        onClick={() => handleAutoTrimDesc(index, d.text)}
                        className="px-2 py-0.5 bg-rose-600 hover:bg-rose-700 text-white font-bold rounded flex items-center gap-0.5 text-[10px] transition"
                        title="Auto-trim to strict 90 character limit"
                      >
                        <Scissors className="w-3 h-3" />
                        <span>Trim to 90</span>
                      </button>
                    )}

                    <span
                      className={`font-mono font-bold text-[10px] px-1.5 py-0.2 rounded ${
                        isOverLimit
                          ? 'bg-rose-100 text-rose-700 border border-rose-300'
                          : isNearLimit
                          ? 'bg-amber-100 text-amber-800 border border-amber-300'
                          : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                      }`}
                    >
                      {d.text.length}/90
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
