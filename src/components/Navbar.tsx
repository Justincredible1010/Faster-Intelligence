import React, { useState, useRef, useEffect } from 'react';
import {
  BookOpen,
  Download,
  Sparkles,
  ShieldCheck,
  Compass,
  FileSpreadsheet,
  FileText,
  ChevronDown,
  LogOut,
  BookOpenText,
  Sliders,
} from 'lucide-react';
import { useAuth } from '../auth/AuthGate';

interface Props {
  onOpenGuide: () => void;
  onOpenPlaybook: () => void;
  onOpenCompareStages?: () => void;
  onOpenCompliance?: () => void;
  onExportMarkdown: () => void;
  onExportCsv: () => void;
  hasCampaign: boolean;
  hasCustomPlaybook?: boolean;
  hasPolicyWarnings?: boolean;
  onOpenStageUrlRules?: () => void;
}

export const Navbar: React.FC<Props> = ({
  onOpenGuide,
  onOpenPlaybook,
  onOpenCompareStages,
  onOpenCompliance,
  onExportMarkdown,
  onExportCsv,
  hasCampaign,
  hasCustomPlaybook,
  hasPolicyWarnings,
  onOpenStageUrlRules,
}) => {
  const [showExportMenu, setShowExportMenu] = useState(false);
  const [showGuidesMenu, setShowGuidesMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const guidesRef = useRef<HTMLDivElement | null>(null);
  const { user, admin, logout } = useAuth();

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setShowExportMenu(false);
      }
      if (guidesRef.current && !guidesRef.current.contains(event.target as Node)) {
        setShowGuidesMenu(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <header className="sticky top-0 z-40 bg-white border-b border-slate-200 shadow-2xs">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between gap-4">
        {/* Brand identity */}
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-[#002d62] text-white flex items-center justify-center font-bold shadow-sm">
            <BookOpen className="w-5 h-5 text-sky-300" />
          </div>
          <div>
            <div className="font-extrabold text-slate-900 text-sm sm:text-base tracking-tight leading-tight">
              Marketing Content Generation Engine
            </div>
            <p className="text-xs text-slate-500 truncate max-w-[220px] sm:max-w-md">
              <span className="hidden sm:inline">Google Search and Display campaigns · </span>
              <span title={user.email}>{user.email}</span>
            </p>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2">
          <div className="relative" ref={guidesRef}>
            <button
              type="button"
              onClick={() => {
                setShowGuidesMenu(!showGuidesMenu);
                setShowExportMenu(false);
              }}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 rounded-lg border border-slate-200 transition"
            >
              <Compass className="w-3.5 h-3.5 text-blue-600" />
              <span>Guides</span>
              {hasCustomPlaybook && <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />}
              <ChevronDown className="w-3 h-3 text-slate-400" />
            </button>
            {showGuidesMenu && (
              <div className="absolute right-0 mt-1 w-64 bg-white border border-slate-200 rounded-xl shadow-lg p-1.5 z-50 text-xs">
                {onOpenCompareStages && (
                  <button
                    type="button"
                    onClick={() => {
                      onOpenCompareStages();
                      setShowGuidesMenu(false);
                    }}
                    className="w-full flex items-center gap-2 p-2 hover:bg-blue-50 rounded-lg text-slate-700 hover:text-blue-900 font-semibold text-left"
                  >
                    <Compass className="w-4 h-4 text-blue-600 shrink-0" />
                    <span>Compare the three stages</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => {
                    onOpenGuide();
                    setShowGuidesMenu(false);
                  }}
                  className="w-full flex items-center gap-2 p-2 hover:bg-blue-50 rounded-lg text-slate-700 hover:text-blue-900 font-semibold text-left"
                >
                  <BookOpenText className="w-4 h-4 text-slate-600 shrink-0" />
                  <span>How the stages differ</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    onOpenPlaybook();
                    setShowGuidesMenu(false);
                  }}
                  className="w-full flex items-center gap-2 p-2 hover:bg-blue-50 rounded-lg text-slate-700 hover:text-blue-900 font-semibold text-left"
                >
                  <Sparkles className="w-4 h-4 text-blue-600 shrink-0" />
                  <div>
                    <div>Writing rules</div>
                    <div className="text-[10px] text-slate-400 font-normal">
                      {hasCustomPlaybook ? 'You changed the standard rules' : 'The standard rules are in use'}
                    </div>
                  </div>
                </button>
              </div>
            )}
          </div>

          {onOpenCompliance && (
            <button
              onClick={onOpenCompliance}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border transition ${
                hasPolicyWarnings
                  ? 'bg-amber-50 text-amber-800 border-amber-300'
                  : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
              }`}
              title="Check competitor names, overstated claims, and line length"
            >
              <ShieldCheck
                className={`w-3.5 h-3.5 ${
                  hasPolicyWarnings ? 'text-amber-600' : 'text-emerald-600'
                }`}
              />
              <span className="hidden sm:inline">Policy check</span>
            </button>
          )}

          {admin && onOpenStageUrlRules && (
            <button
              type="button"
              id="open-stage-url-rules"
              onClick={onOpenStageUrlRules}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:text-slate-900 bg-white hover:bg-slate-50 rounded-lg border border-slate-200 transition"
              title="Edit which page patterns each funnel stage prefers"
            >
              <Sliders className="w-3.5 h-3.5 text-blue-600" />
              <span className="hidden sm:inline">Page patterns</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => {
              logout().catch(() => undefined);
            }}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:text-slate-900 bg-white hover:bg-slate-50 rounded-lg border border-slate-200 transition"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>Sign out</span>
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
                      <div>Google Ads Editor spreadsheet</div>
                      <div className="text-[10px] text-slate-400 font-normal">
                        A file you can import. Weibo and WeChat are in the note.
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
                      <div>Campaign brief</div>
                      <div className="text-[10px] text-slate-400 font-normal">
                        A document you can share
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
