import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';

// Import configuration with a local placeholder; no database connection or
// saved credential access is involved in these proxy tests.
process.env.DB_HOST = '127.0.0.1';
process.env.DB_NAME = 'learnhub';
process.env.DB_USER = 'proxy-test';
process.env.DB_PASSWORD = 'proxy-test-only';
const { parseTrustProxy } = await import('../config.mjs');
let server, base;
const app = express();
app.set('trust proxy', parseTrustProxy());
app.get('/', (req, res) => res.json({ ip: req.ip, protocol: req.protocol, secure: req.secure }));

before(async () => {
  server = app.listen(0, '127.0.0.1');
  await new Promise((resolve, reject) => {
    server.once('listening', resolve);
    server.once('error', reject);
  });
  base = `http://127.0.0.1:${server.address().port}`;
});
after(async () => {
  if (server) await new Promise((resolve) => server.close(resolve));
});

test('默认只信本机代理，可明确关闭或配置可信地址', () => {
  assert.equal(parseTrustProxy(), 'loopback');
  assert.equal(parseTrustProxy('off'), false);
  assert.equal(parseTrustProxy('false'), false);
  assert.deepEqual(parseTrustProxy('loopback, 10.1.2.3/32, ::1'), [
    'loopback',
    '10.1.2.3/32',
    '::1',
  ]);
});

test('拒绝布尔开关、跳数、全部网络及无效地址', () => {
  for (const value of [
    'true',
    '1',
    '*',
    '0.0.0.0/0',
    '::/0',
    '10.1.2.3/99',
    '10.1.2.3/x',
    'loopback,',
    'example.com',
  ]) {
    assert.throws(() => parseTrustProxy(value), /TRUST_PROXY/);
  }
});

test('本机反向代理正确恢复访客 IP 与 HTTPS 协议', async () => {
  const result = await fetch(base, {
    headers: { 'X-Forwarded-For': '203.0.113.24', 'X-Forwarded-Proto': 'https' },
  });
  assert.deepEqual(await result.json(), { ip: '203.0.113.24', protocol: 'https', secure: true });
});

test('遇到不可信的上游跳点时停止，不能信任任意转发链', async () => {
  const result = await fetch(base, {
    headers: { 'X-Forwarded-For': '203.0.113.24, 198.51.100.11' },
  });
  const body = await result.json();
  assert.equal(body.ip, '198.51.100.11');
});
