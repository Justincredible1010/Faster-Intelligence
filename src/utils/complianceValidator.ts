import {
  GeneratedAdCampaign,
  ComplianceIssue,
  ComplianceValidationReport,
  ClarivateJournalMetrics,
} from '../types';
import { countCharacterWidth, smartClampWithWidth } from './textUtils';
import { metricsFromClarivateWos, trustedImpactFactor } from './metricClaims';

// Common competitor academic journal trademarks to flag in ad copy
export const COMPETITOR_TRADEMARKS = [
  { name: 'Cell', pattern: /\bcell\b/i },
  { name: 'Science', pattern: /\bscience\b/i }, // note: allow 'sciences', 'scientific'
  { name: 'PNAS', pattern: /\bpnas\b/i },
  { name: 'The Lancet', pattern: /\b(the\s+)?lancet\b/i },
  { name: 'NEJM', pattern: /\bnejm\b/i },
  { name: 'PLOS', pattern: /\bplos(\s+one)?\b/i },
  { name: 'Elsevier', pattern: /\belsevier\b/i },
  { name: 'Wiley', pattern: /\bwiley\b/i },
  { name: 'MDPI', pattern: /\bmdpi\b/i },
  { name: 'Frontiers', pattern: /\bfrontiers\b/i },
  { name: 'ACS', pattern: /\bacs\b/i },
  { name: 'IEEE', pattern: /\bieee\b/i },
];

