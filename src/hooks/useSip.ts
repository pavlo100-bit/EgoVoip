import { useSyncExternalStore } from 'react';
import { sipEngine } from '../sip/SipEngine';
import type { SipSnapshot } from '../types';

/**
 * The single subscription point between the SIP singleton and React. The engine
 * hands back a cached snapshot object that only changes identity when something
 * actually changed, which is exactly useSyncExternalStore's contract.
 */
export function useSip(): SipSnapshot {
  return useSyncExternalStore(sipEngine.subscribe, sipEngine.getSnapshot);
}
