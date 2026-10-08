# Marketing Content Generation Engine
### Source-Grounded Google Ads & Author Marketing Engine for Greater China & Global Scholarly Publishing

---

## 1. Executive Summary & Vision

**Marketing Content Generation Engine** is an enterprise-grade campaign creation, ad compliance, and targeting studio built specifically for scientific journals across **Springer Nature**, **Nature Portfolio**, **BioMed Central (BMC)**, and **SpringerLink**.

Scholarly author marketing operates under strict institutional and regulatory constraints:
- **Zero Hallucination Tolerance:** Fabricating journal impact metrics (e.g., Impact Factor, CAS Chinese Academy of Sciences quartile zones, review turnaround times) damages publisher credibility and violates advertising standards.
- **Strict Funnel Alignment:** Researchers searching for broad discipline trends require completely different positioning than authors actively comparing journal acceptance rates or looking for manuscript submission portals.
- **Cross-Border Bilingual Constraints:** Academic marketing targeting Chinese researchers must handle Google Ads' unique CJK character width calculations (2 visual width per Chinese character vs. 1 per Latin character) while preventing awkward language mixing.
- **Advertising Policy & Trademark Compliance:** Academic search ads must prevent competitor trademark infringement (Elsevier, Science, Cell, The Lancet, PNAS), avoid ungrounded superlatives ("fastest peer review", "guaranteed acceptance"), and maintain an **Academic Integrity Negative Keyword Firewall** against paper mills and ghostwriting agencies.

Marketing Content Generation Engine combines **Gemini 3.8 Flash** with deterministic domain-specific validation engines, a persistent metrics cache, interactive Google SERP & IAB display previews, and 1-click **Google Ads Editor import-ready CSV** exports.

---

## 2. Strategic Objectives

1. **Grounded Provenance (No Invented Defaults)**
   Every numeric claim (Impact Factor, 5-Year IF, CAS Zone, Decision Days, APC fee) must trace back to verified Clarivate Journal Citation Reports (JCR) data or explicitly audited user entries. If a journal is unknown or unindexed, the system returns `null` metrics, marks the record as `missing`, and strictly blocks campaign generation until official data is verified.
2. **True Funnel Differentiation (AWA · CON · DEC)**
   Move past generic promotional slogans. The engine synthesizes stage-specific intent, landing destinations, primary CTAs, search keywords, and responsive display banners calibrated to author psychology.
3. **Realistic Ad Previews with Real-Time Ad Strength**
   Provide high-fidelity mockups of Google Search SERPs (mobile & desktop) and standard IAB display formats (300×250, 728×90, 300×600, 320×50, 1:1, 1.91:1) with live character counters, responsive asset shufflers, and 4-star Google Ad Strength scoring.
4. **CJK Double-Width & Language Purity Enforcement**
   Enforce Google Ads character limits using double-width counting (`countCharacterWidth`) for Chinese ideographs and validate absolute language purity (clean English vs. clean Chinese vs. controlled bilingual).
5. **Automated Google Ads Policy Audit & Auto-Fix**
   Proactively scan for competitor trademark usage, unverifiable superlatives, misleading editorial claims, and character overflows with a one-click auto-repair engine.
6. **Production-Ready Campaign Export**
   Produce Google Ads Editor CSV files ready for direct bulk import into active Google Ads accounts without manual reformatting.

---

## 3. Marketing Framework: The Author Journey Funnel

The engine organizes all ad generation, keywords, and call-to-actions around three distinct stages of the scholarly author lifecycle:

