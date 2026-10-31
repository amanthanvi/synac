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

test('RangeError on the final error is FAIL', () => {
  const log = [
    'retry 1 failed: getaddrinfo ENOTFOUND www.rfc-editor.org',
    'RangeError: Invalid array length',
  ].join('\n');
  assert.equal(ingestNetworkUnreachable(log), false);
});

test('a custom error on the final error is FAIL', () => {
  const log = [
    'retry 1 failed: getaddrinfo ENOTFOUND www.rfc-editor.org',
    'AdapterError: parser failed',
  ].join('\n');
  assert.equal(ingestNetworkUnreachable(log), false);
});

test('a bracketed Error after a fetch-failed retry is FAIL', () => {
  const log = [
    'retry 1 failed: TypeError: fetch failed',
    "[Error: Unexpected token '<' is not valid JSON]",
  ].join('\n');
  assert.equal(ingestNetworkUnreachable(log), false);
});

test('a later RangeError, ZodError, or IngestError wins over TypeError: fetch failed', () => {
  const earlier = [
    'TypeError: fetch failed',
    '    at node:internal/deps/undici/undici:14902:13',
    '    [cause]: Error: getaddrinfo ENOTFOUND www.rfc-editor.org',
  ];
  for (const finalLine of [
    'RangeError: Invalid array length',
    'ZodError: invalid document',
    'IngestError: parser rejected the document',
    "[Error: Unexpected token '<' is not valid JSON]",
    "Unexpected token '<' is not valid JSON",
  ]) {
    const log = [...earlier, finalLine].join('\n');
    assert.equal(ingestNetworkUnreachable(log), false, finalLine);
  }
});

test('a warning line is not an error name', () => {
  const stolen = [
    "SyntaxError: Unexpected token '<'",
    'warning: getaddrinfo ENOTFOUND www.rfc-editor.org',
  ].join('\n');
  assert.equal(ingestNetworkUnreachable(stolen), false);
  const kept = [
    'TypeError: fetch failed',
    '    [cause]: Error: getaddrinfo ENOTFOUND www.rfc-editor.org',
    'warning: leaving files in place',
  ].join('\n');
  assert.equal(ingestNetworkUnreachable(kept), true);
});

test('an indented ENOTFOUND frame does not make a parser error INCONCLUSIVE', () => {
  const log = [
    'TypeError: fetch failed',
    '    at node:internal/deps/undici/undici:14902:13',
    '    Error: getaddrinfo ENOTFOUND www.rfc-editor.org',
    "SyntaxError: Unexpected token '<'",
    '    at JSON.parse (<anonymous>)',
    '    at parse (ingest.js:10:5)',
    '    Error: getaddrinfo ENOTFOUND www.rfc-editor.org',
    '\u2009ELIFECYCLE\u2009 Command failed with exit code 1.',
  ].join('\n');
  assert.equal(ingestNetworkUnreachable(log), false);
});

// Captured from Node v24.22.0 `console.error` of a failed fetch. The last line is only `}`.
const node24FetchDump = `[TypeError: fetch failed] {
  [cause]: Error: getaddrinfo ENOTFOUND www.rfc-editor.invalid
      at GetAddrInfoReqWrap.onlookupall [as oncomplete] (node:dns:123:26) {
    errno: -3008,
    code: 'ENOTFOUND',
    syscall: 'getaddrinfo',
    hostname: 'www.rfc-editor.invalid'
  }
}`;

test('a Node 24 fetch error dump ending in a brace is INCONCLUSIVE', () => {
  assert.match(node24FetchDump, /^\[TypeError: fetch failed\] \{$/m);
  assert.equal(node24FetchDump.trim().split('\n').at(-1), '}');
  assert.equal(ingestNetworkUnreachable(node24FetchDump), true);
});

test(
  'a live fetch dump is INCONCLUSIVE when SYNAC_VERIFY_LIVE_FETCH=1',
  { skip: process.env.SYNAC_VERIFY_LIVE_FETCH !== '1' },
  () => {
    const result = spawnSync(
      process.execPath,
      [
        '--input-type=module',
        '-e',
        [
          'try {',
          "  await fetch('https://www.rfc-editor.invalid/rfc/rfc4949.txt');",
          '} catch (error) {',
          '  console.error(error);',
          '}',
        ].join('\n'),
      ],
      { encoding: 'utf8', timeout: 15000 },
    );
    assert.equal(result.status, 0);
    const dump = result.stderr;
    assert.match(dump, /fetch failed/);
    assert.equal(ingestNetworkUnreachable(dump), true);
  },
);

test('the ingest CLI fetch failed line is INCONCLUSIVE', () => {
  const log = [
    '$ pnpm --filter @synac/ingest-tools ingest -- --source rfc4949',
    '✗ rfc4949: fetch failed',
  ].join('\n');
  assert.equal(ingestNetworkUnreachable(log), true);
  assert.equal(
    ingestNetworkUnreachable('✗ rfc4949: fetch failed (404)'),
    false,
  );
});

test('cli.mjs --help runs through the .cursor skill symlink', () => {
  const result = spawnSync(
    process.execPath,
    ['.cursor/skills/verify-synac/scripts/cli.mjs', '--help'],
    {
      cwd: fileURLToPath(new URL('../../../..', import.meta.url)),
      encoding: 'utf8',
    },
  );
  assert.equal(result.status, 0);
  assert.match(result.stdout, /Usage: node/);
});
