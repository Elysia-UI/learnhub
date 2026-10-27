import mysql from 'mysql2/promise';
import { config } from './config.mjs';
export const pool = mysql.createPool(config.db);
pool.on('connection', (conn) => conn.query("SET time_zone = '+00:00'"));
export async function query(sql, params = [], conn = pool) {
  const [rows] = await conn.execute(sql, params);
  return rows;
}
export async function transaction(fn) {
  for (let attempt = 0; attempt < 4; attempt++) {
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      const value = await fn(conn);
      await conn.commit();
      return value;
    } catch (error) {
      await conn.rollback();
      if (!['ER_LOCK_DEADLOCK', 'ER_LOCK_WAIT_TIMEOUT'].includes(error.code) || attempt === 3)
        throw error;
    } finally {
      conn.release();
    }
    await new Promise((resolve) => setTimeout(resolve, 20 * (attempt + 1)));
  }
}
export const iso = (value) => (value ? new Date(value).toISOString() : undefined);
export const json = (value, fallback = []) =>
  value == null ? fallback : typeof value === 'string' ? JSON.parse(value) : value;
