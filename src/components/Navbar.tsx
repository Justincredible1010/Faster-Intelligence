import React from 'react';
import { BookOpen, Award, Download, Sparkles, Layers, Sliders, ShieldCheck, Compass } from 'lucide-react';

interface Props {
  onOpenGuide: () => void;
  onOpenPlaybook: () => void;
  onOpenCompareStages?: () => void;
  onExport: () => void;
  hasCampaign: boolean;
  hasCustomPlaybook?: boolean;
}

export const Navbar: React.FC<Props> = ({
  onOpenGuide,
  onOpenPlaybook,
  onOpenCompareStages,
  onExport,
  hasCampaign,
  hasCustomPlaybook,
}) => {
  return (
    <header className="sticky top-0 z-40 bg-white border-b border-slate-200 shadow-2xs">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between gap-4">
        {/* Brand identity */}
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-[#002d62] text-white flex items-center justify-center font-bold shadow-sm">
            <BookOpen className="w-5 h-5 text-sky-300" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-extrabold text-slate-900 text-base tracking-tight">
                Springer Nature AdEngine
              </span>
              <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 border border-slate-200 flex items-center gap-1">
                <Award className="w-3 h-3 text-blue-600" />
                <span>Clarivate JCR Verified</span>
              </span>
            </div>
            <p className="text-xs text-slate-500 hidden sm:block">
              Author Acquisition &amp; Multi-Stage Campaign Suite
            </p>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2">
          {onOpenCompareStages && (
            <button
              onClick={onOpenCompareStages}
              className="hidden md:flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 rounded-lg border border-slate-200 transition"
              title="Compare AWA, CON, and DEC side-by-side"
            >
              <Compass className="w-3.5 h-3.5 text-blue-600" />
              <span>Compare Stages</span>
            </button>
          )}

          <button
            onClick={onOpenPlaybook}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-blue-900 bg-blue-50 hover:bg-blue-100 rounded-lg border border-blue-200 transition"
            title="Upload and configure custom marketing rules & LLM skills"
          >
            <Sparkles className="w-3.5 h-3.5 text-blue-600" />
            <span>Playbook &amp; Skill</span>
            {hasCustomPlaybook && <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />}
          </button>

          <button
            onClick={onOpenGuide}
            className="px-3 py-1.5 text-xs font-medium text-slate-700 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 rounded-lg border border-slate-200 transition"
          >
            Framework
          </button>

          {hasCampaign && (
            <button
              onClick={onExport}
              className="flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold text-white bg-[#002d62] hover:bg-[#00224a] rounded-lg shadow-sm transition"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Export Ad Pack</span>
            </button>
          )}
        </div>
      </div>
    </header>
  );
};
