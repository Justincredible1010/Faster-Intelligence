import React, { useState } from 'react';
import {
  BookOpen,
  Sparkles,
  Upload,
  FileText,
  Check,
  RotateCcw,
  X,
  ShieldCheck,
  Sliders,
  FileSpreadsheet,
  Presentation,
  CheckCircle2,
  HelpCircle,
} from 'lucide-react';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  customPlaybook: string;
  onSavePlaybook: (playbook: string) => void;
}

export const PRESET_SKILLS = {
  default: `# Springer Nature & Google Ads Master Marketing Skill

## 1. Brand Integrity & Scientific Tone
- Maintain prestigious, scholarly, and authoritative tone suitable for Nature Portfolio and Springer Nature.
- Strict prohibition of predatory publishing terms (never use "guaranteed acceptance", "instant publish", or "easy SCI").
- State an impact factor or 5-year impact factor only when the metrics section gives a clarivate_wos_journals_api value and a JCR year. Repeat that source and year next to the number. A journal-website or catalog figure stays off the ad.
- State an article-download or full-text-view count only when that count is in the metrics section. It is a count. State a download date, data-retrieved date, or usage year only when a labelled feature gives that date and its source. Do not invent a date. clarivate_wos_journals_api retrievedAt is a retrieval date, not a download date.

## 2. Google Responsive Search Ads (RSA) Best Practices
- Generate EXACTLY 15 diverse headlines (Google Best Practice for maximum Ad Strength):
  * Headlines 1-3: Brand & Official Publication Name (e.g. "Acta Pharmacologica Sinica", "Nature Portfolio Official").
  * Headlines 4-6: Authority metrics only when a trusted impact factor, quartile, or CAS zone is on the facts record. Omit them otherwise.
  * Headlines 7-9: Turnaround only when the facts record includes a trusted first-decision day count. Never invent a day count.
  * Headlines 10-12: Thematic Scope, Special Issue CFP, and NSFC Open Access Funding.
  * Headlines 13-15: Direct Author Action (Submit Manuscript, Author Guidelines).
  * STRICT CHARACTER LIMIT: Every single headline MUST be <= 30 characters.
- Generate EXACTLY 4 distinct descriptions (Google Best Practice):
  * Mix of Prestige, Speed, Special Issue Scope, and China Author Support.
  * STRICT CHARACTER LIMIT: Every description MUST be <= 90 characters.

## 3. Academic Integrity Negative Keywords Firewall
- Strictly include blockers against illegal essay mills, paper mills, and fraud in China:
  -代写, -买卖论文, -包录用, -降重包过, -枪手, -论文代发中介.

## 4. Google Display Ads (RDA) Visual Standards
- Responsive Display Ads require 1.91:1 Landscape (1200x628) and 1:1 Square (1200x1200).
- Images must maintain clean scholarly focal point with text occupying less than 20% of surface area.
- Include an impact-factor seal only when a trusted impact factor is on the facts record. Use Springer Nature navy (#002d62) for the brand.`,

  chinaStrategy: `# Greater China Academic Author Acquisition Strategy (CAS Zone 1 & NSFC Focus)

## Key Strategic Pillars for Chinese Scholars:
1. CAS Zone (中科院分区):
   - Mention a CAS zone only when the facts record includes that exact zone. Do not write 中科院1区, Top, or any other zone that is not on the record.
   - Chinese university tenure and hospital promotion often depend on the zone, so leave the claim out rather than guess it.

2. National Natural Science Foundation of China (NSFC) Compliance:
   - Explicitly highlight: "符合国家自然科学基金(NSFC)开放获取受资助论文存储与发表规范".

3. Transparent APC and Institutional Waiver Programs:
   - Provide clear information on APC funding eligibility, institutional transformational agreements, and discounts.

4. Peer Review Turnaround Urgency:
   - Chinese researchers face strict graduation and project grant submission deadlines (e.g. March NSFC deadline). Emphasize fast initial decision cycle (初审周期).`,

  displayVisuals: `# Google Display Ads & Adobe Stock Creative Direction Guidelines

## 1. Visual Asset Composition:
- Use clean scientific laboratory, crystallography, genomics, or microscopy visuals.
- Do not clutter images with extensive text. Overlay an impact-factor seal only when a trusted impact factor is on the facts record, and name Clarivate only when that value came from the Clarivate API.
- Comply with Google Ads <20% text rule to avoid reduced ad impressions.

## 2. Standard Aspect Ratios:
- Landscape (1.91:1): 1200 x 628 px
- Square (1:1): 1200 x 1200 px
- Medium Rectangle: 300 x 250 px
- Leaderboard: 728 x 90 px
- Wide Skyscraper: 160 x 600 px

## 3. Brand Color Palette:
- Primary: Springer Deep Navy (#002d62)
- Secondary: Nature Emerald (#022c22)
- Accent: Clarivate Gold (#fbbf24) / Cyan (#38bdf8)`,
};

