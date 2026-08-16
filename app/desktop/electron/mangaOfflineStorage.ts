import fs from 'fs';
import path from 'path';
import unzipper from 'unzipper';

const IMAGE_PATTERN = /\.(png|jpe?g|webp|gif)$/i;
const MAX_PAGES = 500;
const MAX_BYTES = 256 * 1024 * 1024;

export type MangaOfflineRequest = {
  series?: unknown;
  chapter?: unknown;
  offset?: unknown;
  limit?: unknown;
};

export type OfflineChapter = { key: string; label: string; pages: number };

type ArchiveDirectory = {
  files: Array<{
    path: string;
    type: string;
    buffer(): Promise<Buffer>;
  }>;
};

export function sanitizeMangaPathPart(value: unknown, fallback: string): string {
  const cleaned = String(value || fallback)
    .replace(/[<>:"/\\|?*\u0000-\u001F]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[. ]+$/g, '');
  return (cleaned || fallback).slice(0, 120);
}

export function getMangaDownloadRoot(downloadsPath: string): string {
  return path.join(downloadsPath, 'MapleVault', 'Mangas');
}

function getSafeMangaSeriesDirectory(downloadRoot: string, series: unknown): string | null {
  const normalized = sanitizeMangaPathPart(series, 'Manga');
  const root = path.resolve(downloadRoot);
  const target = path.resolve(root, normalized);
  return target.startsWith(`${root}${path.sep}`) ? target : null;
}

async function collectImageFiles(directory: string, prefix = ''): Promise<string[]> {
  const entries = await fs.promises.readdir(directory, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const relative = prefix ? path.join(prefix, entry.name) : entry.name;
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...await collectImageFiles(absolute, relative));
    } else if (entry.isFile() && IMAGE_PATTERN.test(entry.name)) {
      files.push(relative);
    }
  }
  return files.sort((left, right) => left.localeCompare(right, undefined, { numeric: true }));
}

function getMimeType(fileName: string): string {
  const extension = path.extname(fileName).toLowerCase();
  return extension === '.png' ? 'image/png'
    : extension === '.webp' ? 'image/webp'
      : extension === '.gif' ? 'image/gif' : 'image/jpeg';
}

export async function saveMangaArchive(
  request: { series?: unknown; fileName?: unknown; data?: unknown },
  downloadsPath: string
): Promise<{ saved: boolean; path?: string; extractedPages?: number; error?: string }> {
  const rawData = request?.data;
  if (!rawData || (!ArrayBuffer.isView(rawData) && !(rawData instanceof ArrayBuffer))) {
    return { saved: false, error: 'El archivo de manga no es válido.' };
  }

  const data = rawData instanceof ArrayBuffer
    ? Buffer.from(rawData)
    : Buffer.from(rawData.buffer, rawData.byteOffset, rawData.byteLength);
  if (data.length === 0 || data.length > MAX_BYTES) {
    return { saved: false, error: 'El archivo de manga supera el tamaño permitido.' };
  }

  let archive: ArchiveDirectory;
  try {
    archive = await unzipper.Open.buffer(data);
  } catch {
    return { saved: false, error: 'El archivo de manga no es un ZIP válido.' };
  }

  const series = sanitizeMangaPathPart(request.series, 'Manga');
  const fileName = sanitizeMangaPathPart(request.fileName, 'capitulo.zip').replace(/\.zip$/i, '') + '.zip';
  const targetDirectory = path.join(downloadsPath, 'MapleVault', 'Mangas', series);
  const targetPath = path.join(targetDirectory, fileName);
  const chapterDirectory = path.join(targetDirectory, fileName.replace(/\.zip$/i, ''));
  await fs.promises.mkdir(targetDirectory, { recursive: true });
  await fs.promises.writeFile(targetPath, data, { flag: 'w' });

  let extractedPages = 0;
  let extractedBytes = 0;
  for (const entry of archive.files) {
    if (entry.type !== 'File' || extractedPages >= MAX_PAGES) continue;
    const relative = entry.path.replace(/\\/g, '/').replace(/^\/+/, '');
    const extension = path.extname(relative).toLowerCase();
    if (!IMAGE_PATTERN.test(extension) || relative.split('/').some((part: string) => part === '..')) continue;
    const destination = path.resolve(chapterDirectory, relative);
    if (!destination.startsWith(`${path.resolve(chapterDirectory)}${path.sep}`)) continue;
    const pageData = await entry.buffer();
    extractedBytes += pageData.length;
    if (extractedBytes > MAX_BYTES) break;
    await fs.promises.mkdir(path.dirname(destination), { recursive: true });
    await fs.promises.writeFile(destination, pageData, { flag: 'w' });
    extractedPages += 1;
  }
  return { saved: true, path: targetPath, extractedPages };
}

export async function listOfflineMangaChapters(downloadRoot: string, request: { series?: unknown }): Promise<{ chapters: OfflineChapter[] }> {
  const directory = getSafeMangaSeriesDirectory(downloadRoot, request?.series);
  if (!directory || !fs.existsSync(directory)) return { chapters: [] };
  const entries = await fs.promises.readdir(directory, { withFileTypes: true });
  const chapters: OfflineChapter[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const files = await collectImageFiles(path.join(directory, entry.name));
    if (files.length > 0) chapters.push({ key: entry.name, label: entry.name, pages: files.length });
  }
  return { chapters: chapters.sort((left, right) => left.label.localeCompare(right.label, undefined, { numeric: true })) };
}

export async function readOfflineMangaChapter(downloadRoot: string, request: MangaOfflineRequest): Promise<{ pages: string[]; total: number; offset: number; hasMore: boolean }> {
  const directory = getSafeMangaSeriesDirectory(downloadRoot, request?.series);
  const chapter = sanitizeMangaPathPart(request?.chapter, '');
  const offset = Math.max(0, Math.min(MAX_PAGES, Number(request?.offset) || 0));
  const limit = Math.max(1, Math.min(12, Number(request?.limit) || 1));
  if (!directory || !chapter || !fs.existsSync(directory)) return { pages: [], total: 0, offset, hasMore: false };
  const entries = await fs.promises.readdir(directory, { withFileTypes: true });
  const chapterLower = chapter.toLowerCase();
  const selected = entries.find(entry => entry.isDirectory() && entry.name.toLowerCase() === chapterLower)
    || entries.find(entry => entry.isDirectory() && entry.name.toLowerCase().includes(`capitulo ${chapterLower}`));
  if (!selected) return { pages: [], total: 0, offset, hasMore: false };
  const chapterDirectory = path.join(directory, selected.name);
  const files = (await collectImageFiles(chapterDirectory)).slice(0, MAX_PAGES);
  const pages: string[] = [];
  for (const file of files.slice(offset, offset + limit)) {
    const data = await fs.promises.readFile(path.join(chapterDirectory, file));
    pages.push(`data:${getMimeType(file)};base64,${data.toString('base64')}`);
  }
  return { pages, total: files.length, offset, hasMore: offset + pages.length < files.length };
}
