/**
 * Injected into the WebView before content loads.
 * Emulates enough of Tauri's `window.__TAURI_INTERNALS__` for
 * `@tauri-apps/api/core` invoke + `@tauri-apps/api/event` listen.
 */
export const TAURI_SHIM_JS = `
(function () {
  if (window.__TAURI_INTERNALS__) return;

  var pending = {};
  var callbacks = new Map();
  var eventListeners = new Map();
  var nextCb = 1;
  var nextEventId = 1;

  function post(msg) {
    try {
      window.ReactNativeWebView.postMessage(JSON.stringify(msg));
    } catch (e) {
      console.warn('[bridge] postMessage failed', e);
    }
  }

  function registerCallback(callback, once) {
    var id = nextCb++;
    callbacks.set(id, function (data) {
      if (once) callbacks.delete(id);
      if (callback) callback(data);
    });
    return id;
  }

  function unregisterCallback(id) {
    callbacks.delete(id);
  }

  function runCallback(id, data) {
    var cb = callbacks.get(id);
    if (cb) cb(data);
  }

  function handleEventPlugin(cmd, args) {
    if (cmd === 'plugin:event|listen') {
      var event = args.event;
      var handler = args.handler;
      if (!eventListeners.has(event)) eventListeners.set(event, []);
      eventListeners.get(event).push(handler);
      return handler;
    }
    if (cmd === 'plugin:event|unlisten') {
      var list = eventListeners.get(args.event);
      if (list) {
        var idx = list.indexOf(args.id);
        if (idx !== -1) list.splice(idx, 1);
      }
      unregisterCallback(args.id);
      return null;
    }
    if (cmd === 'plugin:event|emit') {
      var handlers = eventListeners.get(args.event) || [];
      for (var i = 0; i < handlers.length; i++) {
        runCallback(handlers[i], {
          event: args.event,
          id: nextEventId++,
          payload: args.payload,
        });
      }
      return null;
    }
    return null;
  }

  async function invoke(cmd, args, _options) {
    args = args || {};
    if (typeof cmd === 'string' && cmd.indexOf('plugin:event|') === 0) {
      return handleEventPlugin(cmd, args);
    }
    return new Promise(function (resolve, reject) {
      var id = 'inv_' + Date.now() + '_' + Math.random().toString(36).slice(2);
      pending[id] = { resolve: resolve, reject: reject };
      post({ type: 'invoke', id: id, cmd: cmd, args: args });
      setTimeout(function () {
        if (pending[id]) {
          delete pending[id];
          reject(new Error('Native invoke timeout: ' + cmd));
        }
      }, 600000);
    });
  }

  window.__FT_BRIDGE_RESOLVE__ = function (id, payload) {
    var p = pending[id];
    if (!p) return;
    delete pending[id];
    if (payload && payload.ok) p.resolve(payload.result);
    else p.reject(new Error((payload && payload.error) || 'native-error'));
  };

  window.__FT_BRIDGE_EMIT__ = function (event, payload) {
    var handlers = eventListeners.get(event) || [];
    for (var i = 0; i < handlers.length; i++) {
      runCallback(handlers[i], {
        event: event,
        id: nextEventId++,
        payload: payload,
      });
    }
  };

  window.__TAURI_INTERNALS__ = {
    invoke: invoke,
    transformCallback: registerCallback,
    unregisterCallback: unregisterCallback,
    runCallback: runCallback,
    callbacks: callbacks,
    convertFileSrc: function (filePath, protocol) {
      protocol = protocol || 'asset';
      return protocol + '://localhost/' + encodeURIComponent(filePath);
    },
    metadata: {
      currentWindow: { label: 'main' },
      currentWebview: { windowLabel: 'main', label: 'main' },
    },
  };

  window.__TAURI_EVENT_PLUGIN_INTERNALS__ = {
    unregisterListener: function (event, id) {
      unregisterCallback(id);
    },
  };

  window.__RN_BRIDGE__ = true;
  window.isTauri = true;
})();
true;
`.trim();
