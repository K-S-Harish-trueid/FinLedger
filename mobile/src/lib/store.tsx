import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { Platform } from 'react-native';
import {
  api,
  ApiError,
  isAuthError,
  isOffline,
  type Changes,
  type Session,
  type SyncRecord,
} from './api';
import { cacheClear, cacheGet, cacheSet, secureDelete, secureGet, secureSet } from './storage';
import type { Budget, Category, Investment, Saving, Transaction } from './gains';

const SESSION_KEY = 'finledger.session';
const dataKey = (userId: string): string => `finledger.data.${userId}`;

export type ResourceName = 'transactions' | 'savings' | 'budgets' | 'investments' | 'categories';

interface DataSet {
  transactions: Transaction[];
  savings: Saving[];
  budgets: Budget[];
  investments: Investment[];
  categories: Category[];
}

interface SyncMeta {
  id: string;
  updatedAt: number;
  deleted: boolean;
}

/** A record on its way in: sync bookkeeping is filled in by `save`. */
type Draft<T extends SyncMeta> = Omit<T, keyof SyncMeta> & Partial<SyncMeta>;

interface DraftMap {
  transactions: Draft<Transaction>;
  savings: Draft<Saving>;
  budgets: Draft<Budget>;
  investments: Draft<Investment>;
  categories: Draft<Category>;
}

const EMPTY: DataSet = { transactions: [], savings: [], budgets: [], investments: [], categories: [] };

interface Persisted {
  data: DataSet;
  queue: Changes;
  since: number;
}

export type SyncState = 'idle' | 'syncing' | 'offline' | 'error';

