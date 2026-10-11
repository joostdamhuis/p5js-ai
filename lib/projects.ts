// Client-side access to projects. The sketches/ folder on disk (via /api/sketches)
// is the source of truth; localStorage is kept as a cache and offline fallback.
import { Project } from './types';

const CACHE_KEY = 'p5_projects';
const CURRENT_KEY = 'current_project';
const IMPORTED_KEY = 'p5_imported_to_disk';

const readCache = (): Project[] => {
  try {
    return JSON.parse(localStorage.getItem(CACHE_KEY) || '[]');
  } catch {
    return [];
  }
};

const writeCache = (projects: Project[]) => {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(projects));
  } catch {
    // Storage full or blocked: the copy on disk still counts
  }
};

export const cacheProject = (project: Project) => {
  const projects = readCache();
  const index = projects.findIndex(p => p.id === project.id);
  if (index >= 0) projects[index] = project;
  else projects.push(project);
  writeCache(projects);
  try {
    localStorage.setItem(CURRENT_KEY, JSON.stringify(project));
  } catch {}
};

const putProject = async (project: Project) => {
  const res = await fetch(`/api/sketches/${encodeURIComponent(project.id)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(project),
  });
  if (!res.ok) throw new Error(`Save failed (${res.status})`);
};

// Writes the project to the sketches folder (and the cache)
export const saveProject = async (project: Project) => {
  cacheProject(project);
  await putProject(project);
};

// One time: copy sketches that only lived in this browser into the sketches folder
const importBrowserProjects = async (onDisk: Project[]) => {
  if (localStorage.getItem(IMPORTED_KEY)) return [];
  const known = new Set(onDisk.map(p => p.id));
  const local = readCache();
  try {
    const current = JSON.parse(localStorage.getItem(CURRENT_KEY) || 'null');
    if (current && !local.some(p => p.id === current.id)) local.push(current);
  } catch {}
  const toImport = local.filter(p => p && p.id && !known.has(p.id));
  for (const project of toImport) await putProject(project);
  localStorage.setItem(IMPORTED_KEY, String(Date.now()));
  return toImport;
};

export const fetchProjects = async (): Promise<Project[]> => {
  try {
    const res = await fetch('/api/sketches', { cache: 'no-store' });
    if (!res.ok) throw new Error(String(res.status));
    const onDisk: Project[] = await res.json();
    const imported = await importBrowserProjects(onDisk);
    const all = [...onDisk, ...imported].sort((a, b) => a.lastModified - b.lastModified);
    writeCache(all);
    return all;
  } catch (error) {
    console.error('Could not load sketches folder, using browser copy', error);
    return readCache();
  }
};

export const fetchProject = async (id: string): Promise<Project | null> => {
  try {
    const res = await fetch(`/api/sketches/${encodeURIComponent(id)}`, { cache: 'no-store' });
    if (res.ok) return await res.json();
    if (res.status !== 404) throw new Error(String(res.status));
  } catch (error) {
    console.error('Could not load sketch from disk, using browser copy', error);
  }
  // Not on disk yet: fall back to this browser's copy and store it on disk
  const cached = readCache().find(p => p.id === id)
    ?? (() => {
      try {
        const current = JSON.parse(localStorage.getItem(CURRENT_KEY) || 'null');
        return current?.id === id ? current : undefined;
      } catch {
        return undefined;
      }
    })();
  if (cached) putProject(cached).catch(() => {});
  return cached ?? null;
};

export const deleteProject = async (id: string) => {
  writeCache(readCache().filter(p => p.id !== id));
  try {
    const current = JSON.parse(localStorage.getItem(CURRENT_KEY) || 'null');
    if (current?.id === id) localStorage.removeItem(CURRENT_KEY);
  } catch {}
  await fetch(`/api/sketches/${encodeURIComponent(id)}`, { method: 'DELETE' });
};
