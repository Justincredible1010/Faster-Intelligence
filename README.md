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
   A number in an ad can come only from a manual entry, a fact read on the journal page, or the Clarivate API. The in-repo catalog is a labeled snapshot: it can name the journal, and its figures stay out of ads. An unknown URL is marked `missing`, with null metrics, and campaign generation stays blocked.
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
       │   Primary CTA: "Explore the journal"                    │
       │   Destination: /about (Journal Overview & Latest Scope) │
       └─────────────────────────────────────────────────────────┘
                                    │
                                    ▼
       ┌─────────────────────────────────────────────────────────┐
       │   CON · Consideration (Fit, Evaluation & Metrics)       │
       │   Author Mindset: "Is my paper a fit? How rigorous is it?│
       │   Target: Metric queries, JCR IF, CAS Zone, comparisons │
       │   Primary CTA: "Check journal fit"                      │
       │   Destination: /aims-and-scope (Aims & Scope & APC Fees)│
       └─────────────────────────────────────────────────────────┘
                                    │
                                    ▼
       ┌─────────────────────────────────────────────────────────┐
       │   DEC · Decision (Readiness & Submission)               │
       │   Author Mindset: "What do I need to prepare and do to  │
       │   submit my manuscript?"                                │
       │   Target: author guidelines, checklist, portal          │
       │   Primary CTA: "View submission checklist"              │
       │   Destination: /submission-guidelines                   │
       └─────────────────────────────────────────────────────────┘
```

### Stage Deep Dive

| Stage Code | Strategy Name | Author Mindset | Primary CTA | Recommended Destination | Core Messaging & Policy Guards |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **AWA** | Awareness | Discovery & Field Readership | *"Explore the journal"* | `/about` (Journal Scope & Research) | Focus on discipline scope, scientific community, open research, and publisher prestige. **Strict Rule:** Zero submission pressure; no submission deadlines or calls to submit. |
| **CON** | Consideration | Fit, Rigor & Comparisons | *"Check journal fit"* | `/aims-and-scope` (Aims, Formats & Fees) | Evaluate manuscript fit, accepted formats, transparent APC pricing, Clarivate IF, CAS Quartiles, and turnaround time. **Strict Rule:** Zero competitor bashing or disparaging claims. |
| **DEC** | Decision | Guidelines & Submission | *"View submission checklist"* | `/submission-guidelines` (Author Guidelines & Submission Portal) | Manuscript preparation checklist, formatting guidelines, fee and waiver criteria, and the verified submission portal. **Strict Rule:** Zero guaranteed acceptance or expedited peer review promises. |

---

## 4. Fact Provenance & Metric Verification Architecture

Scientific advertising demands rigorous data verification. Metric numbers in ads may come only from a manual entry, a fact read on the journal page, or a future Clarivate API client. The in-repo catalog is a labeled snapshot, not a Clarivate verification.

```
┌────────────────────────────────────────────────────────────────────────┐
│                     METRIC PROVENANCE HIERARCHY                        │
├────────────────────────────┬───────────────────────────────────────────┤
│ clarivate_wos_journals_api │ Web of Science Journals API               │
│                            │ (api.clarivate.com/.../wos-journals/v1).  │
│                            │ Records the JCR year and retrieved-at.    │
│                            │ Stored by ISSN and JCR year. The key      │
│                            │ stays on the server (CLARIVATE_API_KEY).  │
├────────────────────────────┼───────────────────────────────────────────┤
│ page_sourced               │ Read from the journal page. The page      │
│                            │ client is unwired in this build.          │
├────────────────────────────┼───────────────────────────────────────────┤
│ user_provided              │ Typed and saved by the user.              │
├────────────────────────────┼───────────────────────────────────────────┤
│ catalog_snapshot           │ In-repo snapshot with a data year.        │
│                            │ Shown as a snapshot. Not used in ad copy. │
├────────────────────────────┼───────────────────────────────────────────┤
│ missing                    │ Unknown URL. Numeric fields are null.     │
│                            │ Campaign generation is blocked.           │
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
- **Article Processing Charge (APC):** Expires after **60 days** (publisher price list review window).

Each metric stores its own `expireAt`. A cached journal is treated as stale only when the impact-factor entry or the first-decision entry is past `expireAt`. CAS zone and APC expirations are recorded on those entries and do not, by themselves, force a refresh of the whole journal.

