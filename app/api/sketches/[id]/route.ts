import { getProject, saveProject, deleteProject, isValidId } from '@/lib/sketch-store';
import { Project } from '@/lib/types';
import { isLocalRequest, forbidden } from '../guard';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ id: string }> };

export async function GET(request: Request, { params }: Params) {
  if (!isLocalRequest(request)) return forbidden();
  const { id } = await params;
  const project = isValidId(id) ? await getProject(id) : null;
  return project ? Response.json(project) : Response.json({ error: 'Not found' }, { status: 404 });
}

export async function PUT(request: Request, { params }: Params) {
  if (!isLocalRequest(request)) return forbidden();
  const { id } = await params;
  const project = (await request.json()) as Project;
  if (!isValidId(id) || project.id !== id || !Array.isArray(project.files)) {
    return Response.json({ error: 'Invalid project' }, { status: 400 });
  }
  await saveProject(project);
  return Response.json({ ok: true });
}

export async function DELETE(request: Request, { params }: Params) {
  if (!isLocalRequest(request)) return forbidden();
  const { id } = await params;
  if (isValidId(id)) await deleteProject(id);
  return Response.json({ ok: true });
}
