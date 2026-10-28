import { describe, expect, it } from 'vitest';
import { readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import manifest from '../src/data/optimized-images.json';
import { publicImage } from '../src/services/images';

describe('公共图片传输优化', () => {
  it('所有映射指向真实文件，保留原图并准确记录传输体积', () => {
    for (const [original, variant] of Object.entries(manifest)) {
      expect(statSync(resolve('public', `.${original}`)).size).toBe(variant.originalBytes);
      expect(statSync(resolve('public', `.${variant.src}`)).size).toBe(variant.bytes);
      expect(variant.bytes).toBeLessThanOrEqual(variant.originalBytes);
    }
    const hero = manifest['/images/hero.png'];
    expect(hero.bytes).toBeLessThan(300_000);
    expect(hero.mobileBytes).toBeLessThan(100_000);
    expect(statSync('public/images/optimized/hero-960.webp').size).toBe(hero.mobileBytes);
  });

  it('只替换确定的公共图片，不重写上传文件、私有附件或临时预览地址', () => {
    expect(publicImage('/images/hero.png')).toBe('/images/optimized/hero.webp');
    for (const source of [
      '/api/resources/private/download',
      '/api/uploads/avatar/123',
      'blob:http://localhost/example',
      'data:image/png;base64,example',
      'https://example.com/images/hero.png',
      '/images/unknown.jpg',
      '/images/hero.png?version=custom',
      '__proto__',
    ])
      expect(publicImage(source)).toBe(source);
    expect(publicImage(undefined)).toBe('');
  });

  it('首屏样式不再阻塞等待外部字体服务', () => {
    expect(readFileSync('src/style.css', 'utf8')).not.toMatch(/@import[^;]*https?:/);
  });
});