interface FinLedgerValue {
  status: 'loading' | 'signedOut' | 'ready';
  session: Session | null;
  data: DataSet;
  syncState: SyncState;
  pendingCount: number;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (name: string, email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  save: <K extends ResourceName>(resource: K, record: DraftMap[K]) => Promise<void>;
  remove: (resource: ResourceName, id: string) => Promise<void>;
  sync: () => Promise<void>;
  emailReport: (month: string) => Promise<string>;
  setMonthlyEmail: (enabled: boolean) => Promise<void>;
}

const FinLedgerContext = createContext<FinLedgerValue | null>(null);

/** Newest write wins, matching how the server resolves the same collision. */
const mergeRecords = <T extends { id: string; updatedAt: number }>(existing: T[], incoming: T[]): T[] => {
  const byId = new Map(existing.map((row) => [row.id, row]));
  for (const row of incoming) {
    const current = byId.get(row.id);
    if (!current || row.updatedAt >= current.updatedAt) byId.set(row.id, row);
  }
  return [...byId.values()];
};

const RESOURCES: ResourceName[] = ['transactions', 'savings', 'budgets', 'investments', 'categories'];

const deviceName = (): string => {
  if (Platform.OS === 'web') return 'Browser';
  return Platform.OS === 'ios' ? 'iPhone' : 'Android phone';
};

export const FinLedgerProvider = ({ children }: { children: ReactNode }): React.JSX.Element => {
  const [status, setStatus] = useState<FinLedgerValue['status']>('loading');
  const [session, setSession] = useState<Session | null>(null);
  const [data, setData] = useState<DataSet>(EMPTY);
  const [queue, setQueue] = useState<Changes>({});
  const [since, setSince] = useState(0);
  const [syncState, setSyncState] = useState<SyncState>('idle');

  // Refs keep the sync routine free of stale closures when it runs from a timer.
  const sessionRef = useRef<Session | null>(null);
  const queueRef = useRef<Changes>({});
  const sinceRef = useRef(0);
  const dataRef = useRef<DataSet>(EMPTY);
  const syncing = useRef(false);
  const resyncQueued = useRef(false);

  sessionRef.current = session;
  queueRef.current = queue;
  sinceRef.current = since;
  dataRef.current = data;

  const persist = useCallback(async (userId: string, next: Persisted) => {
    await cacheSet(dataKey(userId), next);
  }, []);

  const applySession = useCallback(async (next: Session | null) => {
    sessionRef.current = next;
    setSession(next);
    if (next) await secureSet(SESSION_KEY, JSON.stringify(next));
    else await secureDelete(SESSION_KEY);
  }, []);

  /** Runs `call` with a valid access token, refreshing once if it has expired. */
  const withAuth = useCallback(
    async <T,>(call: (token: string) => Promise<T>): Promise<T> => {
      const current = sessionRef.current;
      if (!current) throw new ApiError(401, 'signed_out');
      try {
        return await call(current.accessToken);
      } catch (error) {
        if (!isAuthError(error)) throw error;
        const rotated = await api.refresh(current.deviceId, current.refreshToken);
        const next: Session = {
          ...current,
          accessToken: rotated.accessToken,
          refreshToken: rotated.refreshToken,
        };
        await applySession(next);
        return call(next.accessToken);
      }
    },
    [applySession],
  );

  const runSync = useCallback(async () => {
    const current = sessionRef.current;
    if (!current) return;
    setSyncState('syncing');

    const outgoing = queueRef.current;
    const hasOutgoing = RESOURCES.some((name) => (outgoing[name]?.length ?? 0) > 0);

    try {
      const response = hasOutgoing
        ? await withAuth((token) => api.push(token, sinceRef.current, outgoing))
        : await withAuth((token) => api.pull(token, sinceRef.current));

      const merged: DataSet = { ...dataRef.current };
      for (const name of RESOURCES) {
        const incoming = (response.changes?.[name] ?? []) as SyncRecord[];
        if (incoming.length === 0) continue;
        merged[name] = mergeRecords(merged[name] as never[], incoming as never[]);
      }

      /*
       * Drop exactly the versions that went up, never the whole queue: an entry
       * logged while this request was in flight is still pending and clearing
       * blindly would lose it for good. A record the server rejected was still
       * sent, so it leaves too rather than retrying forever.
       */
      const nextQueue: Changes = {};
      for (const name of RESOURCES) {
        const sent = new Map((outgoing[name] ?? []).map((row) => [row.id, row.updatedAt]));
        const stillPending = (queueRef.current[name] ?? []).filter((row) => sent.get(row.id) !== row.updatedAt);
        if (stillPending.length > 0) nextQueue[name] = stillPending;
      }
      setQueue(nextQueue);
      queueRef.current = nextQueue;

      setData(merged);
      dataRef.current = merged;
      setSince(response.serverTime);
      sinceRef.current = response.serverTime;
      setSyncState('idle');
      await persist(current.user.id, { data: merged, queue: nextQueue, since: response.serverTime });
    } catch (error) {
      if (isOffline(error)) {
        setSyncState('offline');
        return;
      }
      if (isAuthError(error)) {
        await applySession(null);
        setStatus('signedOut');
        return;
      }
      setSyncState('error');
    }
  }, [applySession, persist, withAuth]);

  /**
   * Only one sync runs at a time. A request arriving mid-flight sets a flag and
   * runs once the current one finishes, so rapid entries cannot interleave.
   */
  const sync = useCallback(async () => {
    if (syncing.current) {
      resyncQueued.current = true;
      return;
    }
    syncing.current = true;
    try {
      await runSync();
    } finally {
      syncing.current = false;
    }
    if (resyncQueued.current) {
      resyncQueued.current = false;
      await sync();
    }
  }, [runSync]);

  const hydrate = useCallback(
    async (next: Session) => {
      await applySession(next);
      const cached = await cacheGet<Persisted>(dataKey(next.user.id));
      const loaded = cached ?? { data: EMPTY, queue: {}, since: 0 };
      setData(loaded.data);
      dataRef.current = loaded.data;
      setQueue(loaded.queue);
      queueRef.current = loaded.queue;
      setSince(loaded.since);
      sinceRef.current = loaded.since;
      setStatus('ready');
      void sync();
    },
    [applySession, sync],
  );

  useEffect(() => {
    void (async () => {
      const raw = await secureGet(SESSION_KEY);
      if (!raw) {
        setStatus('signedOut');
        return;
      }
      try {
        await hydrate(JSON.parse(raw) as Session);
      } catch {
        setStatus('signedOut');
      }
    })();
    // Restoring the saved session must happen exactly once, on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const signIn = useCallback(
    async (email: string, password: string) => {
      const next = await api.login({ email, password, deviceName: deviceName(), platform: Platform.OS });
      await hydrate(next);
    },
    [hydrate],
  );

  const signUp = useCallback(
    async (name: string, email: string, password: string) => {
      const next = await api.register({ name, email, password, deviceName: deviceName(), platform: Platform.OS });
      await hydrate(next);
    },
    [hydrate],
  );

  const signOut = useCallback(async () => {
    const current = sessionRef.current;
    if (current) await cacheClear([dataKey(current.user.id)]);
    await applySession(null);
    setData(EMPTY);
    dataRef.current = EMPTY;
    setQueue({});
    queueRef.current = {};
    setSince(0);
    sinceRef.current = 0;
    setStatus('signedOut');
  }, [applySession]);

  /**
   * Writes land locally first and are queued for the next sync, so logging an
   * entry on a train works exactly like logging one on wifi.
   */
  const writeLocal = useCallback(
    async (resource: ResourceName, record: SyncRecord) => {
      const merged: DataSet = {
        ...dataRef.current,
        [resource]: mergeRecords(dataRef.current[resource] as never[], [record] as never[]),
      };
      const nextQueue: Changes = {
        ...queueRef.current,
        [resource]: mergeRecords((queueRef.current[resource] ?? []) as never[], [record] as never[]),
      };
      setData(merged);
      dataRef.current = merged;
      setQueue(nextQueue);
      queueRef.current = nextQueue;

      const current = sessionRef.current;
      if (current) await persist(current.user.id, { data: merged, queue: nextQueue, since: sinceRef.current });
      void sync();
    },
    [persist, sync],
  );

  const save = useCallback(
    async <K extends ResourceName>(resource: K, record: DraftMap[K]) => {
      await writeLocal(resource, {
        ...record,
        id: record.id ?? globalThis.crypto.randomUUID(),
        updatedAt: Date.now(),
        deleted: false,
      } as SyncRecord);
    },
    [writeLocal],
  );

  const remove = useCallback(
    async (resource: ResourceName, id: string) => {
      const existing = (dataRef.current[resource] as SyncMeta[]).find((row) => row.id === id);
      await writeLocal(resource, { ...existing, id, updatedAt: Date.now(), deleted: true } as SyncRecord);
    },
    [writeLocal],
  );

  const emailReport = useCallback(
    async (month: string) => {
      const result = await withAuth((token) => api.emailReport(token, month));
      return result.to;
    },
    [withAuth],
  );

  const setMonthlyEmail = useCallback(
    async (enabled: boolean) => {
      const result = await withAuth((token) => api.updateMe(token, { monthlyEmail: enabled }));
      const current = sessionRef.current;
      if (current) await applySession({ ...current, user: result.user });
    },
    [applySession, withAuth],
  );

  const pendingCount = useMemo(
    () => RESOURCES.reduce((total, name) => total + (queue[name]?.length ?? 0), 0),
    [queue],
  );

  const value = useMemo<FinLedgerValue>(
    () => ({
      status,
      session,
      data,
      syncState,
      pendingCount,
      signIn,
      signUp,
      signOut,
      save,
      remove,
      sync,
      emailReport,
      setMonthlyEmail,
    }),
    [status, session, data, syncState, pendingCount, signIn, signUp, signOut, save, remove, sync, emailReport, setMonthlyEmail],
  );

  return <FinLedgerContext.Provider value={value}>{children}</FinLedgerContext.Provider>;
};

export const useFinLedger = (): FinLedgerValue => {
  const value = useContext(FinLedgerContext);
  if (!value) throw new Error('useFinLedger must be used inside FinLedgerProvider');
  return value;
};
