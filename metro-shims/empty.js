// Empty module shim for Node core modules that are referenced by transitive
// dependencies (e.g. tar-stream's `require('fs').constants` guarded by try/catch)
// but never actually exercised on the React Native runtime path.
module.exports = {};
