import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { lstat, mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import sharp from 'sharp';

const avatarName = /^avatar-[a-zA-Z0-9_-]+\.(png|jpg|jpeg|webp)$/;
const minBytes = 32 * 1024;
const maxBytes = 2 * 1024 * 1024;
const maxPixels = 8_000_000;

export function acceptsWebp(value = '') {
  return value.split(',').some((entry) => {
    const [type, ...parameters] = entry.trim().toLowerCase().split(';');
    if (type.trim() !== 'image/webp') return false;
    const quality = parameters.find((p) => /^\s*q\s*=/.test(p));
    if (!quality) return true;
    const weight = Number(quality.split('=')[1].trim());
    return weight > 0 && weight <= 1;
  });
}

export async function convertAvatar(source) {
  const original = await readFile(source);
  if (original.length > maxBytes) throw new Error('Avatar input exceeds size limit');
  const image = sharp(original, {
    limitInputPixels: maxPixels,
    sequentialRead: true,
    failOn: 'warning',
    animated: false,
  });
  try {
    const metadata = await image.metadata();
    if ((metadata.pages || 1) > 1) throw new Error('Animated avatars keep their original frames');
    return await image
      .rotate()
      .resize({ width: 320, height: 320, fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 78, effort: 4 })
      .toBuffer();
  } finally {
    image.destroy();
  }
}

// The factory is independent of configuration, authentication and the database.
export function createAvatarResponder(directory, { transform = convertAvatar } = {}) {
  const storage = path.resolve(directory);
  const cacheDirectory = path.join(storage, '.avatar-cache');
  const inFlight = new Map();
  const failed = new Set();
  const waiting = [];
  let active = 0;

  function start(task, resolve) {
    active++;
    Promise.resolve()
      .then(task)
      .then(resolve, () => resolve(null))
      .finally(() => {
        active--;
        const next = waiting.shift();
        if (next) start(next.task, next.resolve);
      });
  }

  function bounded(task) {
    return new Promise((resolve) => {
      if (active < 2) start(task, resolve);
      else if (waiting.length < 16) waiting.push({ task, resolve });
      else resolve(null); // Keep serving the original instead of queuing unbounded work.
    });
  }

  function rememberFailure(key) {
    if (failed.size >= 256) failed.delete(failed.values().next().value);
    failed.add(key);
  }

  async function cachedFile(filename, source, metadata) {
    const key = createHash('sha256')
      .update(`avatar-webp-v1-320-q78\0${filename}\0${metadata.size}\0${metadata.mtimeNs}`)
      .digest('hex');
    const cached = path.join(cacheDirectory, `${key}.webp`);
    try {
      const info = await lstat(cached);
      if (info.isFile() && info.size > 0 && BigInt(info.size) < metadata.size) return cached;
    } catch {}
    if (failed.has(key)) return null;
    if (inFlight.has(key)) return inFlight.get(key);

    const pending = bounded(async () => {
      let temporary;
      try {
        const buffer = await transform(source);
        if (!Buffer.isBuffer(buffer) || !buffer.length || BigInt(buffer.length) >= metadata.size) {
          rememberFailure(key);
          return null;
        }
        // If the immutable upload was removed or replaced, never publish a stale conversion.
        const latest = await lstat(source, { bigint: true });
        if (latest.size !== metadata.size || latest.mtimeNs !== metadata.mtimeNs) return null;
        await mkdir(cacheDirectory, { recursive: true });
        temporary = path.join(cacheDirectory, `${key}-${randomUUID()}.tmp`);
        await writeFile(temporary, buffer, { flag: 'wx', mode: 0o600 });
        await rename(temporary, cached);
        temporary = undefined;
        return cached;
      } catch {
        rememberFailure(key);
        return null;
      } finally {
        if (temporary) await unlink(temporary).catch(() => {});
      }
    });
    inFlight.set(key, pending);
    try {
      return await pending;
    } finally {
      inFlight.delete(key);
    }
  }

  return async function avatarImage(req, res, next) {
    try {
      const filename = req.params.name;
      if (!avatarName.test(filename || '')) {
        return next(Object.assign(new Error('图片不存在'), { status: 404, code: 'NOT_FOUND' }));
      }
      const source = path.join(storage, filename);
      let metadata;
      try {
        metadata = await lstat(source, { bigint: true });
        if (!metadata.isFile()) throw new Error('Not a regular file');
      } catch {
        return next(Object.assign(new Error('图片不存在'), { status: 404, code: 'NOT_FOUND' }));
      }
      res.vary('Accept');
      res.set('Cache-Control', 'public,max-age=3600');
      if (
        acceptsWebp(req.get('accept')) &&
        metadata.size >= minBytes &&
        metadata.size <= maxBytes
      ) {
        const optimized = await cachedFile(filename, source, metadata);
        if (optimized) {
          res.type('image/webp');
          return res.sendFile(optimized, { dotfiles: 'allow' });
        }
      }
      res.sendFile(filename, { root: storage, dotfiles: 'allow' });
    } catch (error) {
      next(error);
    }
  };
}
