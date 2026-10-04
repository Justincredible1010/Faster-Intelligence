import React, { useState } from 'react';
import { Target, Search, ShieldAlert, Copy, Check, Download, AlertTriangle, Compass, Layers } from 'lucide-react';
import { AcademicKeywordsPack, StageCode, STAGE_CONFIGS, normalizeStage } from '../types';

interface Props {
  keywords: AcademicKeywordsPack;
  journalName?: string;
  stage?: StageCode;
}

export const TargetingViewer: React.FC<Props> = ({ keywords, journalName = 'Journal', stage = 'CON' }) => {
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const normalized = normalizeStage(stage);
  const stageCfg = STAGE_CONFIGS[normalized];

  const copyToClipboard = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const exportKeywordsCSV = () => {
    const rows = [
      ['Language', 'Keyword', 'Match Type', 'Intent'],
      ...keywords.englishSearchKeywords.map((k) => ['English', k.keyword, k.matchType, k.intent]),
      ...keywords.chineseAuthorKeywords.map((k) => ['Chinese', k.keywordZh, k.matchType, k.intentZh]),
    ];
    const csvContent = 'data:text/csv;charset=utf-8,\uFEFF' + rows.map((e) => e.join(',')).join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `${journalName.toLowerCase().replace(/\s+/g, '-')}-google-keywords.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800 flex items-center gap-1.5">
            <Target className="w-4 h-4 text-blue-600" />
            <span>Google Search Keywords & Academic Integrity Negative Shield</span>
          </h3>
          <p className="text-[11px] text-slate-500">
            Engineered for high-intent academic researchers & Greater China scholars
          </p>
        </div>
        <button
          onClick={exportKeywordsCSV}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-700 bg-white hover:bg-slate-50 border border-slate-300 rounded-lg shadow-2xs transition"
        >
          <Download className="w-3.5 h-3.5" />
          <span>Export Keywords CSV</span>
        </button>
      </div>

      {/* Stage Keyword Intent Alignment */}
      <div className="p-3.5 rounded-xl bg-blue-50/60 border border-blue-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
        <div className="flex items-center gap-2.5">
          <span className="w-6 h-6 rounded-lg bg-[#002d62] text-white flex items-center justify-center font-mono font-bold text-xs shrink-0">
            {stageCfg.code}
          </span>
          <div>
            <div className="font-semibold text-slate-800 flex items-center gap-1.5">
              <span>{stageCfg.name} Keyword Intent</span>
              <span className="text-slate-400">·</span>
              <span className="text-slate-500 font-normal italic">"{stageCfg.authorMindset}"</span>
            </div>
            <div className="text-[11px] text-slate-600 mt-0.5">
              {stage === 'AWA' && 'Targeting broad disciplinary keywords, scope exploration, and research community queries.'}
              {stage === 'CON' && 'Targeting evaluative keywords: journal ranking, impact factor, review duration, and scope fit.'}
              {stage === 'DEC' && 'Targeting actionable submission keywords: author guidelines, preparation checklists, and submission portal.'}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0 text-[11px]">
          <span className="text-slate-500">Destination:</span>
          <span className="font-semibold text-blue-900 bg-white px-2 py-0.5 rounded border border-blue-200">
            {stageCfg.recommendedDestination.label}
          </span>
        </div>
      </div>

      {/* 1. English Search Keywords */}
      <div className="p-4 rounded-xl bg-white border border-slate-200 shadow-2xs space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-xs font-bold text-blue-900 uppercase tracking-wider flex items-center gap-1.5">
            <Search className="w-3.5 h-3.5 text-blue-600" />
            <span>High-Intent English Academic Search Queries</span>
          </span>
          <button
            onClick={() =>
              copyToClipboard(keywords.englishSearchKeywords.map((k) => k.keyword).join('\n'), 'en-kw')
            }
            className="flex items-center gap-1 text-[11px] text-slate-500 hover:text-slate-800"
          >
            {copiedKey === 'en-kw' ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />}
            <span>Copy All</span>
          </button>
        </div>

        <div className="grid sm:grid-cols-3 gap-2 text-xs">
          {keywords.englishSearchKeywords.map((k, idx) => (
            <div
              key={idx}
              className="p-2.5 rounded-lg bg-slate-50 border border-slate-200 flex flex-col justify-between gap-1"
            >
              <div className="font-mono font-medium text-slate-900 truncate">{k.keyword}</div>
              <div className="flex items-center justify-between text-[10px] text-slate-500">
                <span className="font-semibold text-blue-700">{k.matchType}</span>
                <span className="truncate">{k.intent}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* 2. Chinese Author Search Queries for Greater China Researchers */}
      <div className="p-4 rounded-xl bg-white border border-slate-200 shadow-2xs space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-xs font-bold text-indigo-900 uppercase tracking-wider flex items-center gap-1.5">
            <Search className="w-3.5 h-3.5 text-indigo-600" />
            <span>Chinese Author High-Intent Queries (中文学术搜索意向)</span>
          </span>
          <button
            onClick={() =>
              copyToClipboard(keywords.chineseAuthorKeywords.map((k) => k.keywordZh).join('\n'), 'zh-kw')
            }
            className="flex items-center gap-1 text-[11px] text-slate-500 hover:text-slate-800"
          >
            {copiedKey === 'zh-kw' ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />}
            <span>Copy All</span>
          </button>
        </div>

        <div className="grid sm:grid-cols-3 gap-2 text-xs">
          {keywords.chineseAuthorKeywords.map((k, idx) => (
            <div
              key={idx}
              className="p-2.5 rounded-lg bg-indigo-50/40 border border-indigo-100 flex flex-col justify-between gap-1"
            >
              <div className="font-medium text-indigo-950 truncate">{k.keywordZh}</div>
              <div className="flex items-center justify-between text-[10px] text-indigo-700">
                <span className="font-semibold">{k.matchType}</span>
                <span className="truncate">{k.intentZh}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* 3. Academic Integrity Negative Keywords Shield */}
      <div className="p-4 rounded-xl bg-rose-50/50 border border-rose-200 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5 text-xs font-bold text-rose-900 uppercase tracking-wider">
            <ShieldAlert className="w-4 h-4 text-rose-600" />
            <span>Academic Integrity Negative Keywords Shield (过滤学术黑产/中介)</span>
          </div>
          <button
            onClick={() => copyToClipboard(keywords.negativeKeywords.join('\n'), 'neg-kw')}
            className="flex items-center gap-1 text-[11px] text-rose-700 hover:text-rose-900 font-medium"
          >
            {copiedKey === 'neg-kw' ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />}
            <span>Copy Negatives</span>
          </button>
        </div>

        <p className="text-xs text-rose-800 leading-relaxed">
          Critical defense for Springer Nature journals: Exclude paper mills and fraud traffic in Greater China to safeguard brand prestige and eliminate wasted ad spend.
        </p>

        <div className="flex flex-wrap gap-1.5 pt-1">
          {keywords.negativeKeywords.map((neg, idx) => (
            <span
              key={idx}
              className="text-xs font-mono px-2.5 py-1 rounded-md bg-white text-rose-700 border border-rose-200 font-medium shadow-2xs"
            >
              -{neg}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
};
