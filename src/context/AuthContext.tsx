import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import * as api from '../api/backend';
import { clearSession, loadSession, saveSession } from '../storage/secureStore';
import { sipEngine } from '../sip/SipEngine';
import { callHistory } from '../storage/callHistory';
// TEMPORARY — Phase 3a foreground-keep-alive-service investigation. Remove
// alongside SipKeepAliveService once Phase 3a's result is known.
import { startKeepAlive, stopKeepAlive } from '../native/sipKeepAlive';
// Phase 3b (minimal) — POST_NOTIFICATIONS (Android 13+) gates whether the
// incoming-call notification can be posted at all; request it up front so
// it's already granted by the time a call arrives, same trigger point as
// the keep-alive service.
import { ensureNotificationPermission } from '../permissions/permissions';
import type { AuthSession } from '../types';

type Status = 'loading' | 'signedOut' | 'signedIn';

export interface AuthValue {
  status: Status;
  session: AuthSession | null;
  error: string | null;
  signIn: (username: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  busy: boolean;
}

// Exported so PermanentCredentialAuthProvider (dev-mode only) can supply the
// same context without RootNavigator/useAuth needing to know which provider
// is active.
export const AuthContext = createContext<AuthValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<Status>('loading');
  const [session, setSession] = useState<AuthSession | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const sessionRef = useRef<AuthSession | null>(null);

  sessionRef.current = session;

  // Route every ended call into the local log, once, for the app's lifetime.
  useEffect(() => {
    callHistory.load();
    sipEngine.onCallEnded = info => callHistory.record(info);
    return () => {
      sipEngine.onCallEnded = null;
    };
  }, []);

  // Restore a previous session on cold start.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const restored = await loadSession();
      if (cancelled) return;
      if (restored) {
        setSession(restored);
        setStatus('signedIn');
        sipEngine
          .start(restored.sip)
          .then(() => {
            startKeepAlive();
            ensureNotificationPermission();
          })
          .catch(e => setError(String(e)));
      } else {
        setStatus('signedOut');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  /**
   * Android will kill the WebSocket during Doze, so the registration is often
   * dead by the time the user reopens the app. Re-pull credentials (they may
   * have rotated) and re-register on every foreground transition.
   */
  useEffect(() => {
    const onChange = async (next: AppStateStatus) => {
      if (next !== 'active') return;
      const current = sessionRef.current;
      if (!current || sipEngine.isRegistered) return;
      try {
        const sip = await api.refreshSipCredentials(current.token);
        const updated: AuthSession = { ...current, sip };
        setSession(updated);
        await saveSession(updated);
        await sipEngine.start(sip);
        startKeepAlive();
        ensureNotificationPermission();
      } catch (e) {
        if (e instanceof api.ApiError && (e.status === 401 || e.status === 403)) {
          await doSignOut();
        }
      }
    };
    const sub = AppState.addEventListener('change', onChange);
    return () => sub.remove();
    // doSignOut is stable (useCallback with no deps that change).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const signIn = useCallback(async (username: string, password: string) => {
    setBusy(true);
    setError(null);
    try {
      const next = await api.login(username, password);
      await saveSession(next);
      setSession(next);
      setStatus('signedIn');
      await sipEngine.start(next.sip);
      startKeepAlive();
      ensureNotificationPermission();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Sign-in failed');
      throw e;
    } finally {
      setBusy(false);
    }
  }, []);

  const doSignOut = useCallback(async () => {
    stopKeepAlive();
    await sipEngine.stop();
    await clearSession();
    setSession(null);
    setStatus('signedOut');
  }, []);

  return (
    <AuthContext.Provider
      value={{ status, session, error, signIn, signOut: doSignOut, busy }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