```
┌────────────────────────────────────────────────────────────────────────┐
│                        THE AUTHOR JOURNEY FUNNEL                       │
└────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
       ┌─────────────────────────────────────────────────────────┐
       │   AWA · Awareness (Discovery & Scope)                   │
       │   Author Mindset: "What is this journal & who reads it?"│
       │   Target: Broad discipline keywords, field discovery    │
       │   Primary CTA: "Explore the journal" / "了解期刊范围"   │
       │   Destination: /about (Journal Overview & Latest Scope) │
       └─────────────────────────────────────────────────────────┘
                                    │
                                    ▼
       ┌─────────────────────────────────────────────────────────┐
       │   CON · Consideration (Fit, Evaluation & Metrics)       │
       │   Author Mindset: "Is my paper a fit? How rigorous is it?│
       │   Target: Metric queries, JCR IF, CAS Zone, comparisons │
       │   Primary CTA: "Check journal fit" / "评估期刊契合度"   │
       │   Destination: /aims-and-scope (Aims & Scope & APC Fees)│
       └─────────────────────────────────────────────────────────┘
                                    │
                                    ▼
       ┌─────────────────────────────────────────────────────────┐
       │   DEC · Decision (Readiness & Submission)               │
       │   Author Mindset: "How do I format and submit my paper?"│
       │   Target: "Submit manuscript", author guidelines, portal│
       │   Primary CTA: "Submit your manuscript" / "立即投递稿件"│
       │   Destination: /submit (Author Guidelines & Portal)     │
       └─────────────────────────────────────────────────────────┘
```

### Stage Deep Dive

| Stage Code | Strategy Name | Author Mindset | Primary CTA | Recommended Destination | Core Messaging & Policy Guards |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **AWA** | Awareness | Discovery & Field Readership | *"Explore the journal"* / *"了解期刊范围"* | `/about` (Journal Scope & Research) | Focus on discipline scope, scientific community, open research, and publisher prestige. **Strict Rule:** Zero submission pressure; no submission deadlines or calls to submit. |
| **CON** | Consideration | Fit, Rigor & Comparisons | *"Check journal fit"* / *"评估期刊契合度"* | `/aims-and-scope` (Aims, Formats & Fees) | Evaluate manuscript fit, accepted formats, transparent APC pricing, Clarivate IF, CAS Quartiles, and turnaround time. **Strict Rule:** Zero competitor bashing or disparaging claims. |
| **DEC** | Decision | Guidelines & Submission | *"Submit your manuscript"* / *"立即投递稿件"* | `/submit` (Author Guidelines & Portal) | Manuscript submission checklist, formatting guidelines, peer review standards, fast author service. **Strict Rule:** Zero guaranteed acceptance or expedited peer review promises. |

---

## 4. Fact Provenance & Metric Verification Architecture

Scientific advertising demands rigorous data verification. AdEngine enforces a strict four-tier verification hierarchy:

```
┌────────────────────────────────────────────────────────────────────────┐
│                     METRIC PROVENANCE HIERARCHY                        │
├────────────────────────────┬───────────────────────────────────────────┤
│ clarivate_official         │ Verified from official Clarivate JCR      │
│                            │ database / authoritative curated catalog  │
├────────────────────────────┼───────────────────────────────────────────┤
│ user_provided              │ Manually supplied & confirmed by user in  │
│                            │ the "Add / Edit Journal Metrics" modal    │
├────────────────────────────┼───────────────────────────────────────────┤
│ unverified                 │ Retrieved via external web search engine; │
│                            │ requires user audit before launch         │
├────────────────────────────┼───────────────────────────────────────────┤
│ missing                    │ Unknown journal or unindexed record;      │
│                            │ ALL numeric fields return null.           │
│                            │ Campaign generation is BLOCKED.           │
└────────────────────────────┴───────────────────────────────────────────┘
```

### The "No Hallucination" Rule
- When an unknown URL is requested and no official record is found, the backend returns:
  ```json
  {
    "impactFactor": null,
    "fiveYearImpactFactor": null,
    "jcrQuartile": null,
    "casZone": null,
    "firstDecisionDays": null,
    "apcUsd": null,
    "verificationStatus": "missing",
    "missingFields": ["impactFactor", "casZone", "jcrQuartile", "firstDecisionDays", "apcUsd", "indexing"],
    "sourceAttribution": "Please manually verify and add journal metrics before generating campaigns."
  }
  ```
