import type { OauthTransaction, SessionRecord } from './session';

/**
 * Sessions, magic-link tokens, and OAuth transactions are accessed only through
 * these interfaces. The default implementations are in-memory so a single
 * process (local dev, or Cloud Run pinned to one instance) keeps working.
 * A shared durable store can replace them later via the setters below.
 */

export interface MagicLinkRecord {
  email: string;
  expiresAt: number;
  createdAt: number;
}

export interface SessionStore {
  get(id: string): SessionRecord | null;
  set(session: SessionRecord): void;
  delete(id: string): void;
  clear(): void;
}

export interface MagicLinkStore {
  get(tokenHash: string): MagicLinkRecord | null;
  set(tokenHash: string, record: MagicLinkRecord): void;
  delete(tokenHash: string): void;
  entries(): Iterable<[string, MagicLinkRecord]>;
  size(): number;
  clear(): void;
}

export interface OauthStateStore {
  get(sessionId: string): OauthTransaction | null;
  set(sessionId: string, transaction: OauthTransaction): void;
  delete(sessionId: string): void;
  clear(): void;
}

export class MemorySessionStore implements SessionStore {
  private readonly sessions = new Map<string, SessionRecord>();

  get(id: string): SessionRecord | null {
    return this.sessions.get(id) ?? null;
  }

  set(session: SessionRecord): void {
    this.sessions.set(session.id, session);
  }

  delete(id: string): void {
    this.sessions.delete(id);
  }

  clear(): void {
    this.sessions.clear();
  }
}

export class MemoryMagicLinkStore implements MagicLinkStore {
  private readonly links = new Map<string, MagicLinkRecord>();

  get(tokenHash: string): MagicLinkRecord | null {
    return this.links.get(tokenHash) ?? null;
  }

  set(tokenHash: string, record: MagicLinkRecord): void {
    this.links.set(tokenHash, record);
  }

  delete(tokenHash: string): void {
    this.links.delete(tokenHash);
  }

  entries(): Iterable<[string, MagicLinkRecord]> {
    return this.links.entries();
  }

  size(): number {
    return this.links.size;
  }

  clear(): void {
    this.links.clear();
  }
}

export class MemoryOauthStateStore implements OauthStateStore {
  private readonly states = new Map<string, OauthTransaction>();

  get(sessionId: string): OauthTransaction | null {
    return this.states.get(sessionId) ?? null;
  }

  set(sessionId: string, transaction: OauthTransaction): void {
    this.states.set(sessionId, transaction);
  }

  delete(sessionId: string): void {
    this.states.delete(sessionId);
  }

  clear(): void {
    this.states.clear();
  }
}

let sessionStore: SessionStore = new MemorySessionStore();
let magicLinkStore: MagicLinkStore = new MemoryMagicLinkStore();
let oauthStateStore: OauthStateStore = new MemoryOauthStateStore();

export function getSessionStore(): SessionStore {
  return sessionStore;
}

export function setSessionStore(store: SessionStore): void {
  sessionStore = store;
}

export function getMagicLinkStore(): MagicLinkStore {
  return magicLinkStore;
}

export function setMagicLinkStore(store: MagicLinkStore): void {
  magicLinkStore = store;
}

export function getOauthStateStore(): OauthStateStore {
  return oauthStateStore;
}

export function setOauthStateStore(store: OauthStateStore): void {
  oauthStateStore = store;
}
