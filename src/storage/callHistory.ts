import AsyncStorage from '@react-native-async-storage/async-storage';
import { ENV } from '../config/env';
import { Emitter } from '../sip/emitter';
import type { CallLogEntry, CallLogOutcome } from '../types';
import type { CallEndedInfo } from '../sip/SipEngine';

const KEY = 'egovoip.callLog.v1';

/**
 * Local call log. Kept separate from the device's system call log: Android will
 * not let a non-default dialer write to CallLog.Calls, and asking for
 * WRITE_CALL_LOG triggers a Play Store policy review you almost certainly do
 * not want on a business softphone.
 */
class CallHistoryStore extends Emitter {
  private entries: CallLogEntry[] = [];
  private loaded = false;
  private writeQueue: Promise<void> = Promise.resolve();

  getSnapshot = (): CallLogEntry[] => this.entries;

  async load(): Promise<void> {
    if (this.loaded) return;
    try {
      const raw = await AsyncStorage.getItem(KEY);
      this.entries = raw ? (JSON.parse(raw) as CallLogEntry[]) : [];
    } catch {
      this.entries = [];
    }
    this.loaded = true;
    this.emit();
  }

  record(info: CallEndedInfo): void {
    const outcome: CallLogOutcome = info.missed
      ? 'missed'
      : info.direction === 'inbound'
      ? 'incoming'
      : 'outgoing';

    const entry: CallLogEntry = {
      id: `${info.startedAt}-${info.number}-${Math.random().toString(36).slice(2, 8)}`,
      number: info.number,
      name: info.name,
      outcome,
      startedAt: info.startedAt,
      durationSec: info.durationSec,
    };

    this.entries = [entry, ...this.entries].slice(0, ENV.CALL_LOG_LIMIT);
    this.emit();
    this.persist();
  }

  clear(): void {
    this.entries = [];
    this.emit();
    this.persist();
  }

  /** Serialise writes so two calls ending together cannot interleave. */
  private persist(): void {
    const payload = JSON.stringify(this.entries);
    this.writeQueue = this.writeQueue
      .then(() => AsyncStorage.setItem(KEY, payload))
      .catch(err => console.warn('[callLog] persist failed', err));
  }
}

export const callHistory = new CallHistoryStore();
