/* =====================================================================
   HRČKOVA KROGLA — editor/gen-worker.js: generator naključnih prog v Web Workerju
   (UI ne zmrzne). Sporočila: → { opts }  ← { type: 'progress', k, tries } | { type: 'done', res } | { type: 'error', message }
   ===================================================================== */
import { generateSteps } from './generate.js';

self.onmessage = e => {
  try {
    const it = generateSteps(e.data.opts || {});
    for (;;) {
      const s = it.next();
      if (s.done) { self.postMessage({ type: 'done', res: s.value }); break; }
      self.postMessage({ type: 'progress', ...s.value });
    }
  } catch (err) {
    self.postMessage({ type: 'error', message: String(err?.message || err) });
  }
};
