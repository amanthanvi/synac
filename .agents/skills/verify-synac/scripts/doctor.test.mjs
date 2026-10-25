import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { test } from 'node:test';

import { runDoctor } from './doctor.mjs';

function listen(server) {
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (!address || typeof address === 'string') {
        reject(new Error('doctor test server has no port'));
        return;
      }
      resolve(address.port);
    });
  });
}

function close(server, sockets) {
  for (const socket of sockets) socket.destroy();
  return new Promise((resolve) => server.close(() => resolve()));
}

test('healthz 500 is not READY', async () => {
  const sockets = new Set();
  const server = createServer((request, response) => {
    if (request.url === '/api/healthz') {
      response.writeHead(500, { 'content-type': 'application/json' });
      response.end('{"error":"down"}');
      return;
    }
    if (request.url === '/') {
      response.writeHead(200, { 'content-type': 'text/html' });
      response.end('<html>Glossary search</html>');
      return;
    }
    response.writeHead(200, { 'content-type': 'application/json' });
    response.end('{"meta":{"total":3}}');
  });
  server.on('connection', (socket) => {
    sockets.add(socket);
    socket.on('close', () => sockets.delete(socket));
  });
  const port = await listen(server);
  try {
    const report = await runDoctor(`http://127.0.0.1:${port}`);
    assert.equal(report.status, 'NOT_READY');
    assert.equal(report.code, 'empty-dataset');
    assert.equal(report.healthz.status, 500);
    assert.equal(report.healthz.ok, false);
  } finally {
    await close(server, sockets);
  }
});

test('a response body that cannot be read is classified', async () => {
  const sockets = new Set();
  const server = createServer((_request, response) => {
    response.writeHead(200, {
      'content-type': 'text/plain',
      'content-length': '100',
    });
    response.write('partial');
    response.socket?.destroy();
  });
  server.on('connection', (socket) => {
    sockets.add(socket);
    socket.on('close', () => sockets.delete(socket));
  });
  const port = await listen(server);
  try {
    const report = await runDoctor(`http://127.0.0.1:${port}`);
    assert.equal(report.status, 'NOT_READY');
    assert.equal(report.code, 'unreachable');
    assert.equal(typeof report.detail, 'string');
  } finally {
    await close(server, sockets);
  }
});

test('a closed port stays unreachable', async () => {
  const server = createServer();
  const port = await listen(server);
  await close(server, []);
  const report = await runDoctor(`http://127.0.0.1:${port}`);
  assert.equal(report.status, 'NOT_READY');
  assert.equal(report.code, 'unreachable');
});

test(
  'a fetch that never answers is a timeout',
  { timeout: 20_000 },
  async () => {
    const sockets = new Set();
    const server = createServer(() => {});
    server.on('connection', (socket) => {
      sockets.add(socket);
      socket.on('close', () => sockets.delete(socket));
    });
    const port = await listen(server);
    try {
      const report = await runDoctor(`http://127.0.0.1:${port}`);
      assert.equal(report.status, 'NOT_READY');
      assert.equal(report.code, 'timeout');
    } finally {
      await close(server, sockets);
    }
  },
);
