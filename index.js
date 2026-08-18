/**
 * @format
 */

// MUST be first: installs RTCPeerConnection / mediaDevices on globalThis before
// any module that references them is evaluated.
import './src/sip/polyfills';

import { AppRegistry } from 'react-native';
import App from './App';
import { name as appName } from './app.json';

AppRegistry.registerComponent(appName, () => App);
