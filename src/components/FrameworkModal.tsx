import React from 'react';
import {
  CheckCircle2,
  Layers,
  BookOpen,
  Globe2,
  X,
  Award,
  ShieldCheck,
  ArrowRight,
  Compass,
  FileCheck,
} from 'lucide-react';
import { STAGE_CONFIGS } from '../types';

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

export const FrameworkModal: React.FC<Props> = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-slate-900/50 backdrop-blur-xs overflow-y-auto">
      <div className="relative w-full max-w-3xl max-h-[90vh] bg-white border border-slate-200 rounded-2xl shadow-xl overflow-y-auto text-slate-800 flex flex-col">
        {/* Header */}
        <div className="sticky top-0 z-10 flex items-center justify-between px-6 py-4 bg-white/95 border-b border-slate-200 backdrop-blur">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-[#002d62] text-white flex items-center justify-center font-bold">
              <BookOpen className="w-4 h-4 text-sky-300" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900">
                How the three stages differ
              </h2>
              <p className="text-xs text-slate-500">
                Awareness, consideration, and decision use different messages. Impact factors in the ads come only from Clarivate.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg hover:bg-slate-100 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6 space-y-6 text-xs text-slate-700 leading-relaxed">
          {/* Section 1: The Three Funnel Stages */}
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-slate-900 font-bold text-sm">
              <Layers className="w-4 h-4 text-blue-600" />
              <span>1. Meaningful Stage Differentiation: AWA, CON &amp; DEC</span>
            </div>
            <p className="text-slate-600">
              The same journal must produce materially distinct advertising assets at each stage. Changing only a label or synonym is insufficient; the author's mindset, communication objective, tone, and destination must align:
            </p>

            <div className="grid gap-3 pt-1">
              {/* AWA */}
              <div className="p-3.5 rounded-xl border border-sky-200 bg-sky-50/40 space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-sky-950 text-xs">
                    {STAGE_CONFIGS.AWA.name}
                  </span>
                  <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-sky-100 text-sky-800">
                    Low Pressure Discovery
                  </span>
                </div>
                <p className="text-slate-600">
                  <strong>Author Mindset:</strong> {STAGE_CONFIGS.AWA.authorMindset}
                </p>
                <p className="text-slate-600">
                  <strong>Focus:</strong> Research topics, scientific breadth, global community, and publisher identity. Omit submission pressure, deadlines, and upload pushes.
                </p>
                <div className="text-[11px] text-sky-900 pt-1">
                  <strong>Suitable CTAs:</strong> "Explore the journal", "Browse articles", "Discover the scope"
                </div>
              </div>

              {/* CON */}
              <div className="p-3.5 rounded-xl border border-indigo-200 bg-indigo-50/40 space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-indigo-950 text-xs">
                    {STAGE_CONFIGS.CON.name}
                  </span>
                  <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-indigo-100 text-indigo-800">
                    Transparent Evaluation
                  </span>
                </div>
                <p className="text-slate-600">
                  <strong>Author Mindset:</strong> {STAGE_CONFIGS.CON.authorMindset}
                </p>
                <p className="text-slate-600">
                  <strong>Focus:</strong> Aims and scope, accepted article types, editorial rigor, publishing model, transparent APC fees, and verified Clarivate metrics.
                </p>
                <div className="text-[11px] text-indigo-900 pt-1">
                  <strong>Suitable CTAs:</strong> "Check journal fit", "Review aims and scope", "Explore publishing options"
                </div>
              </div>

              {/* DEC */}
              <div className="p-3.5 rounded-xl border border-emerald-200 bg-emerald-50/40 space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-emerald-950 text-xs">
                    {STAGE_CONFIGS.DEC.name}
                  </span>
                  <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-emerald-100 text-emerald-800">
                    Action &amp; Guidance
                  </span>
                </div>
                <p className="text-slate-600">
                  <strong>Author Mindset:</strong> {STAGE_CONFIGS.DEC.authorMindset}
                </p>
                <p className="text-slate-600">
                  <strong>Focus:</strong> Author guidelines, manuscript formatting requirements, required documentation, fee waiver policies, and official submission portal. Omit invented deadlines or guaranteed publication.
                </p>
                <div className="text-[11px] text-emerald-900 pt-1">
                  <strong>Suitable CTAs:</strong> "View submission checklist", "Read author guidelines", "Start submission"
                </div>
              </div>
            </div>
          </div>

          {/* Section 2: Factual Integrity & Grounding */}
          <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
            <div className="flex items-center gap-2 text-slate-900 font-bold text-xs uppercase tracking-wider">
              <Award className="w-4 h-4 text-blue-600" />
              <span>2. Factual Trust &amp; Anti-Hallucination Safeguards</span>
            </div>
            <ul className="text-slate-600 space-y-1 list-disc pl-4">
              <li>
                <strong>Clarivate JCR Grounding:</strong> Impact factors and quartiles are strictly tied to Clarivate Journal Citation Reports (2024 edition).
              </li>
              <li>
                <strong>No Fabricated Claims:</strong> The engine will never invent special issues, deadlines, or competing journal superiority claims.
              </li>
              <li>
                <strong>Transparent Fee Models:</strong> Open access APCs and waiver availability are accurately represented without false compliance claims.
              </li>
              <li>
                <strong>Academic Integrity Shield:</strong> Automatically equips campaigns with negative keywords (<code>-代写, -买卖论文, -包录用</code>) to protect academic integrity.
              </li>
            </ul>
          </div>
        </div>

        {/* Footer */}
        <div className="sticky bottom-0 px-6 py-3.5 bg-slate-50 border-t border-slate-200 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 text-xs font-semibold text-white bg-[#002d62] hover:bg-[#00224a] rounded-lg transition"
          >
            Close Framework Guide
          </button>
        </div>
      </div>
    </div>
  );
};
