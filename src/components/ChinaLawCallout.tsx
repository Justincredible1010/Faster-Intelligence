import React from 'react';
import { AlertTriangle } from 'lucide-react';
import { ComplianceIssue } from '../types';

interface Props {
  issues: ComplianceIssue[];
  channel: 'Weibo' | 'WeChat';
}

/** Shows China Advertising Law warnings for one channel. Copy is left as generated. */
export const ChinaLawCallout: React.FC<Props> = ({ issues, channel }) => {
  const flagged = issues.filter(
    (issue) => issue.category === 'china_ad_law' && issue.fieldLocation.startsWith(channel)
  );

  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50/80 p-3 text-xs text-amber-950 space-y-2">
      <div className="flex items-start gap-2">
        <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
        <p className="leading-relaxed">
          China Advertising Law warnings name the line that might conflict. The post and the ad are not rewritten to comply.
        </p>
      </div>
      {flagged.length === 0 ? (
        <p className="text-amber-800">No conflicting lines flagged for this {channel === 'Weibo' ? 'Weibo post' : 'WeChat ad'}.</p>
      ) : (
        <ul className="space-y-1.5">
          {flagged.map((issue) => (
            <li key={issue.id} className="rounded-lg bg-white border border-amber-200 px-2.5 py-2">
              <div className="font-semibold text-amber-900">{issue.fieldLocation}</div>
              <p className="mt-0.5 leading-relaxed">{issue.message}</p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};
