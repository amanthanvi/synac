import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

import { ingestNetworkUnreachable } from './cli.mjs';

test('ENOTFOUND on the final error is INCONCLUSIVE', () => {
  const log = [
    '$ pnpm ingest',
    'exit 1',
    '✗ rfc4949: getaddrinfo ENOTFOUND www.rfc-editor.org',
  ].join('\n');
  assert.equal(ingestNetworkUnreachable(log), true);
});

test('HTTP 404 on the final error is FAIL', () => {
  const log = [
    '✗ rfc4949: RFC 4949 fetch failed (404) for https://www.rfc-editor.org/rfc/rfc4949.txt',
  ].join('\n');
  assert.equal(ingestNetworkUnreachable(log), false);
});

test('a parser error is FAIL', () => {
  const log = "✗ rfc4949: Unexpected token '<' is not valid JSON";
  assert.equal(ingestNetworkUnreachable(log), false);
});

test('a retry followed by a parser error is FAIL', () => {
  const log = [
    'retry 1 failed: getaddrinfo ENOTFOUND www.rfc-editor.org',
    'TypeError: fetch failed',
    "✗ rfc4949: Unexpected token '<' is not valid JSON",
  ].join('\n');
  assert.equal(ingestNetworkUnreachable(log), false);
});

test('a network cause on the final error is INCONCLUSIVE', () => {
  const log = [
    '✗ rfc4949: TypeError: fetch failed',
    '    [cause]: Error: getaddrinfo ENOTFOUND www.rfc-editor.org',
  ].join('\n');
  assert.equal(ingestNetworkUnreachable(log), true);
});

test('an HTTP status in the final cause is FAIL', () => {
  const log = [
    'retry 1 failed: getaddrinfo ENOTFOUND www.rfc-editor.org',
    '✗ rfc4949: TypeError: fetch failed',
    '    [cause]: Error: fetch failed (503)',
  ].join('\n');
  assert.equal(ingestNetworkUnreachable(log), false);
});

test('cli.mjs --help runs through the .cursor skill symlink', () => {
  const result = spawnSync(
    process.execPath,
    ['.cursor/skills/verify-synac/scripts/cli.mjs', '--help'],
    { cwd: fileURLToPath(new URL('../../../..', import.meta.url)), encoding: 'utf8' },
  );
  assert.equal(result.status, 0);
  assert.match(result.stdout, /Usage: node/);
});
