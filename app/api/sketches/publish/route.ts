import { publishSketches } from '@/lib/sketch-publish';
import { isLocalRequest, forbidden } from '../guard';

export const dynamic = 'force-dynamic';

// Commit sketches/ and push it to GitHub
export async function POST(request: Request) {
  if (!isLocalRequest(request)) return forbidden();
  const { name } = await request.json().catch(() => ({ name: '' }));
  try {
    return Response.json(await publishSketches(String(name || '')));
  } catch (error) {
    console.error('Publish failed:', error);
    return Response.json({ status: 'saved-locally', reason: 'Git error, see the editor terminal' });
  }
}
