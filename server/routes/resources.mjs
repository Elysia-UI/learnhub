import { Router } from 'express';
import { z } from 'zod';
import multer from 'multer';
import { fileTypeFromBuffer } from 'file-type';
import { readFile, writeFile, stat, unlink } from 'node:fs/promises';
import path from 'node:path';
import { storageDir } from '../config.mjs';
import { query, transaction } from '../db.mjs';
import { auth, validate, tagsSchema, idSchema, uid, assert, HttpError } from '../security.mjs';
export const resourceRoutes = Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024, files: 1, fields: 8 },
}).single('file');
const extensions = new Set([
  'pdf',
  'doc',
  'docx',
  'ppt',
  'pptx',
  'xls',
  'xlsx',
  'zip',
  'png',
  'jpg',
  'jpeg',
  'webp',
  'gif',
  'md',
  'txt',
  'csv',
]);
export async function validateFile(file, avatar = false) {
  assert(file && file.size > 0, 400, '请选择非空文件');
  const ext = path.extname(file.originalname).slice(1).toLowerCase();
  assert(extensions.has(ext), 400, '不支持此文件类型');
  let detected;
  try {
    detected = await fileTypeFromBuffer(file.buffer);
  } catch {
    throw new HttpError(400, '文件内容不完整');
  }
  let mime = detected?.mime;
  if (['md', 'txt', 'csv'].includes(ext)) {
    try {
      new TextDecoder('utf-8', { fatal: true }).decode(file.buffer);
    } catch {
      throw new HttpError(400, '文本必须采用 UTF-8 编码');
    }
    assert(!file.buffer.includes(0), 400, '文本内容包含无效字节');
    mime = ext === 'csv' ? 'text/csv' : 'text/plain';
  } else if (['doc', 'ppt', 'xls'].includes(ext))
    assert(
      file.buffer.subarray(0, 8).equals(Buffer.from('d0cf11e0a1b11ae1', 'hex')),
      400,
      'Office 文件内容与扩展名不匹配',
    );
  else {
    const expected = { jpeg: 'jpg', docx: 'docx', pptx: 'pptx', xlsx: 'xlsx' }[ext] || ext;
    assert(detected && detected.ext === expected, 400, '文件内容与扩展名不匹配');
  }
  if (avatar) {
    assert(
      ['png', 'jpg', 'jpeg', 'webp'].includes(ext) && file.size <= 2 * 1024 * 1024,
      400,
      '头像需为 2 MB 以内的 PNG、JPEG 或 WebP 图片',
    );
  }
  return { ext, mime: mime || 'application/octet-stream' };
}
resourceRoutes.post('/uploads', auth, upload, async (req, res) => {
  const { ext } = await validateFile(req.file, true);
  const filename = `avatar-${req.user.id}-${uid('file')}.${ext}`;
  await writeFile(path.join(storageDir, filename), req.file.buffer, { flag: 'wx' });
  res.status(201).json({ data: { url: `/api/uploads/${filename}` } });
});
resourceRoutes.get('/uploads/:name', async (req, res) => {
  assert(/^avatar-[a-zA-Z0-9_-]+\.(png|jpg|jpeg|webp)$/.test(req.params.name), 404, '图片不存在');
  res.set('Cache-Control', 'public,max-age=3600');
  res.sendFile(path.join(storageDir, req.params.name), { dotfiles: 'allow' });
});
resourceRoutes.post('/resources', auth, upload, async (req, res) => {
  const v = validate(
    z
      .object({
        title: z.string().trim().min(2).max(100),
        description: z.string().trim().min(10).max(20000),
        category: idSchema,
        tags: z
          .string()
          .max(500)
          .transform((s) => {
            try {
              return JSON.parse(s);
            } catch {
              return [];
            }
          })
          .pipe(tagsSchema),
      })
      .strict(),
    req.body,
  );
  assert(
    (await query('SELECT id FROM categories WHERE id=?', [v.category])).length,
    400,
    '分类不存在',
  );
  const { ext, mime } = await validateFile(req.file),
    id = uid('resource'),
    key = `${id}.${ext}`;
  let originalName = req.file.originalname;
  const decoded = Buffer.from(originalName, 'latin1').toString('utf8');
  if (!decoded.includes('\ufffd')) originalName = decoded;
  const filename = path
    .basename(originalName)
    .replace(/[\\/:*?"<>|\x00-\x1f]/g, '_')
    .slice(0, 180);
  await writeFile(path.join(storageDir, key), req.file.buffer, { flag: 'wx' });
  try {
    await query(
      'INSERT INTO resources(id,author_id,category_id,title,description,type,byte_size,filename,storage_key,mime,tags) VALUES(?,?,?,?,?,?,?,?,?,?,?)',
      [
        id,
        req.user.id,
        v.category,
        v.title,
        v.description,
        ext.toUpperCase(),
        req.file.size,
        filename,
        key,
        mime,
        JSON.stringify(v.tags),
      ],
    );
  } catch (e) {
    await unlink(path.join(storageDir, key));
    throw e;
  }
  res.status(201).json({ data: { id } });
});
resourceRoutes.get('/resources/:id/download', auth, async (req, res) => {
  const [r] = await query('SELECT * FROM resources WHERE id=?', [req.params.id]);
  assert(r, 404, '资源不存在');
  assert(r.status === 'approved', 403, '资源审核通过后才能下载');
  const file = path.resolve(storageDir, r.storage_key);
  assert(file.startsWith(storageDir + path.sep), 403, '文件路径无效');
  try {
    await stat(file);
  } catch {
    throw new HttpError(404, '文件暂时不可用');
  }
  await transaction(async (c) => {
    await query(
      'INSERT INTO resource_downloads(id,resource_id,user_id) VALUES(?,?,?)',
      [uid('download'), r.id, req.user.id],
      c,
    );
    await query('UPDATE resources SET downloads=downloads+1 WHERE id=?', [r.id], c);
  });
  res.set({ 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'private,no-store' });
  res.download(file, r.filename, { dotfiles: 'allow' });
});
resourceRoutes.put('/resources/:id/favorite', auth, async (req, res) => {
  const { active } = validate(z.object({ active: z.boolean() }).strict(), req.body);
  assert(
    (await query("SELECT id FROM resources WHERE id=? AND status='approved'", [req.params.id]))
      .length,
    404,
    '资源不存在',
  );
  if (active)
    await query('INSERT IGNORE INTO resource_favorites(resource_id,user_id) VALUES(?,?)', [
      req.params.id,
      req.user.id,
    ]);
  else
    await query('DELETE FROM resource_favorites WHERE resource_id=? AND user_id=?', [
      req.params.id,
      req.user.id,
    ]);
  res.json({ data: { active } });
});
