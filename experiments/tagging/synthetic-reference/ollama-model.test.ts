import assert from 'node:assert/strict';
import test from 'node:test';

import {
  parseOllamaImmutableModelId,
  verifyInstalledOllamaModels,
} from './ollama-model.ts';

test('strict Ollama immutable ID parser separates installed tag and digest pin', () => {
  assert.deepEqual(
    parseOllamaImmutableModelId('ollama:qwen3:8b@500a1f067a9f'),
    {
      immutableModelId: 'ollama:qwen3:8b@500a1f067a9f',
      actualTag: 'qwen3:8b',
      pinnedDigest: '500a1f067a9f',
    },
  );
  assert.throws(
    () => parseOllamaImmutableModelId('qwen3:8b'),
    /ollama:<actual-tag>/,
  );
  assert.throws(
    () => parseOllamaImmutableModelId('ollama:qwen3:8b@500A1F067A9F'),
    /12-hex-digest/,
  );
});

test('Ollama catalog verification fails before inference on digest mismatch', async () => {
  let calls = 0;
  await assert.rejects(
    verifyInstalledOllamaModels(
      'http://127.0.0.1:11434',
      ['ollama:qwen3:8b@500a1f067a9f'],
      async () => {
        calls += 1;
        return {
          status: 200,
          body: {
            models: [
              {
                name: 'qwen3:8b',
                digest: '0'.repeat(64),
              },
            ],
          },
        };
      },
    ),
    /digest drift/,
  );
  assert.equal(calls, 1);
});

test('Ollama catalog requires its plain lowercase 64-hex digest shape', async () => {
  await assert.rejects(
    verifyInstalledOllamaModels(
      'http://127.0.0.1:11434',
      ['ollama:qwen3:8b@500a1f067a9f'],
      async () => ({
        status: 200,
        body: {
          models: [
            {
              name: 'qwen3:8b',
              digest: `sha256:500a1f067a9f${'0'.repeat(52)}`,
            },
          ],
        },
      }),
    ),
    /invalid installed digest/,
  );
});
