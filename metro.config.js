const { getDefaultConfig, mergeConfig } = require('@react-native/metro-config');
const path = require('path');

const EMPTY_SHIM = path.resolve(__dirname, 'metro-shims/empty.js');

/**
 * Metro configuration
 * https://reactnative.dev/docs/metro
 *
 * Production-bundle fixup for this no-Expo RN app:
 *
 * `@siteed/sherpa-onnx.rn` eagerly imports `expo-file-system` from its
 * ArchiveService. Model download/extract uses RNFS + Sherpa's native
 * extractTarBz2 and never calls ArchiveService, so `expo-file-system` is
 * stubbed empty. `fs` / `stream` aliases remain for any incidental Node
 * polyfill requires from the Sherpa package graph.
 *
 * @type {import('@react-native/metro-config').MetroConfig}
 */
const config = {
  resolver: {
    extraNodeModules: {
      stream: path.resolve(__dirname, 'node_modules/readable-stream'),
      fs: EMPTY_SHIM,
    },
    resolveRequest: (context, moduleName, platform) => {
      if (
        moduleName === 'expo-file-system' ||
        moduleName.startsWith('expo-file-system/')
      ) {
        return { type: 'sourceFile', filePath: EMPTY_SHIM };
      }
      return context.resolveRequest(context, moduleName, platform);
    },
  },
};

module.exports = mergeConfig(getDefaultConfig(__dirname), config);
