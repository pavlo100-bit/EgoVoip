/**
 * TEMPORARY, dev/test-only — see src/sip/permanentCredentialTest.ts. Drop-in
 * replacement for AuthProvider that skips the backend entirely: no
 * /auth/login, no get_key, no get_webphone_data. Starts SipEngine directly
 * with the permanent SIP credentials from the local, gitignored
 * permanentSipTest.local.ts, then renders through the exact same AuthContext
 * RootNavigator already consumes — so the real dialer UI (Recents, Dialer,
 * Contacts, ActiveCallScreen, IncomingCallScreen) needs zero changes to work
 * in this mode.
 *
 * Only ever mounted when permanentCredentialTestEnabled is true (App.tsx) —
 * i.e. only when a developer has filled in permanentSipTest.local.ts
 * locally. Every normal build still goes through the real AuthProvider,
 * completely unaffected.
 *
 * Deliberately does NOT replicate AuthProvider's foreground re-registration
 * (AppState listener that calls api.refreshSipCredentials) — that's a
 * backend call, forbidden in this mode, and background/foreground recovery
 * is explicitly out of scope for now. If registration drops (e.g. from
 * Android backgrounding — see the 1006 disconnect investigation), restart
 * the app to re-register; this mode is for a single foregrounded test
 * session, not continuous background operation.
 */
import React, { useEffect } from 'react';
import { AuthContext, type AuthValue } from './AuthContext';
import { sipEngine } from '../sip/SipEngine';
import { callHistory } from '../storage/callHistory';
import { startPermanentCredentialTest } from '../sip/permanentCredentialTest';

export function PermanentCredentialAuthProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    // Same wiring AuthProvider does, so Recents/call history work normally.
    callHistory.load();
    sipEngine.onCallEnded = info => callHistory.record(info);
    startPermanentCredentialTest();
    return () => {
      sipEngine.onCallEnded = null;
    };
  }, []);

  const value: AuthValue = {
    status: 'signedIn',
    session: null,
    error: null,
    signIn: async () => {
      throw new Error('Permanent-credential dev mode does not support manual sign-in');
    },
    signOut: async () => {
      await sipEngine.stop();
    },
    busy: false,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
