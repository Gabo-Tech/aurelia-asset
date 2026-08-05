/**
 * @format
 */
import 'react-native-gesture-handler';
import 'react-native-get-random-values';
import { Buffer } from 'buffer';
import { AppRegistry } from 'react-native';
import App from './App';
import { name as appName } from './app.json';

// Buffer polyfill (used by various native/JS bridges).
global.Buffer = Buffer;

AppRegistry.registerComponent(appName, () => App);