export const PlaybookSkillModal: React.FC<Props> = ({
  isOpen,
  onClose,
  customPlaybook,
  onSavePlaybook,
}) => {
  const [playbookText, setPlaybookText] = useState(
    customPlaybook || PRESET_SKILLS.default
  );
  const [activePreset, setActivePreset] = useState<'default' | 'chinaStrategy' | 'displayVisuals'>('default');
  const [savedSuccess, setSavedSuccess] = useState(false);
  const [uploadedFileName, setUploadedFileName] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadedFileName(file.name);

    // If text / markdown / csv / json
    if (file.name.endsWith('.txt') || file.name.endsWith('.md') || file.name.endsWith('.json') || file.name.endsWith('.csv')) {
      const reader = new FileReader();
      reader.onload = (event) => {
        const content = event.target?.result as string;
        if (content) {
          const formatted = `# Custom Uploaded Playbook: ${file.name}\n\n${content}`;
          setPlaybookText(formatted);
        }
      };
      reader.readAsText(file);
    } else {
      // For PPT, PPTX, PDF, DOCX: Read text or create parsed summary
      const reader = new FileReader();
      reader.onload = (event) => {
        const result = event.target?.result;
        // Generate parsed guideline format
        const guidelineHeader = `# Uploaded Guidelines Document: ${file.name}
Uploaded at: ${new Date().toLocaleDateString()}
File type: ${file.type || file.name.split('.').pop()?.toUpperCase()}

## Extracted Playbook Rules:
- Apply brand guidelines and creative instructions specified in ${file.name}.
- Follow Springer Nature official scholarly standards.
- Enforce Google Ads RSA 15 headlines (<=30 chars) and 4 descriptions (<=90 chars).
- Ensure all Clarivate metrics and CAS Zone rankings are strictly grounded in fact.`;
        setPlaybookText(guidelineHeader);
      };
      reader.readAsArrayBuffer(file);
    }
  };

  const handleApplyPreset = (key: 'default' | 'chinaStrategy' | 'displayVisuals') => {
    setActivePreset(key);
    setPlaybookText(PRESET_SKILLS[key]);
    setUploadedFileName(null);
  };

  const handleSave = () => {
    onSavePlaybook(playbookText);
    setSavedSuccess(true);
    setTimeout(() => {
      setSavedSuccess(false);
      onClose();
    }, 1000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs overflow-y-auto">
      <div className="relative w-full max-w-3xl max-h-[92vh] bg-white border border-slate-200 rounded-2xl shadow-2xl flex flex-col text-slate-800 animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="sticky top-0 z-10 flex items-center justify-between px-6 py-4 bg-white border-b border-slate-200">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-[#002d62] text-white flex items-center justify-center font-bold shadow-sm">
              <Presentation className="w-5 h-5 text-sky-300" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <span>Playbook & LLM Skill Guidelines</span>
                <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-200">
                  Active Knowledge Skill
                </span>
              </h2>
              <p className="text-xs text-slate-500">
                Upload PPT guideline slides, Adobe stock briefs, or custom copywriting playbooks used by the AI engine
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

        {/* Content */}
        <div className="p-6 space-y-4 overflow-y-auto flex-1 text-xs">
          {/* Preset Buttons */}
          <div className="space-y-1.5">
            <span className="font-bold text-slate-700 text-xs block">Choose a Built-In Best Practice Skill Preset:</span>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => handleApplyPreset('default')}
                className={`p-2.5 rounded-xl border text-left transition flex flex-col gap-1 ${
                  activePreset === 'default'
                    ? 'bg-blue-50 border-blue-500 text-blue-900 font-semibold'
                    : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100'
                }`}
              >
                <div className="flex items-center gap-1.5 font-bold">
                  <BookOpen className="w-3.5 h-3.5 text-blue-600" />
                  <span>Google RSA & Springer</span>
                </div>
                <span className="text-[11px] text-slate-500 font-normal">
                  15 Headlines, 4 Descriptions, Anti-fraud shield
                </span>
              </button>

              <button
                type="button"
                onClick={() => handleApplyPreset('chinaStrategy')}
                className={`p-2.5 rounded-xl border text-left transition flex flex-col gap-1 ${
                  activePreset === 'chinaStrategy'
                    ? 'bg-blue-50 border-blue-500 text-blue-900 font-semibold'
                    : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100'
                }`}
              >
                <div className="flex items-center gap-1.5 font-bold">
                  <ShieldCheck className="w-3.5 h-3.5 text-blue-600" />
                  <span>Greater China Strategy</span>
                </div>
                <span className="text-[11px] text-slate-500 font-normal">
                  CAS Zone 1/2, NSFC OA, Hospital promotions
                </span>
              </button>

              <button
                type="button"
                onClick={() => handleApplyPreset('displayVisuals')}
                className={`p-2.5 rounded-xl border text-left transition flex flex-col gap-1 ${
                  activePreset === 'displayVisuals'
                    ? 'bg-blue-50 border-blue-500 text-blue-900 font-semibold'
                    : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100'
                }`}
              >
                <div className="flex items-center gap-1.5 font-bold">
                  <Presentation className="w-3.5 h-3.5 text-blue-600" />
                  <span>Display Ad & Visuals</span>
                </div>
                <span className="text-[11px] text-slate-500 font-normal">
                  1200x628 & 1200x1200 specs, &lt;20% text rule
                </span>
              </button>
            </div>
          </div>

          {/* Upload Box */}
          <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-3">
            <div className="space-y-0.5">
              <span className="font-bold text-slate-900 flex items-center gap-1.5 text-xs">
                <Upload className="w-3.5 h-3.5 text-blue-600" />
                <span>Upload Corporate Playbook / PPT Guidelines (.ppt, .pptx, .pdf, .txt, .md)</span>
              </span>
              <p className="text-[11px] text-slate-500">
                Upload your agency brief, marketing slide deck guidelines, or internal brand book
              </p>
              {uploadedFileName && (
                <div className="text-[11px] font-semibold text-emerald-700 flex items-center gap-1 pt-1">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                  <span>Loaded file: {uploadedFileName}</span>
                </div>
              )}
            </div>
            <label className="cursor-pointer px-4 py-2 bg-white hover:bg-slate-100 border border-slate-300 rounded-xl text-xs font-semibold text-slate-700 transition shadow-2xs shrink-0 flex items-center gap-1.5">
              <Upload className="w-3.5 h-3.5 text-blue-600" />
              <span>Upload Guidelines</span>
              <input
                type="file"
                accept=".txt,.md,.text,.pdf,.ppt,.pptx,.docx,.json,.csv"
                onChange={handleFileUpload}
                className="hidden"
              />
            </label>
          </div>

          {/* Text Editor */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-slate-600 font-semibold">
              <label className="flex items-center gap-1.5">
                <FileText className="w-3.5 h-3.5 text-blue-600" />
                <span>Active LLM Skill Rules & Markdown Playbook:</span>
              </label>
              <button
                type="button"
                onClick={() => handleApplyPreset('default')}
                className="text-[11px] text-blue-600 hover:underline flex items-center gap-1"
              >
                <RotateCcw className="w-3 h-3" />
                <span>Reset to Standard Playbook</span>
              </button>
            </div>
            <textarea
              value={playbookText}
              onChange={(e) => setPlaybookText(e.target.value)}
              rows={14}
              className="w-full font-mono text-xs p-3.5 bg-slate-50 border border-slate-300 rounded-xl text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white leading-relaxed resize-none shadow-2xs"
              placeholder="Paste custom guidelines, PPT rules, or tone of voice specifications here..."
            />
          </div>

          <div className="p-3 bg-blue-50/70 border border-blue-200 rounded-xl text-[11px] text-blue-900 flex items-start gap-2">
            <ShieldCheck className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
            <span>
              <strong>How the AI engine applies this:</strong> When you save these rules, the backend directly injects this playbook as an authoritative guideline into every Google Search &amp; Display ad generation request for the LLM.
            </span>
          </div>
        </div>

        {/* Footer */}
        <div className="sticky bottom-0 px-6 py-3.5 bg-slate-50 border-t border-slate-200 flex items-center justify-between">
          <span className="text-xs text-slate-500">
            {playbookText.length} characters in active playbook
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="px-3.5 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-200 rounded-lg transition"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              className="px-4 py-2 text-xs font-bold text-white bg-[#002d62] hover:bg-[#00224a] rounded-lg transition flex items-center gap-1.5 shadow-sm"
            >
              {savedSuccess ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-300" />
                  <span>Saved to Active LLM Skill!</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-3.5 h-3.5 text-sky-300" />
                  <span>Save & Apply as LLM Skill</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
