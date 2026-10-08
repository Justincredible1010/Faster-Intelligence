import React, { useState } from 'react';
import { MessageCircle, Heart, ThumbsUp } from 'lucide-react';
import { ComplianceIssue, WeChatAd } from '../types';
import { charCount } from '../china/chinaAdLaw';
import { ChinaLawCallout } from './ChinaLawCallout';

interface Props {
  ad: WeChatAd;
  accountName: string;
  issues: ComplianceIssue[];
}

function Counter({ label, value, limit }: { label: string; value: string; limit: number }) {
  const count = charCount(value);
  const over = count > limit;
  return (
    <div className="rounded-xl border border-slate-200 bg-white px-3 py-2">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] font-semibold text-slate-500">{label}</span>
        <span className={`text-[11px] font-semibold ${over ? 'text-rose-600' : 'text-emerald-700'}`}>
          {count}/{limit}
        </span>
      </div>
      <p className="text-sm text-slate-900 mt-1">{value}</p>
    </div>
  );
}

function MomentsCard({ ad, accountName }: { ad: WeChatAd; accountName: string }) {
  return (
    <article className="w-full max-w-[380px] rounded-2xl border border-slate-200 bg-[#f7f7f7] shadow-sm overflow-hidden">
      <div className="bg-white px-3 pt-3 pb-2">
        <div className="flex items-start gap-2.5">
          <div className="w-10 h-10 rounded-md bg-[#07c160] text-white flex items-center justify-center text-xs font-bold shrink-0">
            {accountName.slice(0, 1).toUpperCase()}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <span className="text-sm font-semibold text-[#576b95] truncate">{accountName}</span>
              <span className="text-[10px] px-1 py-px rounded border border-slate-300 text-slate-400 leading-none">广告</span>
            </div>
            <p className="mt-1 text-[14px] leading-6 text-slate-900">{ad.description}</p>
          </div>
        </div>
        <div className="mt-2 ml-12 rounded-md overflow-hidden border border-slate-200 bg-white">
          <div className="h-36 bg-[#002d62] text-white flex flex-col items-center justify-center px-4 text-center">
            <span className="text-[11px] uppercase tracking-[0.14em] text-sky-200">WeChat Moments</span>
            <span className="mt-1 text-base font-semibold">{ad.headline}</span>
          </div>
          <div className="flex items-center justify-between gap-3 px-3 py-2.5">
            <span className="text-sm font-medium text-slate-800 truncate">{ad.headline}</span>
            <span className="shrink-0 rounded bg-[#07c160] text-white text-xs font-semibold px-2.5 py-1">{ad.cta}</span>
          </div>
        </div>
        {ad.landingUrl ? (
          <p className="mt-2 ml-12 text-[11px] text-[#576b95] break-all">{ad.landingUrl}</p>
        ) : (
          <p className="mt-2 ml-12 text-[11px] text-slate-500">No landing link has been resolved for this campaign.</p>
        )}
        <div className="mt-2 ml-12 flex items-center gap-4 text-slate-400 text-xs pb-1">
          <span className="inline-flex items-center gap-1"><Heart className="w-3.5 h-3.5" /> 赞</span>
          <span className="inline-flex items-center gap-1"><MessageCircle className="w-3.5 h-3.5" /> 评论</span>
        </div>
      </div>
    </article>
  );
}

