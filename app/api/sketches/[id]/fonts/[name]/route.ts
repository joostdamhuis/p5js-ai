import { saveFont, readFont, deleteFont, isValidId, isFontFile, FONT_TYPES } from '@/lib/sketch-store';
import { isLocalRequest, forbidden } from '../../../guard';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ id: string; name: string }> };

// Sketches run in a data: URL frame, so fonts need a CORS header to load
const cors = { 'Access-Control-Allow-Origin': '*' };

export async function GET(request: Request, { params }: Params) {
  if (!isLocalRequest(request)) return forbidden();
  const { id, name } = await params;
  const font = isValidId(id) && isFontFile(name) ? await readFont(id, name) : null;
  if (!font) return new Response(null, { status: 404, headers: cors });
  const ext = name.split('.').pop()!.toLowerCase();
  return new Response(new Uint8Array(font), {
    headers: { ...cors, 'Content-Type': FONT_TYPES[ext] ?? 'application/octet-stream', 'Cache-Control': 'no-store' },
  });
}

// Body: the raw font file
export async function PUT(request: Request, { params }: Params) {
  if (!isLocalRequest(request)) return forbidden();
  const { id, name } = await params;
  if (!isValidId(id) || !isFontFile(name)) return Response.json({ error: 'Invalid font' }, { status: 400 });
  const data = Buffer.from(await request.arrayBuffer());
  if (data.length === 0 || data.length > 15_000_000) return Response.json({ error: 'Font is empty or too large' }, { status: 413 });
  return (await saveFont(id, name, data)) ? Response.json({ ok: true }) : Response.json({ error: 'Save the sketch first' }, { status: 404 });
}

export async function DELETE(request: Request, { params }: Params) {
  if (!isLocalRequest(request)) return forbidden();
  const { id, name } = await params;
  if (isValidId(id) && isFontFile(name)) await deleteFont(id, name);
  return Response.json({ ok: true });
}