`metrics-cache.json` is a runtime file for catalog snapshots and user-supplied facts. It is gitignored and is not required to start the server. If the file is missing, unreadable, or not a JSON object of journal entries, the server logs that and continues with an empty in-memory cache. Clarivate API results are not written there. They go to the metrics store selected by `METRICS_STORE` (memory, file, or Firestore). A Clarivate record already sitting in `metrics-cache.json` is ignored on startup.

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
  ├── DisplayAdCanvas.tsx (display-size mockups + live character counts)
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
  ├── /api/update-journal-metrics (Saves user-supplied data to cache)
  ├── /api/generate-campaign (Gemini 3.8 Flash + deterministic strategy engine)
  ├── /api/compare-stages (Generates AWA, CON, DEC simultaneously)
  ├── /api/cache/* (List, inspect, refresh, and clear cache entries)
  ├── /api/admin/clarivate-metrics/refresh (forces a Journals API re-check)
  ├── Gemini 3.8 Flash SDK (@google/genai)
  ├── URL cache for catalog and user facts (metrics-cache.json)
  └── Clarivate metrics store (memory, file, or Firestore)
```

### Core Technologies
- **Frontend Framework:** React 19 (`react`, `react-dom`) with TypeScript.
- **Styling:** Tailwind CSS v4 (`@tailwindcss/vite`) using modern CSS variable configurations.
- **Icons:** `lucide-react` for iconography.
- **Server:** Express 4.x running in tandem with Vite development middlewares in dev mode, serving pre-built assets in production.
- **AI Engine:** Google `@google/genai` SDK using `gemini-3.8-flash` for ad copy only. Calls set `responseMimeType` to `application/json` and the server `JSON.parse`s `response.text`. No response schema is sent. Gemini is not asked for metric values. If the key is missing, the call fails, or the body is not usable JSON, generation uses the deterministic template engine. A claim guard then strips any number or ranking that is not a trusted fact.
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
- **Layout mockups (`DisplayAdCanvas.tsx`):** "View all" renders these units together:
  1. **Medium Rectangle:** 300 × 250 px
  2. **Square:** 250 × 250 px
  3. **Leaderboard:** 728 × 90 px
  4. **Mobile Banner:** 320 × 50 px
  5. **Landscape:** 728 × 380 px (1.91:1)
  6. **Half Page:** 300 × 600 px
  7. **Native In-Feed Card**
- **HTML5 canvas banner studio (`GoogleDisplayPreview.tsx`):** Landscape 1200×628 (1.91:1), square 1200×1200, medium rectangle 300×250, leaderboard 728×90, and skyscraper 160×600, with a color palette and PNG export.

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
export function countCharacterWidth(text: string, language: 'EN' | 'ZH' | 'auto' = 'auto'): number {
  if (!text) return 0;
  const cjkChars = (text.match(/[\u4e00-\u9fa5\u3400-\u4dbf\u3000-\u303f\uff01-\uffee]/g) || []).length;
  const otherChars = text.length - cjkChars;
  return (cjkChars * 2) + otherChars;
}
```
The `language` argument is accepted and currently unused; width is always counted from the character classes above. The implementation lives in `src/utils/textUtils.ts` (the server keeps a matching copy for template generation).
All headline validation (max 30 width) and description validation (max 90 width) enforce this calculation.

### Language Purity Validation
- **English-Only (`EN`):** Flags any accidental Chinese characters or punctuation.
- **Chinese-Only (`ZH`):** Flags any Latin letter (`a-z` / `A-Z`). Digits and punctuation are allowed. Acronyms such as `SCIE`, `OA`, `APC`, and `IF` are not exempt.
- **Bilingual (`all`):** Pairs English and Chinese headlines side-by-side with appropriate position pinning.
- **1-Click Clean Tool:** `cleanStrayCharacters` sanitizes contaminated strings in real time.

### Automated Policy Auditing (`complianceValidator.ts`)
The audit engine flags compliance risks before campaign launch:
1. **Competitor Trademarks:** Flags `Cell`, `Science`, `PNAS`, `The Lancet`, `NEJM`, `PLOS`, `Elsevier`, `Wiley`, `MDPI`, `Frontiers`, `ACS`, and `IEEE` (`COMPETITOR_TRADEMARKS` in `complianceValidator.ts`).
2. **Unverifiable Superlatives:** Flags terms in `SUPERLATIVES`, including `best`, `fastest`, `#1`, `top-ranked`, `guaranteed`, `highest impact`, `most cited`, `premier`, `leading`, and the Chinese terms `最快`, `最好`, `第一`, `包录用`, and `顶级顶刊`.
3. **Misleading Editorial Claims:** Flags `will be published/accepted`, `guaranteed acceptance`, `accepted in N days`, and the Chinese phrases `保证录用`, `包发表`, and `保过`.
4. **Missing Metric Claims:** Detects ads that claim an Impact Factor when the journal's verified record has `impactFactor: null`.
5. **1-Click Auto-Fix:** Rewrites superlatives into objective editorial facts, removes competitor trademarks, and truncates length overflows.

---

## 8. Google Ads Editor Export Specification

The navbar **Google Ads Editor CSV** action (`downloadGoogleAdsEditorPackage`) downloads two files for the active campaign stage:

1. **`{journal}-{stage}-google-ads-editor.csv`** — one UTF-8 CSV (with BOM) whose rows are the English and Chinese keywords. It does not emit separate responsive-search, negative-keyword, or display-ad files. Columns:

   `Campaign`, `Ad Group`, `Keyword`, `Match Type`, `Max CPC`, `Headline 1`, `Headline 2`, `Headline 3`, `Description 1`, `Description 2`, `Final URL`, `Display URL`, `Fact Provenance`, `Confidence`, `Quality Notes`

   Only the first three headlines and first two descriptions are written. `Max CPC` is left blank. `Fact Provenance`, `Confidence`, and `Quality Notes` are audit columns for the importer to map or ignore. `Confidence` is `0.95` for `clarivate_wos_journals_api`, `0.85` for `user_provided`, `0.80` for `page_sourced`, and `0` otherwise. A row without a trusted impact factor says so and does not print a number.

2. **`{journal}-{stage}-import-instructions.txt`** — a short import guide and fact-audit note, not a fourth CSV.

The same Export menu also downloads a **Markdown campaign brief** (`handleExportBrief` in `App.tsx`). Separately, the targeting panel can download `{journal}-google-keywords.csv` with columns `Language`, `Keyword`, `Match Type`, `Intent`. That file does not include negative keywords.

---

## 9. API Reference

| Endpoint | Method | Payload | Description |
| :--- | :--- | :--- | :--- |
| `/api/fetch-clarivate-facts` | `POST` | `{ "url": string, "forceRefresh"?: boolean, "issn"?: string }` | Resolves the URL through the URL cache, then the Clarivate metrics store when an ISSN is present, then the page-facts client, then the catalog snapshot. A public refresh does not bypass the once-per-day JCR check. Gemini is not asked for metrics. Returns `verificationStatus: 'missing'` if unknown. |
| `/api/update-journal-metrics` | `POST` | `{ "facts": ClarivateJournalMetrics }` | Saves user-supplied or audited journal metrics into persistent cache (`metrics-cache.json`). |
| `/api/generate-campaign` | `POST` | `{ "landingPageUrl": string, "funnelStage": "AWA"\|"CON"\|"DEC", "channels": string[], "outputLanguage": "all"\|"EN"\|"ZH", "customPlaybook"?: string, "userProvidedFacts"?: object }` | Generates search, display, and keyword copy. Rejects with `400` only when `verificationStatus` is `missing`. Untrusted numbers are omitted and stripped by the claim guard. |
| `/api/compare-stages` | `POST` | `{ "landingPageUrl": string, "outputLanguage"?: string }` | Builds AWA, CON, and DEC campaigns with the deterministic template engine. This route does not call Gemini. |
| `/api/cache/list` | `GET` | — | Lists all currently cached journals, access timestamps, and expiration statuses. |
| `/api/cache/journal/:id` | `GET` | — | Inspects cached metric details and TTL expiration timestamps for a specific journal. |
| `/api/cache/refresh/:id` | `POST` | `{ "url"?: string }` | Forces a fresh lookup of the given URL, or the URL already stored on that cache entry. Returns `400` when neither exists. Does not build a URL from the cache id. |
| `/api/cache/clear` | `POST` | — | Flushes in-memory cache and deletes `metrics-cache.json` on disk. |
| `/api/admin/clarivate-metrics/refresh` | `POST` | `{ "issn": string }` | Forces a Journals API lookup for that ISSN and writes the metrics store. This is the admin refresh. PR #4 should gate it with `requireAdmin` from `src/server/auth/guard.ts`, the same middleware used on `/api/cache/refresh` and `/api/cache/clear`. |

---

## 10. Development & Production Instructions

### Prerequisites
- Node.js 20 or newer (CI uses Node.js 22)
- npm

### Environment
Copy `.env.example` to `.env`.

| Variable | Required | What the code does with it |
| :--- | :--- | :--- |
| `GEMINI_API_KEY` | Only for live Gemini calls | Read by `server.ts`. Without it, the process still starts. Journal lookup uses the built-in catalog, and campaign generation uses the deterministic template engine. |
| `CLARIVATE_API_KEY` | Only for live JCR lookups | Read on the server and sent as `X-ApiKey`. If it is missing, the server logs one warning and journal lookups return null. The key is never sent to the browser. |
| `METRICS_STORE` | No | `memory` (default), `file`, or `firestore`. Clarivate metrics use this store. `metrics-cache.json` is not the production store for those records. |
| `FIRESTORE_PROJECT_ID` | When `METRICS_STORE=firestore` and `GOOGLE_CLOUD_PROJECT` is unset | Passed to the Firestore client. Cloud Run's Application Default Credentials supply the identity. |
| `GOOGLE_CLOUD_PROJECT` | Alternative to `FIRESTORE_PROJECT_ID` | Used when `FIRESTORE_PROJECT_ID` is empty. Set automatically on many GCP runtimes. |
| `METRICS_STORE_PATH` | No | File used when `METRICS_STORE=file`. Default `.data/clarivate-metrics.json`. |
| `NODE_ENV` | No | `production` serves the prebuilt `dist/` assets. Any other value, including unset, mounts the Vite dev middleware. |
| `DISABLE_HMR` | No | When `true`, `vite.config.ts` turns off hot module replacement and file watching. |

### Clarivate Journals API, quota, and refresh

The client calls `https://api.clarivate.com/apis/wos-journals/v1`:

1. `GET /journals?q=<ISSN>` resolves a print or electronic ISSN to `hits[].id`.
2. `GET /journals/{id}` reads the ISSN pair, publisher, categories, and `journalCitationReports[]`.
3. `GET /journals/{id}/reports/year/{year}` reads `metrics.impactMetrics` and `ranks.jif[]`.

JIF values arrive as strings and are parsed defensively. Missing fields stay null.

The key is shared with another application (about 5 requests/second, plus a quota). This client starts at most 2 requests/second. HTTP 429 and 5xx responses retry with exponential backoff and jitter, and a `Retry-After` header replaces that wait. Concurrent lookups for the same ISSN share one request. An ISSN that returns no hit is remembered for 10 minutes.

Stored metrics are served without calling the API. A newer JCR year is checked only when the stored year is older than the expected latest release, and at most once per ISSN per UTC day. New JCR data is treated as available on and after 30 June UTC: on 8 October 2026 the expected year is 2025; on 15 January 2026 it is 2024. `POST /api/admin/clarivate-metrics/refresh` with `{ "issn": "0028-0836" }` forces a check. Until PR #4 lands, that route is not authenticated; the handler is marked for `requireAdmin`.

Ad copy and exports cite a Clarivate value as `JIF 56.1 (Clarivate JCR 2025)`. The word Clarivate is allowed only when `provenanceSource` is `clarivate_wos_journals_api`. A hand-edited fact is forced to `user_provided` with `isVerifiedClarivate` false.

Live check, after `CLARIVATE_API_KEY` is set in the environment (the script prints parsed metrics and does not print the key):

```bash
npm run verify:clarivate -- 0028-0836
```

### Firestore on Cloud Run

1. Enable the Cloud Firestore API on the GCP project.
2. Grant the Cloud Run service account `roles/datastore.user`.
3. Set `METRICS_STORE=firestore`. Set `FIRESTORE_PROJECT_ID` if `GOOGLE_CLOUD_PROJECT` is not already present. The client uses Application Default Credentials; do not ship a key file in the image.
4. Put `CLARIVATE_API_KEY` in Secret Manager (or the Cloud Run environment) and do not prefix it with `VITE_`.

Documents:

- `wosJournalMetrics/{issn}_{jcrYear}` — metrics plus `source`, `jcrYear`, and `retrievedAt`
- `wosIssnMappings/{issn}` — Clarivate journal id, latest JCR year, and the last year-check time

Print and electronic ISSNs are both indexed. Tests use the in-memory store. A Firestore emulator run is optional and only executes when `FIRESTORE_EMULATOR_HOST` is set. CI does not need the API key or Google credentials.

The server always listens on **port 3000** (`http://0.0.0.0:3000`). `PORT` is not read. `.env.example` still lists `APP_URL` for hosts that inject it; this application does not read `APP_URL`.

### Installation
```bash
npm ci
```
`npm ci` installs the committed lockfile. A clean install does not need `--legacy-peer-deps`.

### Tests
```bash
npm test
```
Runs `tests/unit-tests.ts` and `tests/clarivate.test.ts` with `tsx` (character width, language purity, compliance audit, the CSV export, metrics-cache loading, the Clarivate client, and the in-memory metrics store). CI does not call Clarivate or Firestore.

### Type Checking
```bash
npm run lint
```
Runs `tsc --noEmit`.

### Development Server
```bash
npm run dev
```
Listens on `http://0.0.0.0:3000` with Vite middleware for the SPA and the Express API routes.

### Production
```bash
npm run build
NODE_ENV=production npm start
```

---

## 11. Ethical & Academic Integrity Statement

Marketing Content Generation Engine is designed to uphold the highest standards of scientific publishing ethics. It does not support or generate deceptive claims, artificial review acceleration guarantees, or ungrounded promotional hype. All campaigns generated through this engine are grounded in verified journal indexing criteria and adhere to the **Committee on Publication Ethics (COPE)** guidelines and **Google Ads Advertising Policies**.