- The frontend UI displays warning badges highlighting all missing metrics and disables the **"Generate Campaign"** button with the message: *"Please complete journal metrics to continue."*
- Users can click **"Supply Metrics Manually"** to open `ManualJournalModal.tsx`. Supplied values are persisted into the backend cache and tagged with `user_provided`, unlocking the generator.

### Persistent Cache with Domain-Specific Expiration (`metrics-cache.json`)
Journal metrics change according to academic calendar cycles. The engine implements automatic expiration dates:
- **Clarivate JCR Impact Factor:** Expires annually on **June 30th** (coinciding with Clarivate's annual summer JCR release).
- **CAS Chinese Academy of Sciences Zone:** Expires annually on **December 31st** (coinciding with the annual CAS upgrade release).
- **First Decision Turnaround:** Expires after **90 days** (editorial workflow averages refresh quarterly).
- **Article Processing Charge (APC):** Expires after **180 days** (publisher price list review window).

---

## 5. Technical Architecture & Tech Stack

```
┌────────────────────────────────────────────────────────────────────────┐
│                      FULL-STACK SYSTEM TOPOLOGY                        │
└────────────────────────────────────────────────────────────────────────┘

  CLIENT (Browser SPA)
  ├── React 19 + TypeScript + Tailwind CSS v4 + Lucide Icons
  ├── InputStudio.tsx (URL resolver, metric badges, funnel & lang controls)
  ├── SearchResultsMockup.tsx (Desktop/Mobile SERP, Ad Strength, Shuffle)
  ├── DisplayAdCanvas.tsx (IAB 6-size banner grid + live character counts)
  ├── GoogleDisplayPreview.tsx (HTML5 Canvas Banner Studio & PNG export)
  ├── TargetingViewer.tsx (Academic keywords & Negative Integrity Shield)
  ├── ValidationReportModal.tsx (Google Ads policy compliance & 1-click fix)
  ├── ManualJournalModal.tsx (Manual journal metric override modal)
  ├── StageComparisonModal.tsx (AWA vs. CON vs. DEC side-by-side view)
  └── PlaybookSkillModal.tsx (Custom marketing playbook injection)
                           │
                           │  HTTP / REST (JSON)
                           ▼
  SERVER (Express + Node.js via tsx server.ts)
  ├── /api/fetch-clarivate-facts (Cached lookup with Clarivate JCR fallback)
  ├── /api/update-journal-metrics (Saves user-verified data to cache)
  ├── /api/generate-campaign (Gemini 3.8 Flash + deterministic strategy engine)
  ├── /api/compare-stages (Generates AWA, CON, DEC simultaneously)
  ├── /api/cache/* (List, inspect, refresh, and clear cache entries)
  ├── Gemini 3.8 Flash SDK (@google/genai)
  └── Persistent File System Storage (metrics-cache.json)
```

### Core Technologies
- **Frontend Framework:** React 19 (`react`, `react-dom`) with TypeScript.
- **Styling:** Tailwind CSS v4 (`@tailwindcss/vite`) using modern CSS variable configurations.
- **Icons:** `lucide-react` for iconography.
- **Server:** Express 4.x running in tandem with Vite development middlewares in dev mode, serving pre-built assets in production.
- **AI Engine:** Google `@google/genai` SDK using `gemini-3.8-flash` with structured JSON output configurations.
- **Build System:** Vite 8.x with TypeScript compilation (`tsc --noEmit`).

---

## 6. Google Ads Engine & Preview Capabilities

### A. Responsive Search Ads (RSA) Studio
- **15 Headlines (≤ 30 visual width each):** Structured across Journal Identity, Scope & Community, Evaluation & Metrics, and Call to Action.
- **4 Descriptions (≤ 90 visual width each):** Highlighting aims, peer-review turnaround, and transparent open-access policies.
- **Extensions:** 4 curated Sitelinks, Callouts, and Structured Snippets.
- **Realistic SERP Mockup:**
  - Styled after Google Search results with authentic typography, sponsored tags, favicon, display URLs, sitelinks rows/carousels, and snippet separators.
  - Viewport switcher: **Desktop (1200px)** and **Mobile (375px)**.
  - **Shuffle Button:** Simulates responsive search ad dynamic assembly by cycling headline and description combinations.
  - **Ad Strength Indicator (1–4 Stars):** Evaluates asset count, length diversity, keyword inclusion, and stage-specific CTA coverage.

### B. Responsive Display Ads (RDA) Studio
- **IAB Standard Sizes Canvas:** Renders 6 standard Google Display Network formats simultaneously with responsive fluid layouts:
  1. **Medium Rectangle:** 300 × 250 px
  2. **Leaderboard:** 728 × 90 px
  3. **Half Page / Large Skyscraper:** 300 × 600 px
  4. **Mobile Banner:** 320 × 50 px
  5. **Square:** 300 × 300 px (1:1)
  6. **Landscape:** 728 × 380 px (1.91:1)
  7. **Native In-Feed Card:** Content card format for research platforms.
- **HTML5 Canvas Banner Generator:** Real-time canvas renderer with academic background imagery, customizable hex palette, journal branding, and high-res PNG export.

### C. Academic Integrity Negative Keyword Firewall
Pre-configured negative keyword lists defend ad budgets against predatory traffic, essay mills, and academic misconduct in Greater China:
- `代写` (Ghostwriting)
- `买卖论文` (Paper Trading)
- `包录用` (Guaranteed Acceptance)
- `降重包过` (Plagiarism Bypass)
- `枪手` (Hired Test-Takers / Ghost Authors)
- `论文代发中介` (Paper Broker Agencies)

---

## 7. Google Ads Policy Compliance & Text Processing

### Google Ads Double-Width Character Counting (`countCharacterWidth`)
Google Ads counts full-width CJK ideographs and Chinese punctuation as **2 visual characters**, while Latin letters, numbers, and standard ASCII count as **1 character**.
```typescript
export function countCharacterWidth(text: string): number {
  const cjkChars = (text.match(/[\u4e00-\u9fa5\u3000-\u303f\uff01-\uff60]/g) || []).length;
  const otherChars = text.length - cjkChars;
  return (cjkChars * 2) + otherChars;
}
```
All headline validation (max 30 width) and description validation (max 90 width) enforce this calculation.

### Language Purity Validation
- **English-Only (`EN`):** Flags any accidental Chinese characters or punctuation.
- **Chinese-Only (`ZH`):** Flags stray Latin words, while permitting registered journal titles and standard acronyms (`SCIE`, `OA`, `APC`, `IF`).
- **Bilingual (`all`):** Pairs English and Chinese headlines side-by-side with appropriate position pinning.
- **1-Click Clean Tool:** `cleanStrayCharacters` sanitizes contaminated strings in real time.

### Automated Policy Auditing (`complianceValidator.ts`)
The audit engine flags compliance risks before campaign launch:
1. **Competitor Trademarks:** Flags unauthorized mentions of third-party publishers or competitor journals (*Elsevier, Cell Press, Science, PNAS, The Lancet, Wiley, IEEE*).
2. **Unverifiable Superlatives:** Flags unqualified claims (*"the best journal", "fastest peer review", "world's leading"*) requiring independent verification.
3. **Misleading Editorial Claims:** Prohibits unethical publication guarantees (*"guaranteed acceptance", "skip peer review", "express acceptance in 3 days"*).
4. **Missing Metric Claims:** Detects ads that claim an Impact Factor when the journal's verified record has `impactFactor: null`.
5. **1-Click Auto-Fix:** Rewrites superlatives into objective editorial facts, removes competitor trademarks, and truncates length overflows.

---

## 8. Google Ads Editor Export Specification

AdEngine generates four separate CSV files formatted specifically for the **Google Ads Editor** import utility:

### 1. `google-ads-responsive-search-ads.csv`
- **Columns:** `Campaign`, `Ad Group`, `Headline 1` through `Headline 15`, `Description 1` through `Description 4`, `Final URL`, `Path 1`, `Path 2`.
- Automatically maps stage-specific headlines and descriptions, clamped to strict character width rules.

### 2. `google-ads-keywords.csv`
- **Columns:** `Campaign`, `Ad Group`, `Keyword`, `Criterion Type`, `Max CPC`, `Status`.
- Formats match types: Exact `[keyword]`, Phrase `"keyword"`, and Broad.

### 3. `google-ads-negative-keywords.csv`
- **Columns:** `Campaign`, `Ad Group`, `Keyword`, `Criterion Type`.
- Injects the Academic Integrity Shield negative keywords to protect campaign quality.

### 4. `google-ads-responsive-display-ads.csv`
- **Columns:** `Campaign`, `Ad Group`, `Short Headline`, `Long Headline`, `Description`, `Business Name`, `Final URL`, `Call to Action`.
- Configures responsive display assets for immediate GDN deployment.

---

## 9. API Reference

| Endpoint | Method | Payload | Description |
| :--- | :--- | :--- | :--- |
| `/api/fetch-clarivate-facts` | `POST` | `{ "url": string, "forceRefresh"?: boolean }` | Resolves Clarivate JCR metrics from cache, verified catalog, or AI lookup. Returns `verificationStatus: 'missing'` if unknown. |
| `/api/update-journal-metrics` | `POST` | `{ "facts": ClarivateJournalMetrics }` | Saves user-supplied or audited journal metrics into persistent cache (`metrics-cache.json`). |
| `/api/generate-campaign` | `POST` | `{ "landingPageUrl": string, "funnelStage": "AWA"\|"CON"\|"DEC", "channels": string[], "outputLanguage": "all"\|"EN"\|"ZH", "customPlaybook"?: string, "userProvidedFacts"?: object }` | Generates full Google Search, Display, and Keywords pack. Rejects with `400` if required metrics are missing. |
| `/api/compare-stages` | `POST` | `{ "landingPageUrl": string, "outputLanguage"?: string }` | Generates and returns AWA, CON, and DEC strategies simultaneously for side-by-side comparison. |
| `/api/cache/list` | `GET` | — | Lists all currently cached journals, access timestamps, and expiration statuses. |
| `/api/cache/journal/:id` | `GET` | — | Inspects cached metric details and TTL expiration timestamps for a specific journal. |
| `/api/cache/refresh/:id` | `POST` | `{ "url"?: string }` | Forces a fresh remote lookup, bypassing existing cache entries. |
| `/api/cache/clear` | `POST` | — | Flushes in-memory cache and deletes `metrics-cache.json` on disk. |

---

## 10. Development & Production Instructions

### Prerequisites
- Node.js (version 20+ recommended)
- npm or pnpm

### Environment Setup
Create a `.env` file in the root directory (refer to `.env.example`):
```bash
GEMINI_API_KEY=your_gemini_api_key_here
PORT=3000
NODE_ENV=development
```

### Installation
```bash
npm install
```

### Starting the Development Server
```bash
npm run dev
```
The server will start on `http://0.0.0.0:3000` with Vite middleware mounted for hot module reloading and full-stack Express routing.

### Type Checking & Linting
```bash
npm run lint
```

### Building for Production
```bash
npm run build
npm start
```

---

## 11. Ethical & Academic Integrity Statement

Marketing Content Generation Engine is designed to uphold the highest standards of scientific publishing ethics. It does not support or generate deceptive claims, artificial review acceleration guarantees, or ungrounded promotional hype. All campaigns generated through this engine are grounded in verified journal indexing criteria and adhere to the **Committee on Publication Ethics (COPE)** guidelines and **Google Ads Advertising Policies**.
