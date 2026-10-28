import { readdir, mkdir, readFile, writeFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const imageRoot = path.join(root, 'public/images');
const outputRoot = path.join(imageRoot, 'optimized');
await mkdir(outputRoot, { recursive: true });

async function sources(directory) {
  const result = [];
  for (const item of await readdir(directory, { withFileTypes: true })) {
    if (item.name === 'optimized') continue;
    const location = path.join(directory, item.name);
    if (item.isDirectory()) result.push(...(await sources(location)));
    else if (/\.(?:jpe?g|png)$/i.test(item.name)) result.push(location);
  }
  return result.sort();
}

const manifest = {};
const usedNames = new Set();
let originalBytes = 0;
let optimizedBytes = 0;
for (const file of await sources(imageRoot)) {
  const relative = path.relative(imageRoot, file).replaceAll('\\', '/');
  const name = path.basename(file, path.extname(file));
  if (usedNames.has(name)) throw new Error(`Duplicate image basename: ${name}`);
  usedNames.add(name);
  const isAvatar = /(?:avatar|portrait-\d+)/.test(name);
  const width = name === 'hero' ? 1920 : isAvatar ? 320 : 1000;
  const destination = path.join(outputRoot, `${name}.webp`);
  const info = await sharp(file)
    .rotate()
    .resize({ width, withoutEnlargement: true })
    .webp({ quality: name === 'hero' ? 84 : isAvatar ? 84 : 80, effort: 6 })
    .toFile(destination);
  const original = (await stat(file)).size;
  // Only use a derivative when it actually saves bytes. Original URLs in the DB stay valid.
  const worthwhile = info.size < original;
  const entry = {
    src: worthwhile ? `/images/optimized/${name}.webp` : `/images/${relative}`,
    width: info.width,
    height: info.height,
    originalBytes: original,
    bytes: worthwhile ? info.size : original,
  };
  if (name === 'hero') {
    const mobile = await sharp(file)
      .rotate()
      .resize({ width: 960, withoutEnlargement: true })
      .webp({ quality: 82, effort: 6 })
      .toFile(path.join(outputRoot, 'hero-960.webp'));
    entry.srcset = `/images/optimized/hero-960.webp ${mobile.width}w, ${entry.src} ${info.width}w`;
    entry.mobileBytes = mobile.size;
  }
  manifest[`/images/${relative}`] = entry;
  originalBytes += original;
  optimizedBytes += entry.bytes;
}
const manifestPath = path.join(root, 'src/data/optimized-images.json');
const next = `${JSON.stringify(manifest, null, 2)}\n`;
const previous = await readFile(manifestPath, 'utf8').catch(() => '');
if (previous !== next) await writeFile(manifestPath, next);
console.log(
  JSON.stringify(
    {
      images: Object.keys(manifest).length,
      originalBytes,
      optimizedBytes,
      savedPercent: Number(((1 - optimizedBytes / originalBytes) * 100).toFixed(1)),
      hero: manifest['/images/hero.png'],
    },
    null,
    2,
  ),
);
