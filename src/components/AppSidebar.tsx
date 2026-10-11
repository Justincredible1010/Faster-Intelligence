import React, { useEffect, useState } from 'react';
import {
  BookOpen,
  BookOpenText,
  Compass,
  Download,
  Layers,
  Layout,
  LogOut,
  Megaphone,
  Menu,
  MessageCircle,
  PenLine,
  Search,
  ShieldCheck,
  Sliders,
  Sparkles,
  Target,
  UserRound,
  X,
} from 'lucide-react';

export type PreviewTab = 'search' | 'display' | 'keywords' | 'weibo' | 'wechat';

export type AppNavId =
  | 'sign-in'
  | 'studio'
  | 'facts'
  | 'stage'
  | PreviewTab
  | 'exports'
  | 'policy'
  | 'guide'
  | 'compare'
  | 'rules'
  | 'account'
  | 'patterns';

interface NavItem {
  id: AppNavId;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  adminOnly?: boolean;
}

const GROUPS: { label: string; items: NavItem[] }[] = [
  {
    label: 'Build',
    items: [
      { id: 'studio', label: 'Campaign studio', icon: PenLine },
      { id: 'facts', label: 'Journal facts', icon: BookOpen },
      { id: 'stage', label: 'Stage and page', icon: Compass },
    ],
  },
  {
    label: 'Preview',
    items: [
      { id: 'search', label: 'Search ads', icon: Search },
      { id: 'display', label: 'Display ads', icon: Layout },
      { id: 'weibo', label: 'Weibo', icon: MessageCircle },
      { id: 'wechat', label: 'WeChat', icon: Megaphone },
      { id: 'keywords', label: 'Keywords', icon: Target },
    ],
  },
  {
    label: 'Share',
    items: [
      { id: 'exports', label: 'Exports', icon: Download },
      { id: 'policy', label: 'Policy check', icon: ShieldCheck },
    ],
  },
  {
    label: 'Guides',
    items: [
      { id: 'guide', label: 'How the stages differ', icon: BookOpenText },
      { id: 'compare', label: 'Compare stages', icon: Layers },
      { id: 'rules', label: 'Writing rules', icon: Sparkles },
    ],
  },
  {
    label: 'Account',
    items: [
      { id: 'account', label: 'Your account', icon: UserRound },
      { id: 'patterns', label: 'Page patterns', icon: Sliders, adminOnly: true },
    ],
  },
];

interface Props {
  mode: 'app' | 'sign-in';
  activeId: AppNavId;
  onSelect: (id: AppNavId) => void;
  admin?: boolean;
  email?: string;
  onSignOut?: () => void;
}

export const AppSidebar: React.FC<Props> = ({
  mode,
  activeId,
  onSelect,
  admin = false,
  email,
  onSignOut,
}) => {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  const choose = (id: AppNavId) => {
    setOpen(false);
    onSelect(id);
  };

  const rail = (
    <>
      <div className="px-4 py-4 border-b border-slate-200 flex items-center gap-2.5 shrink-0">
        <div className="w-9 h-9 rounded-xl bg-[#002d62] text-white flex items-center justify-center shrink-0">
          <BookOpen className="w-5 h-5 text-sky-300" />
        </div>
        <div className="min-w-0">
          <div className="font-extrabold text-slate-900 text-sm leading-tight">
            Marketing Content Generation Engine
          </div>
          <p className="text-[11px] text-slate-500 mt-0.5">Campaign studio</p>
        </div>
      </div>

      <nav aria-label="Main menu" className="flex-1 overflow-y-auto px-3 py-3">
        {mode === 'sign-in' && (
          <div className="mb-2">
            <p className="px-2 pt-1 pb-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">
              Sign in
            </p>
            <button
              type="button"
              aria-current="page"
              className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-semibold bg-[#002d62] text-white shadow-sm"
            >
              <UserRound className="w-4 h-4 shrink-0 text-sky-200" />
              <span>Sign in</span>
            </button>
            <p className="px-3 pt-2 text-[11px] text-slate-500 leading-relaxed">
              The rest of the menu opens after you sign in.
            </p>
          </div>
        )}
        {GROUPS.map((group) => (
          <div key={group.label} className="mb-1">
            <p className="px-2 pt-3 pb-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">
              {group.label}
            </p>
            <ul className="space-y-0.5">
              {group.items
                .filter((item) => !item.adminOnly || admin)
                .map((item) => {
                  const Icon = item.icon;
                  const active = mode === 'app' && activeId === item.id;
                  const locked = mode === 'sign-in';
                  return (
                    <li key={item.id}>
                      <button
                        type="button"
                        id={item.id === 'patterns' ? 'open-stage-url-rules' : undefined}
                        aria-current={active ? 'page' : undefined}
                        disabled={locked}
                        title={locked ? 'Sign in to open this' : item.label}
                        onClick={() => choose(item.id)}
                        className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm text-left transition ${
                          active
                            ? 'bg-[#002d62] text-white font-semibold shadow-sm'
                            : 'text-slate-700 hover:bg-slate-100'
                        } disabled:opacity-45 disabled:hover:bg-transparent disabled:cursor-not-allowed`}
                      >
                        <Icon className={`w-4 h-4 shrink-0 ${active ? 'text-sky-200' : 'text-slate-500'}`} />
                        <span>{item.label}</span>
                      </button>
                    </li>
                  );
                })}
            </ul>
          </div>
        ))}
      </nav>

      <div className="shrink-0 border-t border-slate-200 p-3">
        {mode === 'app' && email ? (
          <div className="space-y-2">
            <button
              type="button"
              onClick={() => choose('account')}
              className="w-full text-left px-2 py-1.5 rounded-lg hover:bg-slate-50"
            >
              <div className="text-xs font-semibold text-slate-900 truncate" title={email}>
                {email}
              </div>
              <div className="text-[11px] text-slate-500">Your account</div>
            </button>
            {onSignOut && (
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  onSignOut();
                }}
                className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-xs font-semibold text-slate-700 hover:bg-slate-50"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span>Sign out</span>
              </button>
            )}
          </div>
        ) : (
          <p className="px-2 text-[11px] text-slate-500">Not signed in</p>
        )}
      </div>
    </>
  );

  return (
    <>
      <header className="lg:hidden fixed top-0 inset-x-0 z-40 h-14 bg-white border-b border-slate-200 flex items-center gap-3 px-3">
        <button
          type="button"
          aria-label="Open menu"
          aria-expanded={open}
          onClick={() => setOpen(true)}
          className="p-2 rounded-lg text-slate-700 hover:bg-slate-100"
        >
          <Menu className="w-5 h-5" />
        </button>
        <span className="font-extrabold text-slate-900 text-sm truncate">
          Marketing Content Generation Engine
        </span>
      </header>

      {open && (
        <button
          type="button"
          aria-label="Close menu"
          className="lg:hidden fixed inset-0 z-40 bg-slate-950/40"
          onClick={() => setOpen(false)}
        />
      )}

      <aside
        className={`fixed inset-y-0 left-0 z-50 lg:z-30 w-64 max-w-[85vw] bg-white border-r border-slate-200 flex flex-col transition-transform duration-200 ${
          open ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
        }`}
      >
        <div className="lg:hidden flex justify-end px-2 pt-2 shrink-0">
          <button
            type="button"
            aria-label="Close menu"
            onClick={() => setOpen(false)}
            className="p-2 rounded-lg text-slate-500 hover:bg-slate-100"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        {rail}
      </aside>
    </>
  );
};