function OfficialAccountCard({ ad, accountName }: { ad: WeChatAd; accountName: string }) {
  return (
    <article className="w-full max-w-[380px] rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
      <div className="px-3 py-2 border-b border-slate-100 flex items-center justify-between">
        <span className="text-xs font-semibold text-slate-700 truncate">{accountName}</span>
        <span className="text-[10px] px-1 py-px rounded border border-slate-300 text-slate-400">广告</span>
      </div>
      <div className="px-3 py-3">
        <p className="text-[11px] text-slate-400 mb-2">公众号文章底部</p>
        <div className="flex items-center gap-3 rounded-lg border border-slate-200 p-2.5">
          <div className="w-14 h-14 rounded-md bg-[#002d62] text-white text-[10px] font-semibold flex items-center justify-center text-center px-1 shrink-0">
            {ad.headline}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-slate-900 truncate">{ad.headline}</p>
            <p className="text-xs text-slate-500 mt-0.5 line-clamp-2">{ad.description}</p>
          </div>
          <span className="shrink-0 text-xs font-semibold text-[#07c160]">{ad.cta}</span>
        </div>
        {ad.landingUrl ? (
          <p className="mt-2 text-[11px] text-[#576b95] break-all">{ad.landingUrl}</p>
        ) : (
          <p className="mt-2 text-[11px] text-slate-500">No landing link has been resolved for this campaign.</p>
        )}
        <div className="mt-3 flex items-center gap-1 text-[11px] text-slate-400">
          <ThumbsUp className="w-3.5 h-3.5" />
          <span>Paid placement · not an organic post</span>
        </div>
      </div>
    </article>
  );
}

export const WeChatAdPreview: React.FC<Props> = ({ ad, accountName, issues }) => {
  const [placement, setPlacement] = useState<'moments' | 'official_account'>('moments');

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
        <div>
          <h3 className="text-sm font-bold text-slate-900">WeChat ad · paid</h3>
          <p className="text-xs text-slate-500 mt-1 max-w-xl">
            Moments and Official Account use the same headline, description, and preset CTA. This is a paid ad, not an organic post. The landing link is the campaign destination.
          </p>
        </div>
        <div className="flex items-center bg-slate-100 p-1 rounded-xl border border-slate-200 text-xs">
          <button
            type="button"
            onClick={() => setPlacement('moments')}
            className={`px-3 py-1 font-semibold rounded-lg ${placement === 'moments' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600'}`}
          >
            Moments 朋友圈
          </button>
          <button
            type="button"
            onClick={() => setPlacement('official_account')}
            className={`px-3 py-1 font-semibold rounded-lg ${placement === 'official_account' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600'}`}
          >
            Official Account 公众号
          </button>
        </div>
      </div>

      <div className="flex flex-col xl:flex-row gap-6 items-start">
        {placement === 'moments' ? (
          <MomentsCard ad={ad} accountName={accountName} />
        ) : (
          <OfficialAccountCard ad={ad} accountName={accountName} />
        )}
        <div className="flex-1 min-w-0 space-y-2">
          <Counter label="Headline" value={ad.headline} limit={ad.headlineLimit} />
          <Counter label="Description" value={ad.description} limit={ad.descriptionLimit} />
          <Counter label="CTA preset" value={ad.cta} limit={ad.ctaLimit} />
          <div className="rounded-xl border border-slate-200 bg-white px-3 py-2">
            <span className="text-[11px] font-semibold text-slate-500">Landing URL</span>
            <p className="text-sm text-slate-900 mt-1 break-all">{ad.landingUrl || '—'}</p>
          </div>
          <ul className="text-[11px] text-slate-500 space-y-1 pt-1">
            {ad.factNotes.map((note) => (
              <li key={note}>{note}</li>
            ))}
          </ul>
        </div>
      </div>

      {ad.englishOption ? (
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 space-y-2">
          <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500">English option · bilingual campaign</h4>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-sm">
            <div>
              <div className="text-[11px] text-slate-500">Headline</div>
              <div className="font-medium text-slate-900">{ad.englishOption.headline}</div>
            </div>
            <div>
              <div className="text-[11px] text-slate-500">Description</div>
              <div className="font-medium text-slate-900">{ad.englishOption.description}</div>
            </div>
            <div>
              <div className="text-[11px] text-slate-500">CTA</div>
              <div className="font-medium text-slate-900">{ad.englishOption.cta}</div>
            </div>
          </div>
        </div>
      ) : (
        <p className="text-xs text-slate-500">A short English option is added when the campaign language is bilingual.</p>
      )}

      <ChinaLawCallout issues={issues} channel="WeChat" />
    </div>
  );
};
