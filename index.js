/**
 * @format
 */

// MUST be first: installs RTCPeerConnection / mediaDevices on globalThis before
// any module that references them is evaluated.
import './src/sip/polyfills';
// TEMPORARY — investigating the REGISTER 401 issue. Remove once resolved.
import './src/sip/digestAuthDiagnostics';
// TEMPORARY — outbound call setup timing investigation. Remove once resolved.
import './src/sip/callTimingDiagnostics';

import { AppRegistry } from 'react-native';
import App from './App';
import { name as appName } from './app.json';

AppRegistry.registerComponent(appName, () => App);
