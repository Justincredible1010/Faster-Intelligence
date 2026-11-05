import React, { useState } from 'react';
import { X, Check, BookOpen, ShieldCheck, AlertCircle, Save, Plus } from 'lucide-react';
import { ClarivateJournalMetrics } from '../types';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  initialFacts?: ClarivateJournalMetrics | null;
  onSaveFacts: (facts: ClarivateJournalMetrics) => void;
}

export const ManualJournalModal: React.FC<Props> = ({
  isOpen,
  onClose,
  initialFacts,
  onSaveFacts,
}) => {
  if (!isOpen) return null;

  const [journalName, setJournalName] = useState(initialFacts?.journalName || '');
  const [publisher, setPublisher] = useState(initialFacts?.publisher || 'Springer Nature');
  const [impactFactor, setImpactFactor] = useState<string>(
    initialFacts?.impactFactor !== null && initialFacts?.impactFactor !== undefined
      ? String(initialFacts.impactFactor)
      : ''
  );
  const [fiveYearIf, setFiveYearIf] = useState<string>(
    initialFacts?.fiveYearImpactFactor !== null && initialFacts?.fiveYearImpactFactor !== undefined
      ? String(initialFacts.fiveYearImpactFactor)
      : ''
  );
  const [jcrQuartile, setJcrQuartile] = useState<string>(initialFacts?.jcrQuartile || 'Q1');
  const [casZone, setCasZone] = useState<string>(initialFacts?.casZone || '中科院综合性期刊1区 Top');
  const [firstDecisionDays, setFirstDecisionDays] = useState<string>(
    initialFacts?.firstDecisionDays !== null && initialFacts?.firstDecisionDays !== undefined
      ? String(initialFacts.firstDecisionDays)
      : '28'
  );
  const [apcUsd, setApcUsd] = useState<string>(
    initialFacts?.apcUsd !== null && initialFacts?.apcUsd !== undefined
      ? String(initialFacts.apcUsd)
      : '3200'
  );
  const [openAccessType, setOpenAccessType] = useState<string>(
    initialFacts?.openAccessType || 'Hybrid Open Access'
  );
  const [chinaWaiver, setChinaWaiver] = useState<boolean>(initialFacts?.chinaWaiverAvailable || false);
  const [primaryDiscipline, setPrimaryDiscipline] = useState<string>(
    initialFacts?.primaryDiscipline || 'Scientific & Multidisciplinary'
  );
  const [indexingText, setIndexingText] = useState<string>(
    initialFacts?.indexing?.join(', ') || 'SCIE, Scopus, PubMed Central'
  );
  const [aimsAndScope, setAimsAndScope] = useState<string>(
    initialFacts?.aimsAndScopeSummary ||
      'Peer-reviewed scholarly journal publishing original research and review articles.'
  );

  const [formError, setFormError] = useState<string | null>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!journalName.trim()) {
      setFormError('Journal name is required.');
      return;
    }

    const ifNum = impactFactor ? parseFloat(impactFactor) : null;
    const fiveYearNum = fiveYearIf ? parseFloat(fiveYearIf) : null;
    const daysNum = firstDecisionDays ? parseInt(firstDecisionDays, 10) : null;
    const apcNum = apcUsd ? parseInt(apcUsd, 10) : null;

    const indexingList = indexingText
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);

    const updated: ClarivateJournalMetrics = {
      url: initialFacts?.url || `https://www.nature.com/${journalName.toLowerCase().replace(/\s+/g, '-')}`,
      journalName: journalName.trim(),
      publisher: publisher.trim(),
      impactFactor: ifNum,
      fiveYearImpactFactor: fiveYearNum,
      jcrQuartile: (jcrQuartile as any) || 'Q1',
      casZone: casZone.trim() || null,
      firstDecisionDays: daysNum,
      indexing: indexingList,
      openAccessType,
      apcUsd: apcNum,
      chinaWaiverAvailable: chinaWaiver,
      aimsAndScopeSummary: aimsAndScope.trim(),
      primaryDiscipline: primaryDiscipline.trim(),
      sourceAttribution: 'Manually supplied by user (User Verified)',
      verificationStatus: 'user_provided',
      reportingYear: 'User Provided (2025/2026)',
      isVerifiedClarivate: false,
      missingFields: [],
    };

    onSaveFacts(updated);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs animate-in fade-in duration-150">
      <div className="bg-white rounded-2xl max-w-xl w-full border border-slate-200 shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="p-5 border-b border-slate-200 flex items-center justify-between bg-slate-50">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-[#002d62] text-white flex items-center justify-center">
              <BookOpen className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900">
                {initialFacts?.verificationStatus === 'missing'
                  ? 'Complete Missing Journal Metrics'
                  : 'Add / Edit Journal Metrics'}
              </h3>
              <p className="text-[11px] text-slate-500">
                Supplied values are verified as user-provided and unlock campaign generation
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg hover:bg-slate-200 text-slate-400 hover:text-slate-700 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-5 overflow-y-auto space-y-4 flex-1 text-xs">
          {formError && (
            <div className="p-2.5 bg-rose-50 border border-rose-200 text-rose-800 rounded-lg flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
              <span>{formError}</span>
            </div>
          )}

          {/* Journal Name & Publisher */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block font-semibold text-slate-700 mb-1">
                Journal Title <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                value={journalName}
                onChange={(e) => setJournalName(e.target.value)}
                placeholder="e.g. Nature, Oncogene, BMC Biology"
                className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500 font-medium"
                required
              />
            </div>
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Publisher</label>
              <select
                value={publisher}
                onChange={(e) => setPublisher(e.target.value)}
                className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500 font-medium"
              >
                <option value="Springer Nature">Springer Nature</option>
                <option value="Nature Portfolio">Nature Portfolio</option>
                <option value="BMC (Part of Springer Nature)">BMC</option>
                <option value="SpringerLink">SpringerLink</option>
                <option value="Scientific Reports">Scientific Reports</option>
              </select>
            </div>
          </div>

          {/* IF, 5-Year IF, Quartile */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Impact Factor (IF)</label>
              <input
                type="number"
                step="0.1"
                value={impactFactor}
                onChange={(e) => setImpactFactor(e.target.value)}
                placeholder="e.g. 8.5"
                className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block font-semibold text-slate-700 mb-1">5-Year IF</label>
              <input
                type="number"
                step="0.1"
                value={fiveYearIf}
                onChange={(e) => setFiveYearIf(e.target.value)}
                placeholder="e.g. 9.1"
                className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block font-semibold text-slate-700 mb-1">JCR Quartile</label>
              <select
                value={jcrQuartile}
                onChange={(e) => setJcrQuartile(e.target.value)}
                className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500"
              >
                <option value="Q1">Q1</option>
                <option value="Q2">Q2</option>
                <option value="Q3">Q3</option>
                <option value="Q4">Q4</option>
              </select>
            </div>
          </div>

          {/* CAS Zone & First Decision Days */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block font-semibold text-slate-700 mb-1">CAS Zone (中科院分区)</label>
              <input
                type="text"
                value={casZone}
                onChange={(e) => setCasZone(e.target.value)}
                placeholder="e.g. 中科院1区 Top / 医学1区"
                className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block font-semibold text-slate-700 mb-1">1st Decision (Days)</label>
              <input
                type="number"
                value={firstDecisionDays}
                onChange={(e) => setFirstDecisionDays(e.target.value)}
                placeholder="e.g. 24"
                className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>
          </div>

          {/* APC & Open Access Type */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block font-semibold text-slate-700 mb-1">APC (USD $)</label>
              <input
                type="number"
                value={apcUsd}
                onChange={(e) => setApcUsd(e.target.value)}
                placeholder="e.g. 3500"
                className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Publishing Model</label>
              <select
                value={openAccessType}
                onChange={(e) => setOpenAccessType(e.target.value)}
                className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500"
              >
                <option value="Hybrid Open Access">Hybrid Open Access</option>
                <option value="Gold Open Access">Gold Open Access</option>
                <option value="Subscription / Free Option">Subscription / Free Option</option>
              </select>
            </div>
          </div>

          {/* Primary Discipline & Indexing */}
          <div className="space-y-3">
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Primary Discipline</label>
              <input
                type="text"
                value={primaryDiscipline}
                onChange={(e) => setPrimaryDiscipline(e.target.value)}
                placeholder="e.g. Oncology, Materials Science, Medicine"
                className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Indexing Databases</label>
              <input
                type="text"
                value={indexingText}
                onChange={(e) => setIndexingText(e.target.value)}
                placeholder="e.g. SCIE, PubMed Central, Scopus, DOAJ"
                className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Aims &amp; Scope Summary</label>
              <textarea
                rows={2}
                value={aimsAndScope}
                onChange={(e) => setAimsAndScope(e.target.value)}
                placeholder="Brief summary of what the journal accepts..."
                className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>
          </div>

          {/* China Waiver Toggle */}
          <div className="flex items-center gap-2 pt-1">
            <input
              type="checkbox"
              id="china-waiver-check"
              checked={chinaWaiver}
              onChange={(e) => setChinaWaiver(e.target.checked)}
              className="rounded text-blue-600 focus:ring-blue-500"
            />
            <label htmlFor="china-waiver-check" className="text-slate-700 font-medium cursor-pointer">
              Institutional OA Waivers / NSFC Funding Assistance Available for Greater China Scholars
            </label>
          </div>

          <div className="pt-3 border-t border-slate-200 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg font-semibold transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2 bg-[#002d62] hover:bg-[#00204d] text-white rounded-lg font-bold shadow-xs transition flex items-center gap-1.5"
            >
              <Save className="w-3.5 h-3.5" />
              <span>Save &amp; Verify Metrics</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
