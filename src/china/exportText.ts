import { GeneratedAdCampaign, STAGE_CONFIGS, normalizeStage } from '../types';

function cell(value: string | number | undefined | null): string {
  const str = value == null ? '' : String(value);
  if (/[",\n\r]/.test(str)) return `"${str.replace(/"/g, '""')}"`;
  return str;
}

/**
 * Spreadsheet rows for the Weibo post and the WeChat ad.
 * This is a separate table from the Google Ads Editor columns.
 */
export function generateChinaChannelsCsv(campaign: GeneratedAdCampaign): string {
  const stage = normalizeStage(campaign.funnelStage);
  const journal = campaign.clarivateFacts?.journalName || '';
  const headers = ['Section', 'Channel', 'Stage', 'Journal', 'Field', 'Language', 'Text', 'Landing URL', 'Notes'];
  const rows: string[][] = [];
  const push = (channel: string, field: string, language: string, text: string, url: string, notes = '') => {
    rows.push(['Weibo and WeChat', channel, stage, journal, field, language, text, url, notes]);
  };

  const weibo = campaign.weiboPost;
  if (weibo) {
    const notes = (weibo.factNotes || []).join(' ');
    push('Weibo organic post', 'Hook', 'ZH', weibo.hook, weibo.link, notes);
    push('Weibo organic post', 'Body', 'ZH', weibo.body, weibo.link, notes);
    push('Weibo organic post', 'Hashtags', 'ZH', (weibo.hashtags || []).join(' '), weibo.link, notes);
    push('Weibo organic post', 'Link', 'ZH', weibo.link, weibo.link, notes);
    if (weibo.englishOption) {
      push('Weibo organic post', 'Hook', 'EN', weibo.englishOption.hook, weibo.englishOption.link, notes);
      push('Weibo organic post', 'Body', 'EN', weibo.englishOption.body, weibo.englishOption.link, notes);
      push('Weibo organic post', 'Hashtags', 'EN', (weibo.englishOption.hashtags || []).join(' '), weibo.englishOption.link, notes);
    }
  }

  const ad = campaign.wechatAd;
  if (ad) {
    const notes = (ad.factNotes || []).join(' ');
    push('WeChat ad (paid)', 'Headline', 'ZH', ad.headline, ad.landingUrl, notes);
    push('WeChat ad (paid)', 'Description', 'ZH', ad.description, ad.landingUrl, notes);
    push('WeChat ad (paid)', 'CTA', 'ZH', ad.cta, ad.landingUrl, notes);
    push('WeChat ad (paid)', 'Landing URL', 'ZH', ad.landingUrl, ad.landingUrl, notes);
    if (ad.englishOption) {
      push('WeChat ad (paid)', 'Headline', 'EN', ad.englishOption.headline, ad.landingUrl, notes);
      push('WeChat ad (paid)', 'Description', 'EN', ad.englishOption.description, ad.landingUrl, notes);
      push('WeChat ad (paid)', 'CTA', 'EN', ad.englishOption.cta, ad.landingUrl, notes);
    }
  }

  return [headers.join(','), ...rows.map((row) => row.map((value) => cell(value)).join(','))].join('\n');
}

/** Labelled section for the export instructions and the campaign brief. */
export function chinaChannelsExportSection(campaign: GeneratedAdCampaign): string {
  const stage = normalizeStage(campaign.funnelStage);
  const cfg = STAGE_CONFIGS[stage];
  const weibo = campaign.weiboPost;
  const ad = campaign.wechatAd;
  const law = (campaign.complianceReport?.issues || []).filter((issue) => issue.category === 'china_ad_law');
  const lawLines = law.length
    ? law.map((issue) => `- ${issue.fieldLocation}: ${issue.message}`).join('\n')
    : '- None flagged. Copy was not rewritten to satisfy the law.';

  const englishWeibo = weibo?.englishOption
    ? `\nEnglish option (bilingual campaign only):\n- Hook: ${weibo.englishOption.hook}\n- Body: ${weibo.englishOption.body}\n- Hashtags: ${(weibo.englishOption.hashtags || []).join(' ')}\n- Link: ${weibo.englishOption.link}`
    : '\nEnglish option: omitted. A short English Weibo option is included only when the campaign language is bilingual.';

  const englishAd = ad?.englishOption
    ? `\nEnglish option:\n- Headline: ${ad.englishOption.headline}\n- Description: ${ad.englishOption.description}\n- CTA: ${ad.englishOption.cta}`
    : '\nEnglish option: omitted. A short English WeChat option is included only when the campaign language is bilingual.';

  return `## Weibo organic post and WeChat ads

This section is not a Google Ads Editor table. It is the Weibo post and the paid WeChat ad for ${cfg.name}.
China Advertising Law warnings are listed below. The copy was not changed to clear them.

### Weibo (organic)
- Hook: ${weibo?.hook || ''}
- Body: ${weibo?.body || ''}
- Practical length: ${weibo?.practicalLength ?? ''}/${weibo?.practicalLimit ?? 140} characters (hook + body)
- Hashtags: ${(weibo?.hashtags || []).join(' ')}
- Link: ${weibo?.link || '(no landing URL resolved)'}
${englishWeibo}

### WeChat ads (paid: Moments and Official Account)
Not an organic post.
- Headline (${ad?.headline.length ?? 0}/${ad?.headlineLimit ?? 10}): ${ad?.headline || ''}
- Description (${ad?.description.length ?? 0}/${ad?.descriptionLimit ?? 30}): ${ad?.description || ''}
- CTA: ${ad?.cta || ''}
- Landing URL: ${ad?.landingUrl || '(no landing URL resolved)'}
${englishAd}

### Fact notes
${(weibo?.factNotes || ad?.factNotes || ['No China-channel fact notes.']).map((note) => `- ${note}`).join('\n')}

### China Advertising Law warnings
${lawLines}

### Spreadsheet rows
\`\`\`csv
${generateChinaChannelsCsv(campaign)}
\`\`\`
`;
}
