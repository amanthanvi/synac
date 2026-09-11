/**
 * Package entrypoint. The worker itself lives in `worker.ts`; this file only
 * boots it, so `node dist/index.js` and `tsx src/index.ts` both start the real
 * process rather than a stub.
 */
import './worker.js';
