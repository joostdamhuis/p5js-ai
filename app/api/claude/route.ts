import { runPrompt, type PromptContext } from '@/lib/claude-runner';
import { isLocalRequest, forbidden } from '../sketches/guard';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// Prompt bar: asks a warm Claude Code session on this Mac and streams its progress
// as JSON lines; the final event carries the edits for the editor to apply
export async function POST(request: Request) {
  if (!isLocalRequest(request)) return forbidden();
  const ctx = (await request.json()) as PromptContext;
  if (!ctx?.prompt?.trim()) return Response.json({ error: 'Empty prompt' }, { status: 400 });

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    start(controller) {
      let closed = false;
      const send = (e: object) => {
        if (closed) return;
        controller.enqueue(encoder.encode(JSON.stringify(e) + '\n'));
      };
      const stop = runPrompt(ctx, (e) => {
        send(e);
        if (e.type !== 'status' && !closed) { closed = true; controller.close(); }
      });
      // Stop button or closed tab: end the run
      request.signal.addEventListener('abort', () => {
        stop?.();
        if (!closed) { closed = true; try { controller.close(); } catch {} }
      });
    },
  });
  return new Response(stream, { headers: { 'Content-Type': 'application/x-ndjson', 'Cache-Control': 'no-store' } });
}
