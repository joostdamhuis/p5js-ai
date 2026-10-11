import { listProjects } from '@/lib/sketch-store';
import { isLocalRequest, forbidden } from './guard';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  if (!isLocalRequest(request)) return forbidden();
  return Response.json(await listProjects());
}
