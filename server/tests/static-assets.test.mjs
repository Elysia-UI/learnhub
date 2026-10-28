import { before, after, test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import express from 'express';
import { mountProductionStatic } from '../static.mjs';

let directory, server, base;
before(async () => {
  directory = await mkdtemp(path.join(os.tmpdir(), 'learnhub-static-'));
  await mkdir(path.join(directory, 'assets'));
  await mkdir(path.join(directory, 'images', 'optimized'), { recursive: true });
  await Promise.all([
    writeFile(path.join(directory, 'index.html'), '<!doctype html><title>LearnHub fixture</title>'),
    writeFile(path.join(directory, 'assets', 'index-AbCd123_.js'), 'export const fixture = true;'),
    writeFile(path.join(directory, 'assets', 'unversioned.js'), 'export const stable = true;'),
    writeFile(path.join(directory, 'images', 'optimized', 'hero.webp'), 'fixture-image-bytes'),
    writeFile(path.join(directory, '.env'), 'STATIC_TEST_FIXTURE=1'),
  ]);
  const app = express();
  app.get('/api/private', (_req, res) => {
    res.set('Cache-Control', 'private, no-store').json({ data: 'private-test-value' });
  });
  app.use('/api', (_req, res) => res.status(404).json({ error: 'NOT_FOUND' }));
  mountProductionStatic(app, directory);
  app.use((error, _req, res, _next) => res.sendStatus(error.status || 500));
  server = app.listen(0, '127.0.0.1');
  await new Promise((resolve, reject) => {
    server.once('listening', resolve);
    server.once('error', reject);
  });
  base = `http://127.0.0.1:${server.address().port}`;
});
after(async () => {
  if (server) await new Promise((resolve) => server.close(resolve));
  if (directory) {
    assert.equal(path.dirname(path.resolve(directory)), path.resolve(os.tmpdir()));
    assert.ok(path.basename(directory).startsWith('learnhub-static-'));
    await rm(directory, { recursive: true, force: true });
  }
});

test('只有带内容哈希的构建文件长期缓存，普通文件要求重新验证', async () => {
  const hashed = await fetch(`${base}/assets/index-AbCd123_.js`);
  assert.equal(hashed.status, 200);
  assert.equal(hashed.headers.get('cache-control'), 'public, max-age=31536000, immutable');
  assert.equal(await hashed.text(), 'export const fixture = true;');
  const stable = await fetch(`${base}/assets/unversioned.js`);
  assert.equal(stable.headers.get('cache-control'), 'no-cache');
});

test('公共图片缓存一天，过期后可使用 ETag 验证而不重复传图', async () => {
  const first = await fetch(`${base}/images/optimized/hero.webp`);
  assert.equal(first.headers.get('cache-control'), 'public, max-age=86400, must-revalidate');
  const etag = first.headers.get('etag');
  assert.ok(etag);
  assert.equal(await first.text(), 'fixture-image-bytes');
  const cached = await fetch(`${base}/images/optimized/hero.webp`, {
    cache: 'no-cache',
    headers: { 'If-None-Match': etag },
  });
  assert.equal(cached.status, 304);
  assert.equal(await cached.text(), '');
});

test('首页及页面路由回退不长期缓存旧 HTML', async () => {
  for (const url of ['/', '/index.html', '/messages/example']) {
    const response = await fetch(base + url);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('cache-control'), 'no-cache');
    assert.match(await response.text(), /LearnHub fixture/);
  }
});

test('业务 API 和私有响应不进入公共静态缓存，未知接口保持 404', async () => {
  const privateResponse = await fetch(`${base}/api/private`);
  assert.equal(privateResponse.headers.get('cache-control'), 'private, no-store');
  assert.deepEqual(await privateResponse.json(), { data: 'private-test-value' });
  const missing = await fetch(`${base}/api/missing`);
  assert.equal(missing.status, 404);
  assert.deepEqual(await missing.json(), { error: 'NOT_FOUND' });
});

test('隐藏配置文件不得由静态目录读出', async () => {
  const response = await fetch(`${base}/.env`);
  const body = await response.text();
  assert.doesNotMatch(body, /STATIC_TEST_FIXTURE/);
  assert.match(body, /LearnHub fixture/);
});
