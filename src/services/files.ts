import type { Resource } from '../data/types';
const allowed = [
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
];
export async function readUpload(file: File): Promise<string> {
  const ext = file.name.split('.').pop()?.toLowerCase() || '';
  if (!allowed.includes(ext)) throw new Error('不支持此文件类型，请上传文档、压缩包或图片');
  if (file.size > 10 * 1024 * 1024) throw new Error('附件最大 10 MB');
  if (file.size === 0) throw new Error('不能上传空文件');
  const headBuffer = await new Promise<ArrayBuffer>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as ArrayBuffer);
    reader.onerror = () => reject(new Error('文件头读取失败'));
    reader.readAsArrayBuffer(file.slice(0, 12));
  });
  const head = new Uint8Array(headBuffer);
  if (ext === 'pdf' && String.fromCharCode(...head.slice(0, 5)) !== '%PDF-')
    throw new Error('文件内容与 PDF 类型不匹配');
  if (['docx', 'pptx', 'xlsx', 'zip'].includes(ext) && !(head[0] === 0x50 && head[1] === 0x4b))
    throw new Error('文件内容与压缩文档类型不匹配');
  if (['doc', 'xls', 'ppt'].includes(ext) && !(head[0] === 0xd0 && head[1] === 0xcf))
    throw new Error('文件内容与 Office 文档类型不匹配');
  if (ext === 'png' && !(head[0] === 0x89 && head[1] === 0x50 && head[2] === 0x4e))
    throw new Error('PNG 文件内容无效');
  if (['jpg', 'jpeg'].includes(ext) && !(head[0] === 0xff && head[1] === 0xd8))
    throw new Error('JPEG 文件内容无效');
  if (ext === 'gif' && String.fromCharCode(...head.slice(0, 3)) !== 'GIF')
    throw new Error('GIF 文件内容无效');
  if (
    ext === 'webp' &&
    !(
      String.fromCharCode(...head.slice(0, 4)) === 'RIFF' &&
      String.fromCharCode(...head.slice(8, 12)) === 'WEBP'
    )
  )
    throw new Error('WebP 文件内容无效');
  return await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('文件读取失败'));
    reader.readAsDataURL(file);
  });
}
export async function downloadResource(resource: Resource) {
  if (!resource.url) throw new Error('该资源尚未附加文件');
  if (
    !resource.url.startsWith('/api/resources/') &&
    !resource.url.startsWith('/resources/') &&
    !/^data:(application|image|text)\//.test(resource.url)
  )
    throw new Error('无效的文件来源');
  const response = await fetch(resource.url);
  if (!response.ok) throw new Error('文件暂时无法下载，请稍后再试');
  const blob = await response.blob(),
    objectURL = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = objectURL;
  a.download = resource.filename.replace(/[\\/:*?"<>|]/g, '_');
  a.click();
  setTimeout(() => URL.revokeObjectURL(objectURL), 10000);
}
