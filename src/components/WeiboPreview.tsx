import React from 'react';
import { Repeat2, MessageCircle, Heart, BadgeCheck } from 'lucide-react';
import { ComplianceIssue, WeiboEnglishOption, WeiboPost } from '../types';
import { ChinaLawCallout } from './ChinaLawCallout';

interface Props {
  post: WeiboPost;
  accountName: string;
  issues: ComplianceIssue[];
}

function WeiboCard({
  accountName,
  hook,
  body,
  hashtags,
  link,
  badge,
}: {
  accountName: string;
  hook: string;
  body: string;
  hashtags: string[];
  link: string;
  badge?: string;
}) {
  return (
    <article className="max-w-[440px] rounded-2xl border border-[#ffe1c4] bg-white shadow-sm overflow-hidden">
      <header className="flex items-center gap-3 px-4 pt-4">
        <div className="w-11 h-11 rounded-full bg-gradient-to-br from-[#ffb020] to-[#ff8200] text-white flex items-center justify-center font-bold text-sm shrink-0">
          {accountName.slice(0, 1).toUpperCase()}
        </div>
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="font-bold text-slate-900 text-sm truncate">{accountName}</span>
            <BadgeCheck className="w-4 h-4 text-[#ff8200] shrink-0" />
            {badge && (
              <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-slate-100 text-slate-600">{badge}</span>
            )}
          </div>
          <p className="text-[11px] text-slate-400">刚刚 · 来自 微博</p>
        </div>
        <span className="ml-auto text-[#ff8200] font-black tracking-tight text-sm">微博</span>
      </header>

      <div className="px-4 pt-3 pb-2 text-[15px] leading-7 text-slate-900 whitespace-pre-wrap">
        <p className="font-semibold">{hook}</p>
        <p className="mt-1">{body}</p>
        {hashtags.length > 0 && (
          <p className="mt-2 text-[#ff7d3c] font-medium">
            {hashtags.map((tag) => (
              <span key={tag} className="mr-2">
                {tag}
              </span>
            ))}
          </p>
        )}
        {link ? (
          <a href={link} target="_blank" rel="noreferrer" className="mt-2 block text-[#1d7fe2] break-all hover:underline">
            {link}
          </a>
        ) : (
          <p className="mt-2 text-sm text-slate-500">No landing link has been resolved for this campaign.</p>
        )}
      </div>

      <footer className="grid grid-cols-3 border-t border-slate-100 text-slate-400 text-xs">
        {[
          { icon: Repeat2, label: '转发' },
          { icon: MessageCircle, label: '评论' },
          { icon: Heart, label: '赞' },
        ].map((action) => (
          <div key={action.label} className="flex items-center justify-center gap-1.5 py-2.5">
            <action.icon className="w-3.5 h-3.5" />
            <span>{action.label}</span>
          </div>
        ))}
      </footer>
    </article>
  );
}

function EnglishCard({ option, accountName }: { option: WeiboEnglishOption; accountName: string }) {
  return (
    <WeiboCard
      accountName={accountName}
      hook={option.hook}
      body={option.body}
      hashtags={option.hashtags}
      link={option.link}
      badge="EN"
    />
  );
}

export const WeiboPreview: React.FC<Props> = ({ post, accountName, issues }) => {
  const over = post.practicalLength > post.practicalLimit;
  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-2">
        <div>
          <h3 className="text-sm font-bold text-slate-900">Organic Weibo post</h3>
          <p className="text-xs text-slate-500 mt-1 max-w-xl">
            Chinese post for this journal and stage. Hook and body stay within the length Weibo shows before 全文. The link is the campaign landing destination.
          </p>
        </div>
        <span
          className={`text-[11px] font-semibold px-2.5 py-1 rounded-full border ${
            over ? 'bg-rose-50 text-rose-700 border-rose-200' : 'bg-emerald-50 text-emerald-800 border-emerald-200'
          }`}
        >
          Hook + body {post.practicalLength}/{post.practicalLimit}
        </span>
      </div>

      <div className="flex flex-col xl:flex-row gap-6 items-start">
        <WeiboCard
          accountName={accountName}
          hook={post.hook}
          body={post.body}
          hashtags={post.hashtags}
          link={post.link}
        />
        <div className="flex-1 min-w-0 space-y-3">
          <dl className="grid grid-cols-1 gap-2 text-xs">
            <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
              <dt className="font-semibold text-slate-500">Hook</dt>
              <dd className="text-slate-900 mt-0.5">{post.hook}</dd>
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
              <dt className="font-semibold text-slate-500">Body</dt>
              <dd className="text-slate-900 mt-0.5">{post.body}</dd>
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
              <dt className="font-semibold text-slate-500">Hashtags</dt>
              <dd className="text-slate-900 mt-0.5">{post.hashtags.join(' ') || '—'}</dd>
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
              <dt className="font-semibold text-slate-500">Landing link</dt>
              <dd className="text-slate-900 mt-0.5 break-all">{post.link || '—'}</dd>
            </div>
          </dl>
          <ul className="text-[11px] text-slate-500 space-y-1">
            {post.factNotes.map((note) => (
              <li key={note}>{note}</li>
            ))}
          </ul>
        </div>
      </div>

      {post.englishOption ? (
        <div className="space-y-2">
          <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500">English option · bilingual campaign</h4>
          <EnglishCard option={post.englishOption} accountName={accountName} />
        </div>
      ) : (
        <p className="text-xs text-slate-500">
          A short English option is added when the campaign language is bilingual.
        </p>
      )}

      <ChinaLawCallout issues={issues} channel="Weibo" />
    </div>
  );
};
