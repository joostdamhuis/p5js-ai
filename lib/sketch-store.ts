// Server-only: stores each project as a folder of real files in <repo>/sketches,
// so sketches survive browser resets and get backed up with git.
//
//   sketches/amber-swirl/
//     project.json   name, id, open tabs, file list (no contents)
//     sketch.js
//     index.html
//     style.css
import { promises as fs } from 'fs';
import path from 'path';
import { Project, ProjectFile } from './types';

const ROOT = path.join(process.cwd(), 'sketches');
const META = 'project.json';
const THUMBNAIL = 'thumbnail.jpg';

type ProjectMeta = Omit<Project, 'files'> & {
  files: Omit<ProjectFile, 'content'>[];
};

export const isValidId = (id: string) => /^[A-Za-z0-9_-]{1,100}$/.test(id);

// Plain file names only: no folders, no hidden files, never our metadata file
const isSafeFileName = (name: string) =>
  /^[A-Za-z0-9._ -]{1,100}$/.test(name) && !name.startsWith('.') && name !== META && name !== THUMBNAIL;

export const FONT_TYPES: Record<string, string> = {
  ttf: 'font/ttf',
  otf: 'font/otf',
  woff: 'font/woff',
  woff2: 'font/woff2',
};

export const isFontFile = (name: string) =>
  /^[A-Za-z0-9._ -]{1,100}$/.test(name) && !name.startsWith('.') && /\.(ttf|otf|woff2?)$/i.test(name);

const slugify = (name: string) =>
  name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'sketch';

const exists = async (p: string) => fs.access(p).then(() => true, () => false);

async function readMeta(dir: string): Promise<ProjectMeta | null> {
  try {
    return JSON.parse(await fs.readFile(path.join(dir, META), 'utf8'));
  } catch {
    return null;
  }
}

async function projectDirs(): Promise<string[]> {
  const entries = await fs.readdir(ROOT, { withFileTypes: true }).catch(() => []);
  return entries.filter(e => e.isDirectory()).map(e => path.join(ROOT, e.name));
}

async function findDir(id: string): Promise<string | null> {
  for (const dir of await projectDirs()) {
    if ((await readMeta(dir))?.id === id) return dir;
  }
  return null;
}

async function readProject(dir: string): Promise<Project | null> {
  const meta = await readMeta(dir);
  if (!meta) return null;
  const files: ProjectFile[] = [];
  for (const f of meta.files) {
    if (!isSafeFileName(f.name)) continue;
    const content = await fs.readFile(path.join(dir, f.name), 'utf8').catch(() => null);
    if (content !== null) files.push({ ...f, content });
  }
  return { ...meta, files };
}

export async function listProjects(): Promise<Project[]> {
  const projects: Project[] = [];
  for (const dir of await projectDirs()) {
    const project = await readProject(dir);
    if (project) projects.push(project);
  }
  return projects.sort((a, b) => a.lastModified - b.lastModified);
}

export async function getProject(id: string): Promise<Project | null> {
  const dir = await findDir(id);
  return dir ? readProject(dir) : null;
}

export async function saveProject(project: Project): Promise<void> {
  if (!isValidId(project.id)) throw new Error('Invalid project id');
  await fs.mkdir(ROOT, { recursive: true });

  // Folder follows the project name; renamed when the name changes and the new one is free
  const wanted = path.join(ROOT, slugify(project.name));
  let dir = await findDir(project.id);
  if (!dir) {
    dir = wanted;
    for (let n = 2; await exists(dir); n++) dir = `${wanted}-${n}`;
    await fs.mkdir(dir);
  } else if (dir !== wanted && !(await exists(wanted))) {
    await fs.rename(dir, wanted);
    dir = wanted;
  }

  const files = project.files.filter(f => isSafeFileName(f.name));
  for (const f of files) {
    await fs.writeFile(path.join(dir, f.name), f.content, 'utf8');
  }

  // Remove files that were deleted or renamed in the editor
  const keepFonts = (project.fonts ?? (await readMeta(dir))?.fonts ?? []).filter(isFontFile);
  const keep = new Set([META, THUMBNAIL, ...files.map(f => f.name), ...keepFonts]);
  for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
    if (entry.isFile() && !keep.has(entry.name)) await fs.unlink(path.join(dir, entry.name));
  }

  // A client that doesn't send these (an older tab, a code update from Claude)
  // must not wipe them: keep what's on disk
  const existing = await readMeta(dir);

  const meta: ProjectMeta = {
    id: project.id,
    name: project.name,
    lastModified: project.lastModified,
    activeFile: project.activeFile,
    openTabs: project.openTabs,
    controls: project.controls ?? existing?.controls,
    canvasSize: project.canvasSize ?? existing?.canvasSize,
    fonts: (project.fonts ?? existing?.fonts ?? []).filter(isFontFile),
    files: files.map(({ content: _content, ...rest }) => rest),
  };
  await fs.writeFile(path.join(dir, META), JSON.stringify(meta, null, 2) + '\n', 'utf8');
}

export async function deleteProject(id: string): Promise<void> {
  const dir = await findDir(id);
  if (dir) await fs.rm(dir, { recursive: true, force: true });
}

// Small picture of the sketch for the dashboard (not committed to git)
export async function saveThumbnail(id: string, jpeg: Buffer): Promise<boolean> {
  const dir = await findDir(id);
  if (!dir) return false;
  await fs.writeFile(path.join(dir, THUMBNAIL), jpeg);
  return true;
}

export async function readThumbnail(id: string): Promise<Buffer | null> {
  const dir = await findDir(id);
  return dir ? fs.readFile(path.join(dir, THUMBNAIL)).catch(() => null) : null;
}

// Font files live in the sketch folder next to the code
export async function saveFont(id: string, name: string, data: Buffer): Promise<boolean> {
  const dir = await findDir(id);
  if (!dir || !isFontFile(name)) return false;
  await fs.writeFile(path.join(dir, name), data);
  return true;
}

export async function readFont(id: string, name: string): Promise<Buffer | null> {
  const dir = await findDir(id);
  if (!dir || !isFontFile(name)) return null;
  return fs.readFile(path.join(dir, name)).catch(() => null);
}

export async function deleteFont(id: string, name: string): Promise<void> {
  const dir = await findDir(id);
  if (dir && isFontFile(name)) await fs.unlink(path.join(dir, name)).catch(() => {});
}
