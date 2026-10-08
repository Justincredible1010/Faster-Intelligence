import React, { useState } from 'react';
import {
  Search,
  ExternalLink,
  Globe,
  Check,
  Copy,
  Smartphone,
  Monitor,
  Scissors,
  CheckCircle2,
  Pin,
  HelpCircle,
  Sparkles,
  Sliders,
  AlertTriangle,
  Wand2,
} from 'lucide-react';
import {
  GoogleSearchAds,
  GoogleSearchHeadline,
  GoogleSearchDescription,
  StageCode,
  ClarivateJournalMetrics,
} from '../types';
import {
  countCharacterWidth,
  formatCharCountLabel,
  formatDescriptionCountLabel,
  validateLanguagePurity,
  cleanStrayCharacters,
  smartClampWithWidth,
} from '../utils/textUtils';
import { SearchResultsMockup } from './SearchResultsMockup';

interface Props {
  content: GoogleSearchAds;
  displayUrl?: string;
  stage?: StageCode;
  facts: ClarivateJournalMetrics;
  onEditHeadline?: (index: number, text: string) => void;
  onEditDescription?: (index: number, text: string) => void;
}

export const GoogleAdPreview: React.FC<Props> = ({
  content,
  displayUrl = 'https://www.nature.com/',
  stage = 'CON',
  facts,
  onEditHeadline,
  onEditDescription,
}) => {
  const [activeTab, setActiveTab] = useState<'serp' | 'assets'>('serp');
  const [langView, setLangView] = useState<'all' | 'EN' | 'ZH'>('all');
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const headlines = content.headlines || [];
  const descriptions = content.descriptions || [];

  const copyToClipboard = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const handleCleanPurity = (index: number, isHeadline: boolean, text: string, targetLang: 'EN' | 'ZH') => {
    const cleaned = cleanStrayCharacters(text, targetLang);
    if (isHeadline && onEditHeadline) {
      onEditHeadline(index, cleaned);
    } else if (!isHeadline && onEditDescription) {
      onEditDescription(index, cleaned);
    }
  };

  const handleAutoTrimHeadline = (index: number, text: string) => {
    const trimmed = smartClampWithWidth(text, 30);
    if (onEditHeadline) onEditHeadline(index, trimmed);
  };

  const handleAutoTrimDescription = (index: number, text: string) => {
    const trimmed = smartClampWithWidth(text, 90);
    if (onEditDescription) onEditDescription(index, trimmed);
  };

  const filteredHeadlines = headlines.filter((h) => {
    if (langView === 'all') return true;
    return h.language === langView;
  });

  const filteredDescriptions = descriptions.filter((d) => {
    if (langView === 'all') return true;
    return d.language === langView;
  });

  return (
    <div className="space-y-6">
      {/* Top Header & Sub-tab Switcher */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-200">
        <div>
          <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
            <Search className="w-4 h-4 text-blue-600" />
            <span>Google Responsive Search Ads (RSA) Studio</span>
          </h3>
          <p className="text-xs text-slate-500">
            15 Headlines &amp; 4 Descriptions meeting Google Ads machine-learning diversity requirements
          </p>
        </div>

        <div className="flex items-center gap-2">
          {/* Sub-tab view toggle */}
          <div className="flex items-center bg-slate-100 p-1 rounded-xl border border-slate-200 text-xs">
            <button
              onClick={() => setActiveTab('serp')}
              className={`px-3 py-1 font-semibold rounded-lg transition ${
                activeTab === 'serp'
                  ? 'bg-white text-slate-900 shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Realistic SERP Mockup
            </button>
            <button
              onClick={() => setActiveTab('assets')}
              className={`px-3 py-1 font-semibold rounded-lg transition ${
                activeTab === 'assets'
                  ? 'bg-white text-slate-900 shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              All Assets &amp; Purity ({headlines.length}H / {descriptions.length}D)
            </button>
          </div>
        </div>
      </div>

      {/* View 1: Realistic SERP Mockup */}
      {activeTab === 'serp' && (
        <SearchResultsMockup
          ads={content}
          displayUrl={displayUrl}
          stage={stage}
          facts={facts}
          onEditHeadline={onEditHeadline}
          onEditDescription={onEditDescription}
        />
      )}

      {/* View 2: Asset Management, Language Purity & Double-Width Meters */}
      {activeTab === 'assets' && (
        <div className="space-y-8">
          {/* Filter & Action Bar */}
          <div className="flex flex-wrap items-center justify-between gap-2 p-3 rounded-xl bg-slate-50 border border-slate-200 text-xs">
            <div className="flex items-center gap-1.5">
              <span className="text-slate-500 font-medium">Filter Language:</span>
              {(['all', 'EN', 'ZH'] as const).map((l) => (
                <button
                  key={l}
                  onClick={() => setLangView(l)}
                  className={`px-2.5 py-1 rounded-lg font-semibold transition ${
                    langView === l
                      ? 'bg-[#002d62] text-white shadow-2xs'
                      : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-100'
                  }`}
                >
                  {l === 'all' ? 'All (Bilingual)' : l === 'EN' ? 'English Only' : 'Chinese (中文)'}
                </button>
              ))}
            </div>

            <button
              onClick={() =>
                copyToClipboard(
                  headlines.map((h, i) => `${i + 1}. [${h.language}] ${h.text}`).join('\n'),
                  'all-headlines'
                )
              }
              className="flex items-center gap-1 px-3 py-1.5 bg-white hover:bg-slate-50 text-slate-700 border border-slate-300 rounded-lg shadow-2xs font-semibold"
            >
              {copiedKey === 'all-headlines' ? (
                <Check className="w-3.5 h-3.5 text-emerald-600" />
              ) : (
                <Copy className="w-3.5 h-3.5" />
              )}
              <span>Copy All Headlines</span>
            </button>
          </div>

          {/* Headlines Grid (15 items) */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                Google RSA Headlines (15 Headlines · Max 30 Width Each)
              </span>
              <span className="text-[11px] text-slate-500">
                1 Chinese character = 2 width units (Google Ads standard)
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {filteredHeadlines.map((h, index) => {
                const width = countCharacterWidth(h.text);
                const isOverLimit = width > 30;
                const purityCheck = validateLanguagePurity(h.text, h.language);
                const hasStray = !purityCheck.valid;

                return (
                  <div
                    key={index}
                    className={`p-3.5 rounded-xl border transition flex flex-col justify-between gap-2 ${
                      isOverLimit
                        ? 'bg-rose-50/50 border-rose-300'
                        : hasStray
                        ? 'bg-amber-50/50 border-amber-300'
                        : 'bg-white border-slate-200 hover:border-slate-300 shadow-2xs'
                    }`}
                  >
                    {/* Header */}
                    <div className="flex items-center justify-between text-xs">
                      <div className="flex items-center gap-1.5">
                        <span className="font-extrabold text-[#002d62] text-[11px] bg-slate-100 px-1.5 py-0.5 rounded">
                          H{index + 1}
                        </span>
                        <span className="text-[10px] font-semibold text-slate-600 bg-slate-100 px-1.5 py-0.5 rounded truncate max-w-[100px]">
                          {h.category || 'General'}
                        </span>
                        <span className="text-[10px] font-bold text-slate-500">[{h.language}]</span>
                      </div>

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

                    {/* Input */}
                    <input
                      type="text"
                      value={h.text}
                      onChange={(e) => onEditHeadline && onEditHeadline(index, e.target.value)}
                      className={`w-full text-xs font-medium p-2 rounded-lg border focus:outline-none transition ${
                        isOverLimit
                          ? 'bg-white border-rose-400 text-rose-900 focus:ring-2 focus:ring-rose-500'
                          : 'bg-slate-50/70 border-slate-200 text-slate-900 focus:bg-white focus:ring-2 focus:ring-blue-600'
                      }`}
                    />

                    {/* Language Purity Warning */}
                    {hasStray && (
                      <div className="p-1.5 bg-amber-100/70 border border-amber-300 rounded text-[10px] text-amber-900 flex items-center justify-between">
                        <span>
                          Stray {h.language === 'EN' ? 'Chinese' : 'Latin'} character detected: "
                          {purityCheck.strayChars.slice(0, 3).join('')}"
                        </span>
                        <button
                          type="button"
                          onClick={() => handleCleanPurity(index, true, h.text, h.language)}
                          className="px-1.5 py-0.5 bg-amber-600 text-white rounded font-bold hover:bg-amber-700"
                        >
                          Clean
                        </button>
                      </div>
                    )}

                    {/* Footer: Meter & Smart Trim */}
                    <div className="flex items-center justify-between text-[11px] pt-1">
                      <span className="text-[10px] text-slate-400 truncate max-w-[130px]">
                        {h.sourceFact}
                      </span>

                      <div className="flex items-center gap-1.5">
                        {isOverLimit && (
                          <button
                            type="button"
                            onClick={() => handleAutoTrimHeadline(index, h.text)}
                            className="px-1.5 py-0.5 bg-rose-600 hover:bg-rose-700 text-white font-bold rounded flex items-center gap-0.5 text-[10px] transition"
                            title="Trim to 30 visual width"
                          >
                            <Scissors className="w-3 h-3" />
                            <span>Trim</span>
                          </button>
                        )}

                        <span
                          className={`font-mono font-bold text-[10px] px-1.5 py-0.5 rounded ${
                            isOverLimit
                              ? 'bg-rose-100 text-rose-700 border border-rose-300'
                              : width >= 26
                              ? 'bg-amber-100 text-amber-800 border border-amber-300'
                              : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                          }`}
                        >
                          {formatCharCountLabel(h.text, h.language)}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Descriptions Grid (4 items) */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                Google RSA Descriptions (4 Descriptions · Max 90 Width Each)
              </span>
              <span className="text-[11px] text-slate-500">
                1 Chinese character = 2 width units (Google Ads standard)
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {filteredDescriptions.map((d, index) => {
                const width = countCharacterWidth(d.text);
                const isOverLimit = width > 90;
                const purityCheck = validateLanguagePurity(d.text, d.language);
                const hasStray = !purityCheck.valid;

                return (
                  <div
                    key={index}
                    className={`p-3.5 rounded-xl border transition flex flex-col justify-between gap-2 ${
                      isOverLimit
                        ? 'bg-rose-50/50 border-rose-300'
                        : hasStray
                        ? 'bg-amber-50/50 border-amber-300'
                        : 'bg-white border-slate-200 hover:border-slate-300 shadow-2xs'
                    }`}
                  >
                    <div className="flex items-center justify-between text-xs">
                      <div className="flex items-center gap-1.5">
                        <span className="font-extrabold text-[#002d62] text-[11px] bg-slate-100 px-1.5 py-0.5 rounded">
                          Description {index + 1}
                        </span>
                        <span className="text-[10px] font-semibold text-slate-600 bg-slate-100 px-1.5 py-0.5 rounded">
                          {d.theme || 'Stage Focus'}
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

                    <textarea
                      rows={2}
                      value={d.text}
                      onChange={(e) => onEditDescription && onEditDescription(index, e.target.value)}
                      className={`w-full text-xs font-medium p-2 rounded-lg border focus:outline-none transition leading-relaxed ${
                        isOverLimit
                          ? 'bg-white border-rose-400 text-rose-900 focus:ring-2 focus:ring-rose-500'
                          : 'bg-slate-50/70 border-slate-200 text-slate-900 focus:bg-white focus:ring-2 focus:ring-blue-600'
                      }`}
                    />

                    {hasStray && (
                      <div className="p-1.5 bg-amber-100/70 border border-amber-300 rounded text-[10px] text-amber-900 flex items-center justify-between">
                        <span>
                          Stray {d.language === 'EN' ? 'Chinese' : 'Latin'} characters detected
                        </span>
                        <button
                          type="button"
                          onClick={() => handleCleanPurity(index, false, d.text, d.language)}
                          className="px-1.5 py-0.5 bg-amber-600 text-white rounded font-bold hover:bg-amber-700"
                        >
                          Clean
                        </button>
                      </div>
                    )}

                    <div className="flex items-center justify-between text-[11px] pt-1">
                      <span className="text-[10px] text-slate-400 truncate max-w-[200px]">
                        {d.sourceFact}
                      </span>

                      <div className="flex items-center gap-1.5">
                        {isOverLimit && (
                          <button
                            type="button"
                            onClick={() => handleAutoTrimDescription(index, d.text)}
                            className="px-1.5 py-0.5 bg-rose-600 hover:bg-rose-700 text-white font-bold rounded flex items-center gap-0.5 text-[10px] transition"
                            title="Trim to 90 visual width"
                          >
                            <Scissors className="w-3 h-3" />
                            <span>Trim</span>
                          </button>
                        )}

                        <span
                          className={`font-mono font-bold text-[10px] px-2 py-0.5 rounded ${
                            isOverLimit
                              ? 'bg-rose-100 text-rose-700 border border-rose-300'
                              : width >= 80
                              ? 'bg-amber-100 text-amber-800 border border-amber-300'
                              : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                          }`}
                        >
                          {formatDescriptionCountLabel(d.text, d.language)}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
