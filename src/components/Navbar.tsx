import React, { useState, useRef, useEffect } from 'react';
import {
  BookOpen,
  Award,
  Download,
  Sparkles,
  Layers,
  Sliders,
  ShieldCheck,
  Compass,
  FileSpreadsheet,
  FileText,
  ChevronDown,
  Database,
} from 'lucide-react';

interface Props {
  activeView: 'single' | 'bulk';
  onChangeView: (view: 'single' | 'bulk') => void;
  onOpenGuide: () => void;
  onOpenPlaybook: () => void;
  onOpenDatabase: () => void;
  onOpenCompareStages?: () => void;
  onOpenCompliance?: () => void;
  onExportMarkdown: () => void;
  onExportCsv: () => void;
  hasCampaign: boolean;
  hasCustomPlaybook?: boolean;
  hasPolicyWarnings?: boolean;
}

export const Navbar: React.FC<Props> = ({
  activeView,
  onChangeView,
  onOpenGuide,
  onOpenPlaybook,
  onOpenDatabase,
  onOpenCompareStages,
  onOpenCompliance,
  onExportMarkdown,
  onExportCsv,
  hasCampaign,
  hasCustomPlaybook,
  hasPolicyWarnings,
}) => {
  const [showExportMenu, setShowExportMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setShowExportMenu(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <header className="sticky top-0 z-40 bg-white border-b border-slate-200 shadow-2xs">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-2.5 flex items-center justify-between gap-4">
        {/* Brand identity */}
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-[#002d62] text-white flex items-center justify-center font-bold shadow-sm">
            <BookOpen className="w-5 h-5 text-sky-300" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-extrabold text-slate-900 text-base tracking-tight">
                Marketing Content Generation Engine
              </span>
              <span className="text-[10px] font-mono font-semibold px-2 py-0.5 rounded-md bg-slate-100 text-slate-600 border border-slate-200">
                2025 JCR Release
              </span>
            </div>
            <p className="text-xs text-slate-500 hidden sm:block">
              Springer Nature Author Acquisition · Academic Growth Suite
            </p>
          </div>
        </div>

        {/* View Mode Switcher (Single Journal vs Bulk Batch) */}
        <div className="flex items-center bg-slate-100 p-0.5 rounded-xl border border-slate-200">
          <button
            onClick={() => onChangeView('single')}
            className={`px-3 py-1.5 text-xs font-bold rounded-lg transition ${
              activeView === 'single'
                ? 'bg-white text-[#002d62] shadow-2xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Single Journal
          </button>
          <button
            onClick={() => onChangeView('bulk')}
            className={`px-3 py-1.5 text-xs font-bold rounded-lg transition flex items-center gap-1.5 ${
              activeView === 'bulk'
                ? 'bg-[#002d62] text-white shadow-2xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <FileSpreadsheet className="w-3.5 h-3.5" />
            <span>Bulk Studio</span>
          </button>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2">
          {/* Database Provenance View */}
          <button
            onClick={onOpenDatabase}
            className="hidden lg:flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:text-slate-900 bg-white hover:bg-slate-50 rounded-lg border border-slate-200 transition"
            title="Browse verified metrics database and release years"
          >
            <Database className="w-3.5 h-3.5 text-emerald-600" />
            <span>Metrics DB</span>
          </button>

          {onOpenCompareStages && (
            <button
              onClick={onOpenCompareStages}
              className="hidden md:flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 rounded-lg border border-slate-200 transition"
              title="Compare AWA, CON, and DEC side-by-side"
            >
              <Compass className="w-3.5 h-3.5 text-blue-600" />
              <span>Compare</span>
            </button>
          )}

          {onOpenCompliance && (
            <button
              onClick={onOpenCompliance}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border transition ${
                hasPolicyWarnings
                  ? 'bg-amber-50 text-amber-800 border-amber-300'
                  : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
              }`}
              title="Audit Google Ads policies (trademarks, superlatives, claims)"
            >
              <ShieldCheck
                className={`w-3.5 h-3.5 ${
                  hasPolicyWarnings ? 'text-amber-600' : 'text-emerald-600'
                }`}
              />
              <span className="hidden sm:inline">Policy Audit</span>
            </button>
          )}

          <button
            onClick={onOpenPlaybook}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-blue-900 bg-blue-50 hover:bg-blue-100 rounded-lg border border-blue-200 transition"
            title="Upload and configure custom marketing rules & LLM skills"
          >
            <Sparkles className="w-3.5 h-3.5 text-blue-600" />
            <span>Playbook</span>
            {hasCustomPlaybook && <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />}
          </button>

          <button
            onClick={onOpenGuide}
            className="hidden sm:block px-3 py-1.5 text-xs font-medium text-slate-700 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 rounded-lg border border-slate-200 transition"
          >
            Framework
          </button>

          {/* Export Dropdown */}
          {hasCampaign && (
            <div className="relative" ref={menuRef}>
              <button
                onClick={() => setShowExportMenu(!showExportMenu)}
                className="flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold text-white bg-[#002d62] hover:bg-[#00224a] rounded-lg shadow-sm transition"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Export</span>
                <ChevronDown className="w-3 h-3 text-sky-200" />
              </button>

              {showExportMenu && (
                <div className="absolute right-0 mt-1 w-56 bg-white border border-slate-200 rounded-xl shadow-lg p-1.5 z-50 text-xs animate-in fade-in zoom-in-95 duration-100">
                  <button
                    onClick={() => {
                      onExportCsv();
                      setShowExportMenu(false);
                    }}
                    className="w-full flex items-center gap-2 p-2 hover:bg-blue-50 rounded-lg text-slate-700 hover:text-blue-900 font-semibold text-left transition"
                  >
                    <FileSpreadsheet className="w-4 h-4 text-emerald-600 shrink-0" />
                    <div>
                      <div>Google Ads Editor CSV</div>
                      <div className="text-[10px] text-slate-400 font-normal">
                        Import-ready columns + README
                      </div>
                    </div>
                  </button>

                  <button
                    onClick={() => {
                      onExportMarkdown();
                      setShowExportMenu(false);
                    }}
                    className="w-full flex items-center gap-2 p-2 hover:bg-blue-50 rounded-lg text-slate-700 hover:text-blue-900 font-semibold text-left transition"
                  >
                    <FileText className="w-4 h-4 text-blue-600 shrink-0" />
                    <div>
                      <div>Markdown Campaign Brief</div>
                      <div className="text-[10px] text-slate-400 font-normal">
                        Complete multi-channel asset brief
                      </div>
                    </div>
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </header>
  );
};
