import { app } from './app.mjs';
import { config } from './config.mjs';
import { pool, query } from './db.mjs';
import { closeChatEvents } from './services/chat-events.mjs';
await query('SELECT 1');
const server = app.listen(config.port, config.host, () =>
  console.log(`LearnHub API ready: http://${config.host}:${config.port}`),
);
for (const signal of ['SIGINT', 'SIGTERM'])
  process.once(signal, () => {
    closeChatEvents();
    server.close(async () => {
      await pool.end();
      process.exit(0);
    });
  });
