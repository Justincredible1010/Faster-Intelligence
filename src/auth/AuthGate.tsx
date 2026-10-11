import React, { createContext, useContext, useEffect, useState } from 'react';
import { BookOpen, Mail } from 'lucide-react';
import { AppSidebar } from '../components/AppSidebar';
import {
  devLogin,
  loadSession,
  logout as logoutRequest,
  requestMagicLink,
  verifyMagicLink,
  type SessionResponse,
  type SessionUser,
} from './api';

interface AuthState {
  user: SessionUser;
  admin: boolean;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function useAuth(): AuthState {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth must be used within AuthGate');
  return value;
}

const ERROR_TEXT: Record<string, string> = {
  email_domain: 'That account is not a verified @springernature.com address.',
  email_unverified: 'The identity provider did not confirm that this email is verified.',
  email_missing: 'The identity provider did not send an email address.',
  hd_rejected: 'The hosted-domain claim on this account is not an allowed Springer Nature domain.',
  invalid_state: 'The sign-in attempt expired or did not match this browser. Try again.',
  invalid_nonce: 'The sign-in response could not be verified. Try again.',
  access_denied: 'Sign-in was cancelled.',
  provider_error: 'The identity provider could not complete sign-in.',
  not_configured: 'This sign-in method is not configured on the server.',
  expired: 'The sign-in attempt expired. Try again.',
};

function readMagicToken(): string | null {
  const hash = window.location.hash.startsWith('#') ? window.location.hash.slice(1) : window.location.hash;
  const params = new URLSearchParams(hash);
  return params.get('magic');
}

function clearMagicHash(): void {
  const url = new URL(window.location.href);
  url.hash = '';
  window.history.replaceState(null, '', url.pathname + url.search);
}

export function AuthGate({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<SessionResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [email, setEmail] = useState('');
  const [pending, setPending] = useState(false);
  const [linkSent, setLinkSent] = useState(false);
  const [magicToken, setMagicToken] = useState<string | null>(null);

  const refresh = async () => {
    const next = await loadSession();
    setSession(next);
    return next;
  };

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get('auth_error');
    if (code) {
      setError(ERROR_TEXT[code] || 'Sign-in failed.');
      params.delete('auth_error');
      const search = params.toString();
      window.history.replaceState(null, '', window.location.pathname + (search ? `?${search}` : ''));
    }
    const token = readMagicToken();
    if (token) {
      setMagicToken(token);
      clearMagicHash();
    }
    refresh().catch(() => setError('Could not reach the sign-in service.'));
    const onExpired = () => {
      setSession((current) => (current ? { ...current, authenticated: false, user: null, admin: false } : current));
      refresh().catch(() => undefined);
    };
    window.addEventListener('auth:expired', onExpired);
    return () => window.removeEventListener('auth:expired', onExpired);
  }, []);

  const logout = async () => {
    const next = await logoutRequest();
    setSession(next);
    setLinkSent(false);
    setMagicToken(null);
  };

