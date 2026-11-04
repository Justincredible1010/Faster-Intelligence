import React from 'react';
import { ChinaSearchAd, ComplianceIssue, GeneratedAdCampaign, So360DisplayAd } from '../types';
import { platformWidth } from '../china/platformRules';
import { ChinaLawCallout } from './ChinaLawCallout';

/**
 * Baidu Search (百度推广), 360 Search (360推广) and 360 Display previews.
 * Each line shows its width against the platform limit (汉字 = 2), the final-check
 * status for that field, and where the line's facts come from.
 * Rules and their sources: src/china/platformRules.ts.
 */

interface Props {
  campaign: GeneratedAdCampaign;
  issues: ComplianceIssue[];
}

type QaIssue = NonNullable<GeneratedAdCampaign['copyQa']>['issues'][number];

/** Where the facts in a line come from. Lines without a metric come from the campaign page. */
export function lineSource(text: string, landingUrl: string): string {
  if (/Clarivate|JCR/.test(text)) return 'Clarivate Journal Citation Reports (Web of Science Journals API)';
  const cited = text.match(/来源[:：]\s*([^。]+)/);
  if (cited) return cited[1].trim();
  return landingUrl ? `Journal page: ${landingUrl}` : 'Journal record (no metric in this line)';
}

function Line({ label, text, min, max, field, qa, landingUrl }: { label: string; text: string; min?: number; max: number; field: string; qa: QaIssue[]; landingUrl: string }) {
  const width = platformWidth(text);
  const fieldIssues = qa.filter((i) => i.field === field);
  const bad = !text || width > max || (min != null && width < min) || fieldIssues.length > 0;
  return (
    <div className="rounded-xl border border-slate-200 bg-white px-3 py-2">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] font-semibold text-slate-500">{label}</span>
        <span className={`text-[11px] font-semibold ${bad ? 'text-rose-600' : 'text-emerald-700'}`}>
          {width}/{min != null ? `${min}–` : ''}{max} · {bad ? 'Needs attention' : 'Passed check'}
        </span>
      </div>
      <p className="text-sm text-slate-900 mt-1">{text || <span className="text-slate-400">Dropped: no complete line passed the platform rules.</span>}</p>
      {fieldIssues.map((i, n) => (
        <p key={n} className="text-[11px] text-rose-600 mt-1">Removed “{i.text}”: {i.issues.join(', ')}</p>
      ))}
      {text && <p className="text-[11px] text-slate-500 mt-1">Source: {lineSource(text, landingUrl)}</p>}
    </div>
  );
}

function SearchCard({ title, ad, keyName, qa }: { title: string; ad: ChinaSearchAd; keyName: string; qa: QaIssue[] }) {
  return (
    <section className="space-y-2">
      <h3 className="text-sm font-semibold text-slate-800">{title}</h3>
      <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
        <p className="text-[#2440b3] text-base font-medium">{ad.title}</p>
        <p className="text-sm text-slate-700 mt-1">{[ad.description1, ad.description2].filter(Boolean).join(' ')}</p>
        <p className="text-xs text-emerald-700 mt-1 break-all">{ad.landingUrl}</p>
      </div>
      <Line label="Title" text={ad.title} max={ad.titleLimit} field={`${keyName}.title`} qa={qa} landingUrl={ad.landingUrl} />
      <Line label="Description 1" text={ad.description1} max={ad.descriptionLimit} field={`${keyName}.description1`} qa={qa} landingUrl={ad.landingUrl} />
      {(ad.description2 || qa.some((i) => i.field === `${keyName}.description2`)) && (
        <Line label="Description 2" text={ad.description2} max={ad.descriptionLimit} field={`${keyName}.description2`} qa={qa} landingUrl={ad.landingUrl} />
      )}
    </section>
  );
}

function DisplayCard({ ad, qa }: { ad: So360DisplayAd; qa: QaIssue[] }) {
  const titleIssues = qa.filter((i) => i.field.startsWith('so360DisplayAd.title'));
  return (
    <section className="space-y-2">
      <h3 className="text-sm font-semibold text-slate-800">360 Display (展示推广) · {ad.titles.length} titles (2–10)</h3>
      {ad.titles.map((t, i) => (
        <Line key={i} label={`Title ${i + 1}`} text={t} min={ad.titleRange[0]} max={ad.titleRange[1]} field={`so360DisplayAd.titles[${i}]`} qa={[]} landingUrl={ad.landingUrl} />
      ))}
      {titleIssues.map((i, n) => (
        <p key={n} className="text-[11px] text-rose-600">{i.field}: removed “{i.text}” ({i.issues.join(', ')})</p>
      ))}
      <Line label="Description" text={ad.description} min={ad.descriptionRange[0]} max={ad.descriptionRange[1]} field="so360DisplayAd.description" qa={qa} landingUrl={ad.landingUrl} />
    </section>
  );
}

export const ChinaSearchAdsPreview: React.FC<Props> = ({ campaign, issues }) => {
  const qa = campaign.copyQa?.issues || [];
  const any = campaign.baiduSearchAd || campaign.so360SearchAd || campaign.so360DisplayAd;
  if (!any) return <p className="text-sm text-slate-500">Generate the campaign again to include the Baidu and 360 ads.</p>;
  const chinaQa = qa.filter((i) => /^(baiduSearchAd|so360SearchAd|so360DisplayAd)/.test(i.field));
  return (
    <div className="space-y-5">
      <p className={`text-xs font-semibold ${chinaQa.length ? 'text-rose-600' : 'text-emerald-700'}`}>
        Final copy check: {chinaQa.length ? `${chinaQa.length} line(s) removed or need attention` : 'all Baidu and 360 lines passed'}. Width counts 汉字 as 2. No line was truncated.
      </p>
      {campaign.baiduSearchAd && <SearchCard title="Baidu Search (百度推广)" ad={campaign.baiduSearchAd} keyName="baiduSearchAd" qa={qa} />}
      {campaign.so360SearchAd && <SearchCard title="360 Search (360推广)" ad={campaign.so360SearchAd} keyName="so360SearchAd" qa={qa} />}
      {campaign.so360DisplayAd && <DisplayCard ad={campaign.so360DisplayAd} qa={qa} />}
      <ChinaLawCallout issues={issues} channel="Baidu" />
      <ChinaLawCallout issues={issues} channel="360" />
    </div>
  );
};
