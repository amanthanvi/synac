import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildCodexPrompt,
  codexEventsUseTools,
  codexLaunchCommand,
  safeCodexEnvironment,
  syntheticBatchRecord,
} from './codex-cli.js';

const request = {
  custom_id: 'terra-max-a-0000',
  body: {
    model: 'gpt-5.6-terra',
    reasoning: { effort: 'max' },
    input: [
      {
        role: 'developer',
        content: [{ type: 'input_text', text: 'fixed rubric' }],
      },
      {
        role: 'user',
        content: [{ type: 'input_text', text: '{"entries":[]}' }],
      },
    ],
    text: { format: { schema: { type: 'object' } } },
  },
};

test('subscription runner strips ambient secrets from Codex child environment', () => {
  const safe = safeCodexEnvironment({
    PATH: 'bin',
    USERPROFILE: 'profile',
    OPENAI_API_KEY: 'secret',
    GH_TOKEN: 'secret',
    OP_SESSION_test: 'secret',
    CONVEX_DEPLOY_KEY: 'secret',
  });
  assert.deepEqual(safe, { PATH: 'bin', USERPROFILE: 'profile' });
});

test('subscription prompt forbids tools and preserves role-separated payloads', () => {
  const prompt = buildCodexPrompt(request);
  assert.match(prompt, /Do not use tools/);
  assert.match(prompt, /DEVELOPER INSTRUCTIONS:\nfixed rubric/);
  assert.match(prompt, /USER INSTRUCTIONS:\n\{"entries":\[\]\}/);
});

test('subscription output converts to the collector Batch envelope', () => {
  const output = '{"results":[]}';
  const record = syntheticBatchRecord(request.custom_id, output);
  assert.equal(record.custom_id, request.custom_id);
  assert.equal(record.response.status_code, 200);
  assert.equal(record.response.body.model, 'gpt-5.6-terra');
  assert.equal(record.response.body.output[0]?.content[0]?.text, output);
  assert.equal(record.error, null);
});

test('Windows subscription launch bypasses the npm command shim without a shell', () => {
  const launch = codexLaunchCommand('win32', 'C:\\nvm4w\\nodejs\\node.exe', [
    'exec',
    '--ephemeral',
  ]);
  assert.equal(launch.executable, 'C:\\nvm4w\\nodejs\\node.exe');
  assert.match(
    launch.args[0] ?? '',
    /node_modules[\\/]@openai[\\/]codex[\\/]bin[\\/]codex\.js$/,
  );
  assert.deepEqual(launch.args.slice(1), ['exec', '--ephemeral']);
});

test('subscription event gate rejects tool use and accepts final messages', () => {
  assert.equal(
    codexEventsUseTools(
      '{"type":"item.completed","item":{"type":"agent_message"}}\n',
    ),
    false,
  );
  assert.equal(
    codexEventsUseTools(
      '{"type":"item.started","item":{"type":"command_execution"}}\n',
    ),
    true,
  );
});