  if (!session) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center text-slate-500 text-sm">
        Checking your session…
      </div>
    );
  }

  if (!session.authenticated || !session.user) {
    const domainLabel = session.allowedDomains[0] || 'springernature.com';
    const submitMagic = async (event: React.FormEvent) => {
      event.preventDefault();
      setPending(true);
      setError(null);
      const result = await requestMagicLink(email);
      setPending(false);
      if (!result.ok) {
        setError(result.error || 'Could not send the sign-in email');
        return;
      }
      setLinkSent(true);
    };
    const confirmMagic = async () => {
      if (!magicToken) return;
      setPending(true);
      setError(null);
      const result = await verifyMagicLink(magicToken);
      setPending(false);
      if (!result.authenticated || !result.user) {
        setError(result.error || 'This sign-in link is invalid or has expired.');
        setMagicToken(null);
        return;
      }
      setMagicToken(null);
      setSession(result);
    };
    const continueAsDev = async () => {
      setPending(true);
      setError(null);
      const result = await devLogin();
      setPending(false);
      if (!result.authenticated || !result.user) {
        setError(result.error || 'Development sign-in is unavailable');
        return;
      }
      setSession(result);
    };

    return (
      <div className="min-h-screen bg-slate-100">
        <AppSidebar mode="sign-in" activeId="sign-in" onSelect={() => undefined} />
        <div className="lg:pl-64 min-h-screen flex items-center justify-center px-4 py-12 pt-20 lg:pt-12">
        <div className="w-full max-w-md bg-white border border-slate-200 rounded-2xl shadow-sm p-8">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 rounded-xl bg-[#002d62] text-white flex items-center justify-center">
              <BookOpen className="w-5 h-5 text-sky-300" />
            </div>
            <div>
              <h1 className="text-lg font-extrabold text-slate-900 tracking-tight">Marketing Content Generation Engine</h1>
              <p className="text-xs text-slate-500">Springer Nature staff sign-in</p>
            </div>
          </div>
          <p className="text-sm text-slate-600 mb-5">
            Only verified <span className="font-semibold">@{domainLabel}</span> email addresses can use this app.
          </p>
          {error && (
            <div className="mb-4 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-950">{error}</div>
          )}
          {magicToken && (
            <div className="space-y-3">
              <p className="text-sm text-slate-700">Confirm sign-in from the email link on this browser.</p>
              <button
                type="button"
                onClick={confirmMagic}
                disabled={pending || !session.csrfToken}
                className="w-full rounded-lg bg-[#002d62] text-white text-sm font-semibold py-2.5 hover:bg-[#00224a] disabled:opacity-60"
              >
                {pending ? 'Signing in…' : 'Confirm sign-in'}
              </button>
            </div>
          )}
          {!magicToken && session.provider === 'magic_link' && (
            <form onSubmit={submitMagic} className="space-y-3">
              <label className="block text-xs font-semibold text-slate-700" htmlFor="work-email">
                Work email
              </label>
              <input
                id="work-email"
                type="email"
                autoComplete="username"
                required
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder={`name@${domainLabel}`}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
              <button
                type="submit"
                disabled={pending || !session.csrfToken}
                className="w-full inline-flex items-center justify-center gap-2 rounded-lg bg-[#002d62] text-white text-sm font-semibold py-2.5 hover:bg-[#00224a] disabled:opacity-60"
              >
                <Mail className="w-4 h-4" />
                {pending ? 'Sending…' : 'Email me a sign-in link'}
              </button>
              {linkSent && (
                <p className="text-sm text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">
                  Check your inbox, open the link, then confirm sign-in. The link expires quickly and works once.
                </p>
              )}
            </form>
          )}
          {!magicToken && (session.provider === 'google' || session.provider === 'oidc') && (
            <a
              href="/api/auth/login"
              className="w-full inline-flex items-center justify-center rounded-lg bg-[#002d62] text-white text-sm font-semibold py-2.5 hover:bg-[#00224a]"
            >
              {session.provider === 'google' ? 'Sign in with Google' : 'Sign in with your Springer Nature account'}
            </a>
          )}
          {!magicToken && !session.provider && (
            <p className="text-sm text-slate-600">Sign-in is not configured. Set AUTH_PROVIDER on the server.</p>
          )}
          {session.devBypass && (
            <>
              <button
                type="button"
                onClick={continueAsDev}
                disabled={pending || !session.csrfToken}
                className="mt-4 w-full rounded-lg border border-slate-300 bg-slate-50 text-slate-800 text-sm font-semibold py-2.5 hover:bg-slate-100 disabled:opacity-60"
              >
                Continue as a test user
              </button>
              <p className="mt-2 text-xs text-slate-500 text-center">
                Local development only. This is not a Springer Nature sign-in.
              </p>
            </>
          )}
        </div>
        </div>
      </div>
    );
  }

  return (
    <AuthContext.Provider value={{ user: session.user, admin: session.admin, logout }}>
      {children}
    </AuthContext.Provider>
  );
}
