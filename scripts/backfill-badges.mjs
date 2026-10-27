import { query, transaction, pool } from '../server/db.mjs';
import { syncBadges } from '../server/services/activity.mjs';
try {
  const users = await query('SELECT id FROM users');
  for (const user of users) await transaction((c) => syncBadges(c, user.id));
  console.log(`Checked badge eligibility for ${users.length} users; existing badges preserved.`);
} finally {
  await pool.end();
}
