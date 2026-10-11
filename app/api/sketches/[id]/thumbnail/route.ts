import { saveThumbnail, readThumbnail, isValidId } from '@/lib/sketch-store';
import { isLocalRequest, forbidden } from '../../guard';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ id: string }> };

export async function GET(request: Request, { params }: Params) {
  if (!isLocalRequest(request)) return forbidden();
  const { id } = await params;
  const jpeg = isValidId(id) ? await readThumbnail(id) : null;
  if (!jpeg) return new Response(null, { status: 404 });
  return new Response(new Uint8Array(jpeg), { headers: { 'Content-Type': 'image/jpeg', 'Cache-Control': 'no-store' } });
}

// Body: { dataUrl: 'data:image/jpeg;base64,...' }
export async function PUT(request: Request, { params }: Params) {
  if (!isLocalRequest(request)) return forbidden();
  const { id } = await params;
  const { dataUrl } = await request.json().catch(() => ({ dataUrl: '' }));
  const match = typeof dataUrl === 'string' && dataUrl.match(/^data:image\/jpeg;base64,([A-Za-z0-9+/=]+)$/);
  if (!isValidId(id) || !match) return Response.json({ error: 'Invalid thumbnail' }, { status: 400 });
  const jpeg = Buffer.from(match[1], 'base64');
  if (jpeg.length > 1_000_000) return Response.json({ error: 'Too large' }, { status: 413 });
  return (await saveThumbnail(id, jpeg)) ? Response.json({ ok: true }) : Response.json({ error: 'Not found' }, { status: 404 });
}
