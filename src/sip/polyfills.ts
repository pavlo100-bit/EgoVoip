/**
 * Must be imported once, before anything touches JsSIP.
 *
 * registerGlobals() installs RTCPeerConnection, MediaStream, MediaStreamTrack
 * and navigator.mediaDevices on globalThis. JsSIP resolves those by name at
 * module scope, so the order matters — import this from index.js, not from a
 * screen.
 */
import { registerGlobals } from 'react-native-webrtc';

registerGlobals();

// JsSIP reads navigator.userAgent when building the User-Agent header.
const nav = (globalThis as { navigator?: { userAgent?: string } }).navigator;
if (nav && !nav.userAgent) {
  nav.userAgent = 'EgoVoip/1.0 (React Native)';
}

export {};
