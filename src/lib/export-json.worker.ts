self.onmessage = (ev: MessageEvent<unknown>) => {
  try {
    const json = JSON.stringify(ev.data, null, 2);
    self.postMessage({ ok: true as const, json });
  } catch (e) {
    self.postMessage({
      ok: false as const,
      error: e instanceof Error ? e.message : String(e),
    });
  }
};
