import { privateRead } from '../server/config.mjs';
const accounts = privateRead('demo-accounts.dpapi');
const only = process.argv[2] || 'admin';
for (const account of accounts.filter((a) => only === 'all' || a.role === only || a.id === only))
  console.log(`${account.role}\t${account.email}\t${account.password}`);
