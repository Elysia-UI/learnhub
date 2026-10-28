import { before, after, test } from 'node:test';
import assert from 'node:assert/strict';
import { randomFillSync } from 'node:crypto';
import { mkdtemp, writeFile, readFile, readdir, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import express from 'express';
import sharp from 'sharp';
import { acceptsWebp, convertAvatar, createAvatarResponder } from '../services/avatar-images.mjs';

let directory, server, base, original;
const calls = new Map();
let active = 0,
  peak = 0;

before(async () => {
  directory = await mkdtemp(path.join(os.tmpdir(), 'learnhub-avatar-'));
  original = await sharp(randomFillSync(Buffer.alloc(640 * 640 * 3)), {
    raw: { width: 640, height: 640, channels: 3 },
  })
    .png()
    .toBuffer();
  const tiny = await sharp({ create: { width: 1, height: 1, channels: 3, background: 'red' } })
    .png()
    .toBuffer();
  await Promise.all([
    ...['primary', 'deduplicate', ...Array.from({ length: 6 }, (_, i) => `parallel-${i}`)].map(
      (name) => writeFile(path.join(directory, `avatar-${name}.png`), original),
    ),
    writeFile(path.join(directory, 'avatar-tiny.png'), tiny),
    writeFile(path.join(directory, 'avatar-broken.png'), Buffer.alloc(40000, 1)),
    writeFile(path.join(directory, 'resource-private.png'), original),
  ]);
  const app = express();
  app.get(
    '/api/uploads/:name',
    createAvatarResponder(directory, {
      async transform(source) {
        const key = path.basename(source);
        calls.set(key, (calls.get(key) || 0) + 1);
        active++;
        peak = Math.max(peak, active);
        try {
          await new Promise((resolve) => setTimeout(resolve, 25));
          return await convertAvatar(source);
        } finally {
          active--;
        }
      },
    }),
  );
  app.use((_req, res) => res.sendStatus(404));
  app.use((error, _req, res, _next) => {
    res
      .set('Cache-Control', 'no-store')
      .status(error.status || 500)
      .json({ error: error.message });
  });
  server = app.listen(0, '127.0.0.1');
  await new Promise((resolve, reject) => {
    server.once('listening', resolve);
    server.once('error', reject);
  });
  base = `http://127.0.0.1:${server.address().port}/api/uploads/`;
});
after(async () => {
  if (server) await new Promise((resolve) => server.close(resolve));
  if (directory) {
    assert.equal(path.dirname(path.resolve(directory)), path.resolve(os.tmpdir()));
    assert.ok(path.basename(directory).startsWith('learnhub-avatar-'));
    await rm(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  }
});

const request = (name, options = {}) => fetch(base + name, options);
const webp = (name) =>
  request(name, { headers: { Accept: 'image/avif,image/webp,image/*;q=0.8' } });

test('仅显式接受且未禁用 WebP 的客户端使用新编码', () => {
  assert.equal(acceptsWebp('image/avif,image/webp,image/*;q=0.8'), true);
  assert.equal(acceptsWebp('*/*'), false);
  assert.equal(acceptsWebp('image/*'), false);
  assert.equal(acceptsWebp('image/webp;q=0,image/png'), false);
  assert.equal(acceptsWebp('image/webp;q=0.5'), true);
  assert.equal(acceptsWebp('image/webp;q=broken'), false);
  assert.equal(acceptsWebp('image/png'), false);
  assert.equal(acceptsWebp(''), false);
  assert.equal(acceptsWebp(), false);
});

test('真实 PNG 转为更小的 320px WebP，原图与原 URL 保持不变', async () => {
  const response = await webp('avatar-primary.png');
  assert.equal(response.status, 200);
  assert.match(response.headers.get('content-type'), /^image\/webp/);
  assert.match(response.headers.get('vary'), /Accept/);
  assert.equal(response.headers.get('cache-control'), 'public,max-age=3600');
  const result = Buffer.from(await response.arrayBuffer());
  const metadata = await sharp(result).metadata();
  assert.equal(metadata.format, 'webp');
  assert.equal(metadata.width, 320);
  assert.equal(metadata.height, 320);
  assert.ok(result.length < original.length);
  assert.deepEqual(await readFile(path.join(directory, 'avatar-primary.png')), original);

  const fallback = await request('avatar-primary.png');
  assert.match(fallback.headers.get('content-type'), /^image\/png/);
  assert.match(fallback.headers.get('vary'), /Accept/);
  assert.deepEqual(Buffer.from(await fallback.arrayBuffer()), original);
  assert.notEqual(fallback.headers.get('etag'), response.headers.get('etag'));
});

test('缓存副本复用并正确响应 WebP 的条件请求', async () => {
  const first = await webp('avatar-primary.png');
  const etag = first.headers.get('etag');
  await first.arrayBuffer();
  const response = await request('avatar-primary.png', {
    cache: 'no-cache',
    headers: { Accept: 'image/webp', 'If-None-Match': etag },
  });
  assert.equal(response.status, 304);
  assert.match(response.headers.get('vary'), /Accept/);
  assert.equal(await response.text(), '');
  assert.equal(calls.get('avatar-primary.png'), 1);
  const unsupported = await request('avatar-primary.png', {
    cache: 'no-cache',
    headers: { Accept: 'image/png', 'If-None-Match': etag },
  });
  assert.equal(unsupported.status, 200);
  assert.deepEqual(Buffer.from(await unsupported.arrayBuffer()), original);
});

test('同一原文件并发请求只转换一次', async () => {
  const results = await Promise.all(
    Array.from({ length: 10 }, async () => {
      const response = await webp('avatar-deduplicate.png');
      assert.equal(response.status, 200);
      assert.match(response.headers.get('content-type'), /^image\/webp/);
      return Buffer.from(await response.arrayBuffer());
    }),
  );
  assert.equal(calls.get('avatar-deduplicate.png'), 1);
  assert.ok(results.every((result) => result.equals(results[0])));
});

test('不同文件转换最多同时执行两次', async () => {
  peak = 0;
  await Promise.all(
    Array.from({ length: 6 }, async (_, i) => {
      const response = await webp(`avatar-parallel-${i}.png`);
      assert.match(response.headers.get('content-type'), /^image\/webp/);
      await response.arrayBuffer();
    }),
  );
  assert.equal(peak, 2);
});

test('小原图直接返回，解码失败也回原图且不反复转换', async () => {
  const tiny = await webp('avatar-tiny.png');
  assert.match(tiny.headers.get('content-type'), /^image\/png/);
  assert.equal(calls.get('avatar-tiny.png'), undefined);
  assert.deepEqual(
    Buffer.from(await tiny.arrayBuffer()),
    await readFile(path.join(directory, 'avatar-tiny.png')),
  );
  for (let i = 0; i < 2; i++) {
    const broken = await webp('avatar-broken.png');
    assert.equal(broken.status, 200);
    assert.match(broken.headers.get('content-type'), /^image\/png/);
    assert.equal((await broken.arrayBuffer()).byteLength, 40000);
  }
  assert.equal(calls.get('avatar-broken.png'), 1);
});

test('缺失头像、资源文件和私有缓存文件不能通过公开头像 URL 读取', async () => {
  for (const name of ['avatar-missing.png', 'resource-private.png', '.avatar-cache']) {
    const response = await webp(name);
    assert.equal(response.status, 404);
    assert.notEqual(response.headers.get('cache-control'), 'public,max-age=3600');
    await response.arrayBuffer();
  }
  const [cachedName] = await readdir(path.join(directory, '.avatar-cache'));
  assert.match(cachedName, /^[a-f0-9]{64}\.webp$/);
  for (const name of [cachedName, `.avatar-cache/${cachedName}`, `avatar-${cachedName}`]) {
    const response = await webp(name);
    assert.equal(response.status, 404);
    await response.arrayBuffer();
  }
});

test('超出像素上限的输入不解码为缩略图', async () => {
  const bomb = path.join(directory, 'avatar-pixel-limit.png');
  await sharp({ create: { width: 4096, height: 4096, channels: 3, background: 'red' } })
    .png({ compressionLevel: 9 })
    .toFile(bomb);
  await assert.rejects(convertAvatar(bomb), /pixel limit/i);
  const response = await webp('avatar-pixel-limit.png');
  assert.equal(response.status, 200);
  assert.match(response.headers.get('content-type'), /^image\/png/);
  assert.deepEqual(Buffer.from(await response.arrayBuffer()), await readFile(bomb));
});

test('动画 WebP 保留原始帧，不替换为静态缩略图', async () => {
  const filename = 'avatar-animated.webp';
  const animated = await sharp(randomFillSync(Buffer.alloc(320 * 640 * 3)), {
    raw: { width: 320, height: 640, channels: 3, pageHeight: 320 },
  })
    .webp({ quality: 70, delay: [100, 100], loop: 0 })
    .toBuffer();
  assert.equal((await sharp(animated, { animated: true }).metadata()).pages, 2);
  assert.ok(animated.length >= 32768);
  await writeFile(path.join(directory, filename), animated);
  const response = await webp(filename);
  assert.equal(response.status, 200);
  assert.deepEqual(Buffer.from(await response.arrayBuffer()), animated);
  assert.equal(calls.get(filename), 1);
});

test('大于上传大小上限的旧文件直接回原图，不启动转换', async () => {
  const filename = 'avatar-oversized.png';
  const oversized = Buffer.alloc(2 * 1024 * 1024 + 1, 1);
  await writeFile(path.join(directory, filename), oversized);
  const response = await webp(filename);
  assert.equal(response.status, 200);
  assert.equal((await response.arrayBuffer()).byteLength, oversized.length);
  assert.equal(calls.get(filename), undefined);
});
