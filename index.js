/**
 * @format
 */
import 'react-native-gesture-handler';
import 'react-native-get-random-values';
import { Buffer } from 'buffer';
import { AppRegistry } from 'react-native';
import App from './App';
import { name as appName } from './app.json';

// Needed for tar.bz2 model extraction (unbzip2-stream / tar-stream).
global.Buffer = Buffer;

AppRegistry.registerComponent(appName, () => App);
