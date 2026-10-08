import React from 'react';
import {
  X,
  ShieldCheck,
  AlertTriangle,
  AlertCircle,
  CheckCircle2,
  Wand2,
  ExternalLink,
  ChevronRight,
  ShieldAlert,
} from 'lucide-react';
import { ComplianceValidationReport, ComplianceIssue } from '../types';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  report: ComplianceValidationReport | null;
  onAutoFix?: () => void;
}

export const ValidationReportModal: React.FC<Props> = ({
  isOpen,
  onClose,
  report,
  onAutoFix,
}) => {
  if (!isOpen || !report) return null;

  const isClean = report.status === 'clean';
  const hasErrors = report.errorsCount > 0;
  const hasWarnings = report.warningsCount > 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs animate-in fade-in duration-150">
      <div className="bg-white rounded-2xl max-w-2xl w-full border border-slate-200 shadow-2xl overflow-hidden flex flex-col max-h-[85vh]">
        {/* Header */}
        <div className="p-5 border-b border-slate-200 flex items-center justify-between bg-slate-50">
          <div className="flex items-center gap-3">
            <div
              className={`w-9 h-9 rounded-xl flex items-center justify-center ${
                hasErrors
                  ? 'bg-rose-100 text-rose-700'
                  : hasWarnings
                  ? 'bg-amber-100 text-amber-700'
                  : 'bg-emerald-100 text-emerald-700'
              }`}
            >
              {hasErrors ? (
                <AlertCircle className="w-5 h-5" />
              ) : hasWarnings ? (
                <AlertTriangle className="w-5 h-5" />
              ) : (
                <ShieldCheck className="w-5 h-5" />
              )}
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900">
                Google Ads Policy &amp; Academic Integrity Audit
              </h3>
              <p className="text-xs text-slate-500">
                Pre-flight validation for trademark usage, superlatives, and claim veracity. China Advertising Law notices do not change copy.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-slate-200 text-slate-400 hover:text-slate-700 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content body */}
        <div className="p-5 overflow-y-auto space-y-4 flex-1">
          {/* Status Overview Card */}
          <div
            className={`p-4 rounded-xl border flex items-center justify-between ${
              hasErrors
                ? 'bg-rose-50/70 border-rose-200 text-rose-950'
                : hasWarnings
                ? 'bg-amber-50/70 border-amber-200 text-amber-950'
                : 'bg-emerald-50/70 border-emerald-200 text-emerald-950'
            }`}
          >
            <div>
              <div className="font-bold text-sm flex items-center gap-2">
                {isClean && 'All Google Ads Policies Passed'}
                {hasErrors && `${report.errorsCount} Policy Violation(s) Found`}
                {!hasErrors && hasWarnings && `${report.warningsCount} Policy Advisory Warning(s)`}
              </div>
              <p className="text-xs opacity-80 mt-0.5">
                {isClean && 'Zero competitor trademarks, unverifiable superlatives, or misleading claims detected.'}
                {hasErrors && 'Action required: Prohibited claims or character limits must be resolved before publishing.'}
                {!hasErrors && hasWarnings && 'Advisory: Review competitor keywords and funding claim specifics before launch.'}
              </p>
            </div>

            {hasErrors && onAutoFix && (
              <button
                onClick={onAutoFix}
                className="px-3.5 py-1.5 bg-rose-600 hover:bg-rose-700 text-white rounded-lg text-xs font-bold shadow-xs transition flex items-center gap-1.5 shrink-0"
              >
                <Wand2 className="w-3.5 h-3.5" />
                <span>Auto-Fix All</span>
              </button>
            )}
          </div>

          {/* Issue list */}
          {report.issues.length === 0 ? (
            <div className="py-8 text-center space-y-2">
              <CheckCircle2 className="w-10 h-10 text-emerald-500 mx-auto" />
              <div className="text-sm font-bold text-slate-800">Clean Campaign Compliance</div>
              <p className="text-xs text-slate-500 max-w-sm mx-auto">
                Headlines, descriptions, and keywords adhere to Google Ads character widths, scholarly honesty, and trademark rules.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                Audit Findings ({report.issues.length})
              </div>
              {report.issues.map((issue) => (
                <div
                  key={issue.id}
                  className={`p-3.5 rounded-xl border text-xs space-y-2 ${
                    issue.type === 'error'
                      ? 'bg-rose-50/40 border-rose-200'
                      : 'bg-amber-50/40 border-amber-200'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span
                      className={`font-semibold px-2 py-0.5 rounded text-[10px] uppercase tracking-wider ${
                        issue.type === 'error'
                          ? 'bg-rose-200 text-rose-800'
                          : 'bg-amber-200 text-amber-800'
                      }`}
                    >
                      {issue.category.replaceAll('_', ' ')}
                    </span>
                    <span className="font-mono text-[10px] text-slate-500">
                      {issue.fieldLocation}
                    </span>
                  </div>

                  <p className="text-slate-800 font-medium leading-relaxed">
                    {issue.message}
                  </p>

                  <div className="p-2 rounded-lg bg-white border border-slate-200 text-[11px] font-mono text-slate-700">
                    <span className="text-slate-400">Current text: </span>
                    <span className="text-rose-700 font-medium">{issue.targetText}</span>
                  </div>

                  {issue.suggestedFix && (
                    <div className="flex items-center justify-between text-[11px] pt-1">
                      <div className="text-emerald-700 flex items-center gap-1">
                        <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                        <span>Suggested fix: <strong>{issue.suggestedFix}</strong></span>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-200 bg-slate-50 flex items-center justify-between">
          <span className="text-[11px] text-slate-500">
            Audit checked against Google Ads Editorial &amp; Trademark Standards
          </span>
          <div className="flex items-center gap-2">
            {hasErrors && onAutoFix && (
              <button
                onClick={onAutoFix}
                className="px-3.5 py-1.5 bg-blue-700 hover:bg-blue-800 text-white rounded-lg text-xs font-bold transition flex items-center gap-1.5"
              >
                <Wand2 className="w-3.5 h-3.5" />
                <span>Apply Auto-Fix</span>
              </button>
            )}
            <button
              onClick={onClose}
              className="px-4 py-1.5 bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 rounded-lg text-xs font-semibold transition"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
