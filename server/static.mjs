import express from 'express';
import path from 'node:path';

// Only Vite's content-hashed build files may outlive the next deployment.
const hashedAsset = /^assets\/.+-[A-Za-z0-9_-]{8,}\.[^/]+$/;

export function mountProductionStatic(app, directory) {
  const dist = path.resolve(directory);
  app.use(
    express.static(dist, {
      index: false,
      dotfiles: 'deny',
      setHeaders(res, filename) {
        const relative = path.relative(dist, filename).split(path.sep).join('/');
        const cache = hashedAsset.test(relative)
          ? 'public, max-age=31536000, immutable'
          : relative.startsWith('images/')
            ? 'public, max-age=86400, must-revalidate'
            : 'no-cache';
        res.set('Cache-Control', cache);
      },
    }),
  );
  app.get('/{*path}', (_req, res) => {
    res.set('Cache-Control', 'no-cache');
    res.sendFile('index.html', { root: dist });
  });
}
