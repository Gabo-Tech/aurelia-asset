const { getDefaultConfig, mergeConfig } = require('@react-native/metro-config');
const path = require('path');

const EMPTY_SHIM = path.resolve(__dirname, 'metro-shims/empty.js');

/**
 * Metro configuration
 * https://reactnative.dev/docs/metro
 *
 * Two production-bundle fixups for this no-Expo RN app:
 *
 * 1. The tar.bz2 model-extraction path (src/lib/ai/downloads.ts) pulls in
 *    `tar-stream` / `unbzip2-stream` / `through`, which reference Node core
 *    modules. `events` / `buffer` / `string_decoder` / `process` resolve to
 *    real installed npm packages; `stream` has no npm package of that name so
 *    it is aliased to `readable-stream`, and `fs` (only touched in a try/catch
 *    fallback) is stubbed empty.
 *
 * 2. `@siteed/sherpa-onnx.rn` eagerly imports `expo-file-system` from its
 *    ArchiveService. This project does its own downloads/extraction (RNFS +
 *    tar-stream) and never calls ArchiveService, so `expo-file-system` is
 *    stubbed to an empty module to keep the bundle Expo-free.
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
