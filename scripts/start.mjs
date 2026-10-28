import { createServer } from 'vite';
import { spawn } from 'node:child_process';
import { app } from '../server/app.mjs';
import { config } from '../server/config.mjs';
import { query, pool } from '../server/db.mjs';
import { closeChatEvents } from '../server/services/chat-events.mjs';
await query('SELECT 1');
const apiServer = app.listen(config.port, config.host);
await new Promise((resolve, reject) => {
  apiServer.once('listening', resolve);
  apiServer.once('error', reject);
});
const frontend = await createServer();
try {
  await frontend.listen();
} catch (e) {
  apiServer.close();
  await pool.end();
  throw e;
}
console.log(`LearnHub API: http://${config.host}:${config.port}`);
frontend.printUrls();
if (process.platform === 'win32' && !process.argv.includes('--no-open')) {
  const child = spawn(
    'powershell.exe',
    ['-NoProfile', '-WindowStyle', 'Hidden', '-Command', "Start-Process 'http://127.0.0.1:5173/'"],
    { stdio: 'ignore', windowsHide: true },
  );
  child.on('error', () => console.log('请打开 http://127.0.0.1:5173/'));
}
for (const signal of ['SIGINT', 'SIGTERM'])
  process.once(signal, async () => {
    closeChatEvents();
    await frontend.close();
    apiServer.close(async () => {
      await pool.end();
      process.exit(0);
    });
  });
