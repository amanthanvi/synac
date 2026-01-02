import { workerOk } from './worker.js';

if (!workerOk) {
  throw new Error('workerOk should be true');
}

console.log('synac worker: boot (stub)');
