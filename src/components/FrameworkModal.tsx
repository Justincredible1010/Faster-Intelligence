import React from 'react';
import { CheckCircle2, Layers, BookOpen, Globe2, X, Award, ShieldCheck, ArrowRight } from 'lucide-react';

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

export const FrameworkModal: React.FC<Props> = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs overflow-y-auto">
      <div className="relative w-full max-w-3xl max-h-[90vh] bg-white border border-slate-200 rounded-2xl shadow-xl overflow-y-auto text-slate-800 flex flex-col">
        {/* Header */}
        <div className="sticky top-0 z-10 flex items-center justify-between px-6 py-4 bg-white/95 border-b border-slate-200 backdrop-blur">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-700 border border-blue-200 flex items-center justify-center">
              <BookOpen className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900">
                Springer Nature & Clarivate Ad Generation Strategy
              </h2>
              <p className="text-xs text-slate-500">
                Funnel Calibration, Automated Fact Fetching & Greater China Researcher Acquisition
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
        <div className="p-6 space-y-6 text-sm text-slate-700 leading-relaxed">
          {/* Section 1: Automated Hard Facts vs Creative Copy */}
          <div className="p-4 rounded-xl bg-blue-50/50 border border-blue-100 space-y-2">
            <div className="flex items-center gap-2 text-blue-900 font-semibold text-sm">
              <Award className="w-4 h-4 text-blue-600" />
              <span>1. Automated Hard Facts (Clarivate JCR & SpringerLink)</span>
            </div>
            <p className="text-xs text-slate-600 leading-relaxed">
              Marketers only need to enter the journal landing page URL. The engine connects the URL to verified Clarivate Journal Citation Reports (JCR) and SpringerLink metadata to automatically retrieve:
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1 text-xs">
              <div className="p-2 bg-white rounded-lg border border-blue-200 text-center font-medium">
                Clarivate Impact Factor
              </div>
              <div className="p-2 bg-white rounded-lg border border-blue-200 text-center font-medium">
                CAS Zone (中科院分区)
              </div>
              <div className="p-2 bg-white rounded-lg border border-blue-200 text-center font-medium">
                First Decision Speed
              </div>
              <div className="p-2 bg-white rounded-lg border border-blue-200 text-center font-medium">
                Open Access & APC
              </div>
            </div>
          </div>

          {/* Section 2: Funnel Differentiation Matrix */}
          <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-3">
            <div className="flex items-center gap-2 text-slate-900 font-semibold text-sm">
              <Layers className="w-4 h-4 text-indigo-600" />
              <span>2. Funnel Stage Differentiation (Same Journal, Distinct Messaging)</span>
            </div>
            <p className="text-xs text-slate-600">
              When you select different funnel stages for the exact same landing page, the model dynamically shifts the copy angle and keyword intent:
            </p>

            <div className="space-y-2 text-xs">
              <div className="p-3 bg-white rounded-lg border border-slate-200">
                <span className="font-bold text-blue-800 block mb-0.5">TOFU (Awareness Stage)</span>
                <span className="text-slate-600">
                  Target: Scholars seeking prestigious journals. Ad Copy emphasizes high citations, Nature Portfolio authority, and Clarivate IF. Keywords focus on reputation queries.
                </span>
              </div>
              <div className="p-3 bg-white rounded-lg border border-slate-200">
                <span className="font-bold text-indigo-800 block mb-0.5">MOFU (Consideration Stage)</span>
                <span className="text-slate-600">
                  Target: Authors evaluating Special Issues or thematic relevance. Ad Copy highlights Call for Papers (CFP), CAS Zone 1/2 qualification, and guest editors.
                </span>
              </div>
              <div className="p-3 bg-white rounded-lg border border-slate-200">
                <span className="font-bold text-emerald-800 block mb-0.5">BOFU (Direct Action Stage)</span>
                <span className="text-slate-600">
                  Target: Researchers with immediate submission needs (grant deadlines, graduating PhDs). Ad Copy highlights 17–28 day turnaround speed, deadlines, and APC waiver support.
                </span>
              </div>
            </div>
          </div>

          {/* Section 3: Greater China Author Acquisition */}
          <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
            <div className="flex items-center gap-2 text-slate-900 font-semibold text-sm">
              <Globe2 className="w-4 h-4 text-emerald-600" />
              <span>3. Reaching Greater China Academic Researchers</span>
            </div>
            <ul className="text-xs text-slate-600 space-y-1.5 list-disc list-inside">
              <li>
                <strong>Bilingual Search Ads:</strong> Generates English copy alongside targeted Chinese copy to appeal to researchers searching via campus proxy networks or Google Hong Kong.
              </li>
              <li>
                <strong>Academic Integrity Shield:</strong> Automatically populates negative keywords (<code>-代写, -买卖论文, -包录用</code>) to block illicit paper mill traffic and safeguard Springer Nature's brand prestige.
              </li>
              <li>
                <strong>Display Ad Placement:</strong> Positions responsive banners across academic web properties (ResearchGate, PubMed Central, ScienceDirect).
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
            Close Guide
          </button>
        </div>
      </div>
    </div>
  );
};