// Unverifiable superlatives prohibited by Google Ads policies unless source-verified
export const SUPERLATIVES = [
  { term: 'best', pattern: /\b(the\s+)?best\b/i, fix: 'established' },
  { term: 'fastest', pattern: /\bfastest\b/i, fix: 'efficient' },
  { term: '#1', pattern: /#1|no\.?\s*1/i, fix: 'leading' },
  { term: 'top-ranked', pattern: /\btop[- ]ranked\b/i, fix: 'high-impact' },
  { term: 'guaranteed', pattern: /\bguarantee(d)?\b/i, fix: 'peer-reviewed' },
  { term: 'highest impact', pattern: /\bhighest\s+impact\b/i, fix: 'high-impact' },
  { term: 'most cited', pattern: /\bmost\s+cited\b/i, fix: 'highly-cited' },
  { term: 'premier', pattern: /\bpremier\b/i, fix: 'distinguished' },
  { term: 'leading', pattern: /\bleading\b/i, fix: 'recognized' },
  // Chinese Superlatives
  { term: '最快', pattern: /最快/i, fix: '审稿高效' },
  { term: '最好', pattern: /最好/i, fix: '优质' },
  { term: '第一', pattern: /第一|首屈一指/i, fix: '知名' },
  { term: '包录用', pattern: /包录用|100%录用/i, fix: '严格同行评审' },
  { term: '顶级', pattern: /顶级顶刊/i, fix: '高水平' },
];

// Misleading promises prohibited in scientific ad copy
export const MISLEADING_PATTERNS = [
  {
    pattern: /\bwill\s+be\s+(published|accepted)\b/i,
    issue: 'Guaranteeing publication or acceptance violates Google Ads misleading content policy and academic ethics.',
    fix: 'is considered for publication',
  },
  {
    pattern: /\b(100%|guaranteed)\s+acceptance\b/i,
    issue: 'Academic peer review never guarantees acceptance.',
    fix: 'rigorous peer review',
  },
  {
    pattern: /accepted\s+in\s+\d+\s+days/i,
    issue: 'First decision time cannot be stated as acceptance or publication time.',
    fix: 'first editorial decision in standard turnaround',
  },
  {
    pattern: /保证录用|包发表|保过/i,
    issue: '违反学术伦理及广告合规原则，禁止承诺任何包录用结果。',
    fix: '经过国际同行评审',
  },
];

export function runComplianceAudit(
  campaign: GeneratedAdCampaign,
  facts?: ClarivateJournalMetrics
): ComplianceValidationReport {
  const issues: ComplianceIssue[] = [];
  const currentFacts = facts || campaign.clarivateFacts;
  const journalName = currentFacts?.journalName || '';
  const currentYear = new Date().getFullYear();

  // Stale fact audit
  if (currentFacts?.reportingYear) {
    const yearMatch = currentFacts.reportingYear.match(/\b(20\d{2})\b/);
    if (yearMatch) {
      const year = parseInt(yearMatch[1], 10);
      if (year < currentYear - 1) {
        issues.push({
          id: `fact-stale-year`,
          type: 'warning',
          category: 'stale_fact',
          message:
            metricsFromClarivateWos(currentFacts)
              ? `Impact Factor is from ${year}, consider refreshing metrics from the latest Clarivate JCR release.`
              : `Record year ${year} is outside the current release window. This record did not come from the Clarivate API.`,
          targetText: currentFacts.reportingYear,
          fieldLocation: 'Journal Reporting Year',
        });
      }
    }
  }

  // 1. Audit Search Headlines
  if (campaign.searchAds?.headlines) {
    campaign.searchAds.headlines.forEach((h, idx) => {
      const location = `Search Headline #${idx + 1} ("${h.text}")`;

      // Character width check (30 width max)
      const width = countCharacterWidth(h.text);
      if (width > 30) {
        issues.push({
          id: `hl-width-${idx}`,
          type: 'error',
          category: 'char_limit',
          message: `Headline exceeds Google Ads 30 visual width limit (current: ${width}).`,
          targetText: h.text,
          suggestedFix: smartClampWithWidth(h.text, 30),
          fieldLocation: location,
        });
      }

      // Missing fact check: mentions IF without a trusted impact factor
      if (/\b(if|impact\s+factor)\b/i.test(h.text) || /影响因子/.test(h.text)) {
        if (trustedImpactFactor(currentFacts) == null) {
          issues.push({
            id: `hl-missing-if-${idx}`,
            type: 'error',
            category: 'missing_fact',
            message: 'Headline mentions Impact Factor but metric is missing. Remove or verify metric in Step 1.',
            targetText: h.text,
            suggestedFix: h.text.replace(/\b(if|impact\s+factor)\s*[\d.]+/i, 'Peer-Reviewed Quality').replace(/影响因子[\d.]+/i, '同行评议'),
            fieldLocation: location,
          });
        }
      }

      // Clarivate may be named only when the value came from the Clarivate API
      if (!metricsFromClarivateWos(currentFacts) && /\bclarivate\b/i.test(h.text)) {
        issues.push({
          id: `hl-source-mismatch-${idx}`,
          type: 'warning',
          category: 'source_mismatch',
          message: 'Headline cites Clarivate, but this record did not come from the Clarivate API.',
          targetText: h.text,
          suggestedFix: h.text.replace(/\bclarivate\b/i, 'Indexed'),
          fieldLocation: location,
        });
      }

      // Trademark check
      for (const tm of COMPETITOR_TRADEMARKS) {
        if (journalName.toLowerCase().includes(tm.name.toLowerCase())) continue;
        if (tm.name === 'Science' && /\b(sciences|scientific)\b/i.test(h.text)) continue;

        if (tm.pattern.test(h.text)) {
          issues.push({
            id: `hl-tm-${idx}-${tm.name}`,
            type: 'warning',
            category: 'trademark',
            message: `Mentions competitor trademark "${tm.name}". Competitor trademarks in ad copy trigger Google Ads policy review.`,
            targetText: h.text,
            suggestedFix: h.text.replace(tm.pattern, journalName || 'our journal'),
            fieldLocation: location,
          });
        }
      }

      // Superlatives check
      for (const sup of SUPERLATIVES) {
        if (sup.pattern.test(h.text)) {
          if (sup.term === 'top-ranked' && currentFacts?.casZone?.includes('1区')) continue;
          issues.push({
            id: `hl-sup-${idx}-${sup.term}`,
            type: 'error',
            category: 'superlative',
            message: `Contains unverified superlative "${sup.term}". Google Ads requires verifiable third-party documentation for superlative claims.`,
            targetText: h.text,
            suggestedFix: h.text.replace(sup.pattern, sup.fix),
            fieldLocation: location,
          });
        }
      }

      // Misleading claims check
      for (const mis of MISLEADING_PATTERNS) {
        if (mis.pattern.test(h.text)) {
          issues.push({
            id: `hl-mis-${idx}`,
            type: 'error',
            category: 'misleading_claim',
            message: mis.issue,
            targetText: h.text,
            suggestedFix: h.text.replace(mis.pattern, mis.fix),
            fieldLocation: location,
          });
        }
      }
    });
  }

  // 2. Audit Search Descriptions
  if (campaign.searchAds?.descriptions) {
    campaign.searchAds.descriptions.forEach((d, idx) => {
      const location = `Search Description #${idx + 1}`;
      const width = countCharacterWidth(d.text);
      if (width > 90) {
        issues.push({
          id: `desc-width-${idx}`,
          type: 'error',
          category: 'char_limit',
          message: `Description exceeds Google Ads 90 visual width limit (current: ${width}).`,
          targetText: d.text,
          suggestedFix: smartClampWithWidth(d.text, 90),
          fieldLocation: location,
        });
      }

      // Missing fact check
      if (/\b(if|impact\s+factor)\b/i.test(d.text) || /影响因子/.test(d.text)) {
        if (trustedImpactFactor(currentFacts) == null) {
          issues.push({
            id: `desc-missing-if-${idx}`,
            type: 'error',
            category: 'missing_fact',
            message: 'Description mentions Impact Factor but metric is missing. Verify metric or remove claim.',
            targetText: d.text,
            suggestedFix: d.text.replace(/\b(clarivate\s+)?if\s+[\d.]+/i, 'peer-reviewed research'),
            fieldLocation: location,
          });
        }
      }

      for (const mis of MISLEADING_PATTERNS) {
        if (mis.pattern.test(d.text)) {
          issues.push({
            id: `desc-mis-${idx}`,
            type: 'error',
            category: 'misleading_claim',
            message: mis.issue,
            targetText: d.text,
            suggestedFix: d.text.replace(mis.pattern, mis.fix),
            fieldLocation: location,
          });
        }
      }

      // Funding compliance check
      if (/\b(nsfc|funding\s+compliant)\b/i.test(d.text) && !currentFacts?.chinaWaiverAvailable) {
        issues.push({
          id: `desc-fund-${idx}`,
          type: 'warning',
          category: 'funding_claim',
          message: `Mentions specific funding compliance without verified institutional waiver status.`,
          targetText: d.text,
          suggestedFix: d.text.replace(/\bnsfc\s+compliant\b/i, 'open access options available'),
          fieldLocation: location,
        });
      }
    });
  }

  // 3. Audit Display Ads
  if (campaign.displayAds) {
    const d = campaign.displayAds;
    if (countCharacterWidth(d.shortHeadline) > 30) {
      issues.push({
        id: 'display-sh-width',
        type: 'error',
        category: 'char_limit',
        message: 'Display short headline exceeds 30 visual width.',
        targetText: d.shortHeadline,
        suggestedFix: smartClampWithWidth(d.shortHeadline, 30),
        fieldLocation: 'Display Short Headline',
      });
    }

    if (countCharacterWidth(d.longHeadline) > 90) {
      issues.push({
        id: 'display-lh-width',
        type: 'error',
        category: 'char_limit',
        message: 'Display long headline exceeds 90 visual width.',
        targetText: d.longHeadline,
        suggestedFix: smartClampWithWidth(d.longHeadline, 90),
        fieldLocation: 'Display Long Headline',
      });
    }

    if (countCharacterWidth(d.description) > 90) {
      issues.push({
        id: 'display-desc-width',
        type: 'error',
        category: 'char_limit',
        message: 'Display description exceeds 90 visual width.',
        targetText: d.description,
        suggestedFix: smartClampWithWidth(d.description, 90),
        fieldLocation: 'Display Description',
      });
    }
  }

  // 4. Audit Keywords for Competitor Trademarks
  if (campaign.keywords?.englishSearchKeywords) {
    campaign.keywords.englishSearchKeywords.forEach((kw, idx) => {
      for (const tm of COMPETITOR_TRADEMARKS) {
        if (journalName.toLowerCase().includes(tm.name.toLowerCase())) continue;
        if (tm.name === 'Science' && /\b(sciences|scientific)\b/i.test(kw.keyword)) continue;

        if (tm.pattern.test(kw.keyword)) {
          issues.push({
            id: `kw-tm-${idx}-${tm.name}`,
            type: 'warning',
            category: 'trademark',
            message: `Keyword includes competitor trademark "${tm.name}". Allowed in Google Search bids, but ensure ad copy does not claim affiliation.`,
            targetText: kw.keyword,
            fieldLocation: `Search Keyword #${idx + 1} (${kw.keyword})`,
          });
        }
      }
    });
  }

  const errorsCount = issues.filter((i) => i.type === 'error').length;
  const warningsCount = issues.filter((i) => i.type === 'warning').length;

  return {
    status: errorsCount > 0 ? 'has_errors' : warningsCount > 0 ? 'has_warnings' : 'clean',
    errorsCount,
    warningsCount,
    issues,
    checkedAt: new Date().toISOString(),
  };
}

export function autoFixComplianceIssues(campaign: GeneratedAdCampaign): GeneratedAdCampaign {
  const report = runComplianceAudit(campaign);
  let updatedCampaign = JSON.parse(JSON.stringify(campaign)) as GeneratedAdCampaign;

  report.issues.forEach((issue) => {
    if (!issue.suggestedFix) return;

    if (updatedCampaign.searchAds?.headlines) {
      updatedCampaign.searchAds.headlines = updatedCampaign.searchAds.headlines.map((h) => {
        if (h.text === issue.targetText) {
          const fixed = issue.suggestedFix!;
          return {
            ...h,
            text: fixed,
            charCount: fixed.length,
            charWidth: countCharacterWidth(fixed),
          };
        }
        return h;
      });
    }

    if (updatedCampaign.searchAds?.descriptions) {
      updatedCampaign.searchAds.descriptions = updatedCampaign.searchAds.descriptions.map((d) => {
        if (d.text === issue.targetText) {
          const fixed = issue.suggestedFix!;
          return {
            ...d,
            text: fixed,
            charCount: fixed.length,
            charWidth: countCharacterWidth(fixed),
          };
        }
        return d;
      });
    }

    if (updatedCampaign.displayAds) {
      if (updatedCampaign.displayAds.shortHeadline === issue.targetText) {
        updatedCampaign.displayAds.shortHeadline = issue.suggestedFix;
        updatedCampaign.displayAds.shortHeadlineCharCount = issue.suggestedFix.length;
      }
      if (updatedCampaign.displayAds.longHeadline === issue.targetText) {
        updatedCampaign.displayAds.longHeadline = issue.suggestedFix;
        updatedCampaign.displayAds.longHeadlineCharCount = issue.suggestedFix.length;
      }
      if (updatedCampaign.displayAds.description === issue.targetText) {
        updatedCampaign.displayAds.description = issue.suggestedFix;
        updatedCampaign.displayAds.descriptionCharCount = issue.suggestedFix.length;
      }
    }
  });

  updatedCampaign.complianceReport = runComplianceAudit(updatedCampaign);
  return updatedCampaign;
}
