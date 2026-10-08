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
│                            │ The HTTP client is unwired in this build. │
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

`metrics-cache.json` is a runtime file. It is gitignored and is not required to start the server. If the file is missing, unreadable, or not a JSON object of journal entries, the server logs that and continues with an empty in-memory cache. The first successful catalog, user, or lookup write creates the file.

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
                           │  HTTP / REST (JSON, cookie session, CSRF header)
                           ▼
  SERVER (Express + Node.js via tsx server.ts)
  ├── Auth gate on every /api route (server session, CSRF, @springernature.com)
  │   ├── magic link (current)  |  generic OIDC (planned)  |  Google OIDC
  ├── /api/fetch-clarivate-facts (Cached lookup with Clarivate JCR fallback)
  ├── /api/update-journal-metrics (Known-field schema, audit of who changed what)
  ├── /api/generate-campaign (Gemini 3.8 Flash + deterministic strategy engine)
  ├── /api/compare-stages (Generates AWA, CON, DEC simultaneously)
  ├── /api/cache/* (List and inspect for signed-in users; refresh and clear are admin-only)
  ├── Gemini 3.8 Flash SDK (@google/genai)
  └── Persistent File System Storage (metrics-cache.json, metrics-audit.jsonl)
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

Every `/api` route except the sign-in endpoints below requires a server session. `POST`, `PUT`, `PATCH`, and `DELETE` also require the `X-CSRF-Token` header returned by `GET /api/auth/session`. Unauthenticated calls receive **401**. Authenticated calls that omit the CSRF token receive **403**. JSON bodies are limited to **1mb**.

| Endpoint | Method | Auth | Payload | Description |
| :--- | :--- | :--- | :--- | :--- |
| `/api/auth/session` | `GET` | Public | — | Returns the current user (or `authenticated: false`), a CSRF token, the active provider, and whether the dev bypass is enabled. Sets the `sn_session` cookie. |
| `/api/auth/login` | `GET` | Public | — | Starts Google or generic OIDC (authorization code + PKCE). Not used for magic links. |
| `/api/auth/callback` | `GET` | Public | — | OIDC redirect URI. Verifies the ID token, then the email domain. |
| `/api/auth/magic-link/request` | `POST` | Public + CSRF | `{ "email": string }` | Sends a one-time link when `AUTH_PROVIDER=magic_link` and the address is allowed. |
| `/api/auth/magic-link/verify` | `POST` | Public + CSRF | `{ "token": string }` | Confirms a magic link and creates a session. The link is opened from `#magic=` in the browser; the token is not consumed by a GET. |
| `/api/auth/dev-login` | `POST` | Public + CSRF | `{}` | Development-only sign-in. **404** unless `NODE_ENV=development` and `AUTH_DEV_BYPASS=true`. |
| `/api/auth/logout` | `POST` | Public + CSRF | `{}` | Destroys the server session. |
| `/api/fetch-clarivate-facts` | `POST` | User | `{ "url": string, "forceRefresh"?: boolean, "issn"?: string }` | Resolves the URL through cache, then `lookupMetricsByIssn` when an ISSN is present, then the page-facts client, then the catalog snapshot. Gemini is not asked for metrics. Returns `verificationStatus: 'missing'` if unknown. |
| `/api/update-journal-metrics` | `POST` | User | `{ "facts": known fields only }` | Saves user-supplied metrics. Unknown fields are **400**. The server forces `verificationStatus` and `provenanceSource` to `user_provided` and `isVerifiedClarivate` to `false`. |
| `/api/generate-campaign` | `POST` | User | `{ "landingPageUrl": string, "funnelStage": "AWA"\|"CON"\|"DEC", "channels": string[], "outputLanguage": "all"\|"EN"\|"ZH", "customPlaybook"?: string, "userProvidedFacts"?: object }` | Generates search, display, and keyword copy. Browser-supplied facts are sanitized the same way as a metrics save, so a hand edit cannot keep a Clarivate label. Rejects with `400` when `verificationStatus` is `missing`. Untrusted numbers are omitted and stripped by the claim guard. |
| `/api/compare-stages` | `POST` | User | `{ "landingPageUrl": string, "outputLanguage"?: string }` | Builds AWA, CON, and DEC campaigns with the deterministic template engine. This route does not call Gemini. |
| `/api/cache/list` | `GET` | User | — | Lists all currently cached journals, access timestamps, and expiration statuses. |
| `/api/cache/journal/:id` | `GET` | User | — | Inspects cached metric details, TTL, and the audit trail stored on that journal. |
| `/api/cache/refresh/:id` | `POST` | **Admin** | `{ "url"?: string }` | Forces a fresh lookup of the given URL, or the URL already stored on that cache entry. Returns `400` when neither exists. Does not build a URL from the cache id. |
| `/api/cache/clear` | `POST` | **Admin** | — | Flushes the in-memory cache and deletes `metrics-cache.json`. |

Admin means the signed-in email is listed in `AUTH_ADMIN_EMAILS`. Anyone else receives **403**.

`POST /api/update-journal-metrics` accepts `url`, `journalName`, `publisher`, `impactFactor`, `fiveYearImpactFactor`, `jcrQuartile`, `casZone`, `firstDecisionDays`, `indexing`, `openAccessType`, `apcUsd`, `chinaWaiverAvailable`, `aimsAndScopeSummary`, `primaryDiscipline`, `sourceAttribution`, `reportingYear`, `jcrYear`, `verificationStatus`, `provenanceSource`, `isVerifiedClarivate`, `missingFields`, `retrievedAt`, `wosJournalId`, `issn`, `eIssn`, `jifRanks`, `immediacyIndex`, `journalCitationIndicator`, and `catalogDataYear`. Known statuses are `user_provided`, `page_sourced`, `clarivate_api`, `catalog_snapshot`, and `missing`. Known provenance values are `user_provided`, `page_sourced`, `clarivate_wos_journals_api`, `catalog_snapshot`, and `missing`. `jcrYear` is required and must be an integer from 1900 to 2100. Whatever the client sends for status or provenance, the stored record is `verificationStatus: user_provided`, `provenanceSource: user_provided`, and `isVerifiedClarivate: false`. `source` and `sourceAttribution` are `Manually entered (unverified)` and never include the editor's email. `reportingYear` is `JCR <jcrYear>`, and the metric `year` is that JCR year. The editor's email is kept only on the audit event and `lastModifiedBy`. The same sanitiser runs on `userProvidedFacts` in `POST /api/generate-campaign`. Each save appends a line to `metrics-audit.jsonl`.

---

## 10. Authentication

Sign-in is selected with one environment variable, `AUTH_PROVIDER`. The documented default is `magic_link`. Generic OIDC is the planned upgrade once Springer Nature IT registers the app. The session layer, CSRF check, and `@springernature.com` rule are the same for every provider. The browser only ever holds an `HttpOnly` session id (`sn_session`, `SameSite=Lax`, `Secure` when `APP_URL` is https in production). The server stores the user, the OAuth transaction, and the CSRF token. The SPA sends that CSRF token as `X-CSRF-Token` on every state-changing request.

Route matching is case-sensitive. The API guard also normalises the path (percent-decoded, lowercased) and is mounted both globally and on `/api`, so `/API/...` and `/%41PI/...` require a session and cannot reach a handler.

### Single instance until a shared store exists

Sessions, magic-link tokens, and OAuth state go through `SessionStore`, `MagicLinkStore`, and `OauthStateStore` in `src/server/auth/stores.ts`. The metrics audit log goes through `AuditLogStore` in `src/server/auditLog.ts`. The defaults are in-memory maps and a local JSONL file (`metrics-audit.jsonl`). Those are what run today. A shared durable store — the database planned for the Clarivate step — can be plugged in later with `setSessionStore`, `setMagicLinkStore`, `setOauthStateStore`, and `setAuditLogStore` without changing the sign-in flow.

Until that store is in place, Cloud Run must be pinned to a single instance (`max-instances=1`). A second instance will not see sessions, magic links, or OAuth state created on the first. A restart or a new revision logs everyone out and drops in-flight magic links and OAuth sign-ins.

The email domain check runs on the server after the provider has proven the address:

- The address must contain one `@`, be ASCII, and use a real hostname (no trailing dot, no empty labels).
- The domain must equal an allowed apex, case-insensitively. The default apex is `springernature.com`.
- A subdomain such as `staff.springernature.com` is rejected unless that full host is listed in `AUTH_ALLOWED_EMAIL_SUBDOMAINS` **and** it is actually under an allowed apex.
- Lookalikes fail. `springernature.com.evil.com`, `notspringernature.com`, and `springernature.co` are not the apex and are not subdomains of it.
- Google and generic OIDC also require `email_verified` to be true. If an `hd` claim is present, that host must pass the same rule. A missing `hd` does not skip the email check.

### Which option to choose

| | Google sign-in | Email magic link | Generic OIDC (Springer Nature Okta) |
| :--- | :--- | :--- | :--- |
| Setup effort | Medium. Create an OAuth client and set the redirect URI. | Low for the app. Production still needs a mail transport. | Higher. An IdP admin registers the app, redirect URI, and email claims. |
| Who must be involved | Someone who can create a Google Cloud OAuth client. A Workspace admin if you want the account chooser limited to the company domain (`hd`). | The app owner. A mail admin if you use the company SMTP relay or a transactional provider. | Corporate IT / identity admin, and usually security review. |
| Security | Strong if every user has a Workspace account and Google enforces MFA. The app still checks the verified email and `hd`. | The mailbox is the authenticator. Safe enough when corporate mail already has MFA, the link expires in 15 minutes, and it is single-use. Weaker than SSO for offboarding: access lasts until the session expires unless you revoke mail. | Best fit for an employee tool. MFA, device policy, and leaver access are enforced at the IdP. The app still refuses any token whose verified email is outside the domain. |
| Cost and dependencies | Google OAuth client is free. No mail vendor. Depends on Google being reachable. | No IdP license. Production needs SMTP or an HTTPS email webhook (`smtp` or `http` transport). The `console` transport only prints the link and is refused in production. | Uses the IdP the company already pays for. No extra mail vendor. |
| User experience | One redirect, if the person has a Google account. | Type the work email, open the message, confirm in the browser. Slower, works wherever mail works. | One redirect through company SSO. Familiar for staff. |
| Mainland China | Weak choice. `accounts.google.com` is often blocked, so people in mainland China may be unable to sign in without a VPN. | Strongest reach of the three when company mail is reachable from China. The link itself is served by this app, not by Google. | Company SSO is Okta at `https://auth.springernature.com`. IT should confirm that host is reachable from a China office network before relying on it. |

**Decision:** use **magic links** now (`AUTH_PROVIDER=magic_link`). That is the documented default in `.env.example` and in the production instructions below.

**Planned upgrade:** switch to **generic OIDC against Springer Nature Okta** (`https://auth.springernature.com`, standard OIDC discovery and the authorization code flow) once IT registers the app. IT already owns MFA and account closure, and there is no mail vendor to keep. Keep the app-side domain check on after that switch. Do not make Google the default while a meaningful set of users are in mainland China.

The dev bypass is not a fourth production option. It is registered only when `NODE_ENV` is exactly `development` and `AUTH_DEV_BYPASS` is exactly `true`. Any other environment, including production, responds **404** on `POST /api/auth/dev-login`.

### Shared environment

| Variable | Required | Purpose |
| :--- | :--- | :--- |
| `AUTH_PROVIDER` | Yes in production | `magic_link` (current default), `oidc` (planned upgrade), or `google`. |
| `AUTH_SESSION_SECRET` | Yes in production | At least 32 characters. Signs the session cookie. In local development an ephemeral secret is generated if this is unset. |
| `APP_URL` | Yes in production | Public origin with no trailing slash, for example `https://mcge.example.com`. Used for OAuth redirects and magic links. Must be `https` except for localhost. Outside production, if this is unset, links use `http://localhost:<port>` and `X-Forwarded-Host` is ignored. |
| `AUTH_ALLOWED_EMAIL_DOMAINS` | No | Comma-separated apex domains. Default `springernature.com`. |
| `AUTH_ALLOWED_EMAIL_SUBDOMAINS` | No | Comma-separated full hosts that are subdomains of an allowed apex. Default empty (subdomains rejected). |
| `AUTH_ADMIN_EMAILS` | For cache admin | Comma-separated emails allowed to call cache clear and cache refresh. |
| `AUTH_SESSION_TTL_SECONDS` | No | Session lifetime. Default 28800 (8 hours). |
| `TRUST_PROXY` | Cloud Run | Set to `true`. Otherwise the magic-link per-IP limit treats every user as one address. |
| `NODE_ENV` | Production | `production` serves `dist/` and refuses the dev bypass. |
| `AUTH_DEV_BYPASS` | Local only | `true` shows "Continue as development user". Ignored unless `NODE_ENV=development`. |
| `AUTH_DEV_USER_EMAIL` | No | Default `dev.user@springernature.com`. Must pass the domain check. |
| `AUTH_DEV_USER_NAME` | No | Display name for the dev user. |

Redirect URI for both OAuth providers: `{APP_URL}/api/auth/callback`.

### Google sign-in

1. In [Google Cloud Console](https://console.cloud.google.com/apis/credentials), create an OAuth client of type **Web application**.
2. Add authorized redirect URI `{APP_URL}/api/auth/callback`.
3. On the OAuth consent screen, add the scopes `openid`, `email`, and `profile` (the app requests those). If the app is internal to Workspace, a Workspace admin can mark it internal so only company accounts see it.
4. Optionally ask the Workspace admin to confirm the `springernature.com` hosted domain. The app sends `hd=springernature.com` as an account-chooser hint. The security check is still the verified email plus `hd` when Google sends it.
5. Set:

```bash
AUTH_PROVIDER=google
AUTH_SESSION_SECRET=replace-with-a-random-string-at-least-32-chars
APP_URL=https://mcge.example.com
GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your-client-secret
AUTH_ADMIN_EMAILS=you@springernature.com
```

`GOOGLE_ISSUER` defaults to `https://accounts.google.com`. Leave it unset in production.

### Magic links (current provider)

This is what production runs today. The exact production checklist (mail service, `APP_URL`, session secret) is in [Production](#production).

1. Choose a transport: `smtp` (company relay or a provider such as Amazon SES) or `http` (your own mail webhook). `console` prints the link on the server and is rejected when `NODE_ENV=production`.
2. Set:

```bash
AUTH_PROVIDER=magic_link
AUTH_SESSION_SECRET=replace-with-a-random-string-at-least-32-chars
APP_URL=https://mcge.example.com
AUTH_EMAIL_TRANSPORT=smtp
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_USER=apikey-or-mailbox
SMTP_PASS=secret
SMTP_FROM="Marketing Content Engine <noreply@springernature.com>"
# SMTP_SECURE=true when using port 465
AUTH_ADMIN_EMAILS=you@springernature.com
```

HTTP transport instead of SMTP:

```bash
AUTH_EMAIL_TRANSPORT=http
AUTH_EMAIL_WEBHOOK_URL=https://mail.internal.example/v1/send
AUTH_EMAIL_WEBHOOK_BEARER=optional-token
```

The webhook receives JSON `{ "to", "subject", "text", "html" }`. Add another transport in code with `registerEmailSender(name, factory)` from `src/server/auth/email.ts`.

Local use without a mail server:

```bash
NODE_ENV=development
AUTH_PROVIDER=magic_link
AUTH_EMAIL_TRANSPORT=console
```

The link is printed in the server log. It looks like `http://localhost:3000/#magic=...`. Opening it shows a confirm button so inbox scanners that only GET the URL cannot consume the token. `MAGIC_LINK_TTL_SECONDS` defaults to 900. Requests are limited to 5 per email address and 5 per client IP in a 15-minute window. Outside production the client IP is the socket address, not `X-Forwarded-For`.

### Generic OIDC (planned upgrade: Springer Nature Okta)

Company SSO is Okta at `https://auth.springernature.com`. It uses standard OIDC discovery and the authorization code flow. Use this after Springer Nature IT registers the app. Until then leave `AUTH_PROVIDER=magic_link`.

1. Ask IT to register a confidential web app. Redirect URI: `{APP_URL}/api/auth/callback`.
2. Allow the authorization code flow and PKCE (`S256`). Token endpoint auth method: **client secret basic**.
3. Request scopes `openid email profile`. The ID token must include `email` and `email_verified` (and `name` if you want it on the session). The app rejects tokens that omit `email` or `email_verified`.
4. Set `OIDC_ISSUER` to `https://auth.springernature.com` with no trailing slash. Discovery is `https://auth.springernature.com/.well-known/openid-configuration`. The issuer must match that document.
5. Set:

```bash
AUTH_PROVIDER=oidc
AUTH_SESSION_SECRET=replace-with-a-random-string-at-least-32-chars
APP_URL=https://mcge.example.com
OIDC_ISSUER=https://auth.springernature.com
OIDC_CLIENT_ID=application-client-id
OIDC_CLIENT_SECRET=client-secret
OIDC_SCOPES=openid email profile
AUTH_ADMIN_EMAILS=you@springernature.com
```

The issuer must be reachable on `https` in production.

### Local development bypass

```bash
NODE_ENV=development
AUTH_DEV_BYPASS=true
AUTH_PROVIDER=magic_link
AUTH_EMAIL_TRANSPORT=console
AUTH_DEV_USER_EMAIL=dev.user@springernature.com
```

The sign-in page shows **Continue as development user**. That button calls `POST /api/auth/dev-login`. It does not exist as a working route in production, test, or when the flag is anything other than `true`.

---

## 11. Development & Production Instructions

### Prerequisites
- Node.js 20 or newer (CI uses Node.js 22)
- npm

### Environment
Copy `.env.example` to `.env`.

| Variable | Required | What the code does with it |
| :--- | :--- | :--- |
| `GEMINI_API_KEY` | Only for live Gemini calls | Read by `server.ts`. Without it, the process still starts. Journal lookup uses the built-in catalog, and campaign generation uses the deterministic template engine. |
| `NODE_ENV` | Production | `production` serves the prebuilt `dist/` assets, requires auth configuration, and disables the dev bypass. Any other value mounts the Vite dev middleware. |
| `APP_URL` | Production | Public https origin, no trailing slash. Magic links are `{APP_URL}/#magic=...`. |
| `AUTH_PROVIDER` | Production | `magic_link`. That is the current default. `oidc` is the planned upgrade after IT registers the app. |
| `AUTH_SESSION_SECRET` | Production | At least 32 characters. Signs the session cookie. |
| `AUTH_EMAIL_TRANSPORT` and the mail variables | Production, with magic links | The email-sending service. See Production below. `console` is refused. |
| `DISABLE_HMR` | No | When `true`, `vite.config.ts` turns off hot module replacement and file watching. |

The server always listens on **port 3000** (`http://0.0.0.0:3000`). `PORT` is not read.

### Installation
```bash
npm ci
```
`npm ci` installs the committed lockfile. A clean install does not need `--legacy-peer-deps`.

### Tests
```bash
npm test
```
Runs `tests/unit-tests.ts` (character width, language purity, compliance audit, the 15-column CSV export, and metrics-cache loading) and the auth suite (domain checks, 401s, provider callbacks against a mock issuer, dev-bypass guards, and journal-metric validation).

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

`AUTH_PROVIDER=magic_link` is the default. Generic OIDC stays available for the upgrade once Springer Nature IT registers the app.

Magic links in production need three things:

1. **An email-sending service.** Set `AUTH_EMAIL_TRANSPORT` to `smtp` or `http`. `console` is refused when `NODE_ENV=production`.

   SMTP:

   | Variable | Required | Purpose |
   | :--- | :--- | :--- |
   | `AUTH_EMAIL_TRANSPORT` | Yes | `smtp` |
   | `SMTP_HOST` | Yes | Relay hostname. |
   | `SMTP_FROM` | Yes | From address, for example `Marketing Content Engine <noreply@springernature.com>`. |
   | `SMTP_PORT` | No | Defaults to `587`. |
   | `SMTP_USER` | When the relay authenticates | Username or API key. |
   | `SMTP_PASS` | When the relay authenticates | Password or API secret. |
   | `SMTP_SECURE` | No | `true` for implicit TLS. Port `465` is secure even when this is unset. |

   HTTPS webhook instead of SMTP:

   | Variable | Required | Purpose |
   | :--- | :--- | :--- |
   | `AUTH_EMAIL_TRANSPORT` | Yes | `http` |
   | `AUTH_EMAIL_WEBHOOK_URL` | Yes | Endpoint that accepts JSON `{ "to", "subject", "text", "html" }`. |
   | `AUTH_EMAIL_WEBHOOK_BEARER` | No | Bearer token sent with the webhook request. |

2. **`APP_URL`.** Public origin with no trailing slash, for example `https://mcge.example.com`. The link in the email is `{APP_URL}/#magic=...`. It must be `https`, except `http` on localhost.

3. **`AUTH_SESSION_SECRET`.** At least 32 characters. It signs the `sn_session` cookie.

```bash
AUTH_PROVIDER=magic_link
AUTH_SESSION_SECRET=replace-with-a-random-string-at-least-32-chars
APP_URL=https://mcge.example.com
AUTH_EMAIL_TRANSPORT=smtp
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_USER=apikey-or-mailbox
SMTP_PASS=secret
SMTP_FROM="Marketing Content Engine <noreply@springernature.com>"
TRUST_PROXY=true
```

On Cloud Run, `TRUST_PROXY=true` is required. Cloud Run terminates TLS and sends the client address in `X-Forwarded-For`. The per-IP magic-link limit reads that header only when `TRUST_PROXY=true`. Without it, every user shares one address, and five requests lock the service for everyone.

Cloud Run must stay at `max-instances=1` until a shared session store is configured. A restart logs users out.

```bash
npm run build
NODE_ENV=production npm start
```

---

## 12. Ethical & Academic Integrity Statement

Marketing Content Generation Engine is designed to uphold the highest standards of scientific publishing ethics. It does not support or generate deceptive claims, artificial review acceleration guarantees, or ungrounded promotional hype. All campaigns generated through this engine are grounded in verified journal indexing criteria and adhere to the **Committee on Publication Ethics (COPE)** guidelines and **Google Ads Advertising Policies**.
