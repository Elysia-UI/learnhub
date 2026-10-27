import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileTypeFromBuffer } from 'file-type';
const destination = path.resolve('public/images/community');
await mkdir(destination, { recursive: true });
const photoIds = {
  cat: '1514888286974-6c03e2ca1dba',
  dog: '1517849845537-4d257902454a',
  lake: '1470770841072-f978cf4d019e',
  forest: '1500534623283-312aade485b7',
  sunrise: '1470252649378-9c29740c9fa8',
  mountains: '1519681393784-d120267933ba',
  library: '1507842217343-583bb7270b66',
  desk: '1498050108023-c5249f4df085',
  team: '1519389950473-47ba0277781c',
  coding: '1516321318423-f06f85e504b3',
  campus: '1522202176988-66273c2fd55f',
  art: '1513364776144-60967b0f800f',
  writing: '1455390582262-044cdead277a',
  coffee: '1509042239860-f550ce710b93',
  gaming: '1550745165-9bc0b252726f',
  analytics: '1460925895917-afdab827c52f',
  ocean: '1518837695005-2083093ee35b',
  flowers: '1490750967868-88aa4486c946',
};
const portraits = [1, 3, 5, 7, 9, 11, 12, 14, 16, 25, 32, 41, 44, 47, 49, 56, 59, 60, 64, 68];
const jobs = [
  ...portraits.map((id, i) => ({
    file: `portrait-${i + 1}.jpg`,
    url: `https://i.pravatar.cc/160?img=${id}`,
    source: 'Pravatar virtual demo portrait',
  })),
  ...Object.entries(photoIds).map(([name, id]) => ({
    file: `${name}.jpg`,
    url: `https://images.unsplash.com/photo-${id}?auto=format&fit=crop&w=1000&q=82`,
    source: 'Unsplash sample photo',
  })),
];
let cursor = 0;
const results = [];
async function worker() {
  while (cursor < jobs.length) {
    const job = jobs[cursor++];
    let saved = false;
    try {
      const existing = await readFile(path.join(destination, job.file));
      saved = existing.length > 1000;
    } catch {}
    for (let attempt = 0; !saved && attempt < 3; attempt++) {
      try {
        const response = await fetch(job.url, { signal: AbortSignal.timeout(25000) });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const bytes = Buffer.from(await response.arrayBuffer());
        const type = await fileTypeFromBuffer(bytes);
        if (!['jpg', 'png', 'webp', 'avif'].includes(type?.ext))
          throw new Error('Unexpected media');
        await writeFile(path.join(destination, job.file), bytes);
        saved = true;
      } catch (error) {
        if (attempt === 2) throw new Error(`${job.file}: ${error.message}`);
      }
    }
    results.push({ ...job, saved });
  }
}
await Promise.all(Array.from({ length: 5 }, worker));
await writeFile(
  path.join(destination, 'sources.json'),
  JSON.stringify(
    results.sort((a, b) => a.file.localeCompare(b.file)),
    null,
    2,
  ) + '\n',
);
console.log(`Verified ${results.length} local photos and portraits.`);
