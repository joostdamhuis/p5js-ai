import { spawn, type ChildProcess } from 'child_process';
import { existsSync, mkdirSync, readdirSync, realpathSync, statSync, writeFileSync } from 'fs';
import path from 'path';
import os from 'os';

// Finds the Claude Code program: an installed `claude` first, then the copy inside the Claude app
export function findClaude(): string | null {
  const home = os.homedir();
  const candidates = [
    path.join(home, '.local/bin/claude'),
    path.join(home, '.claude/local/claude'),
    '/usr/local/bin/claude',
    '/opt/homebrew/bin/claude',
  ];
  for (const c of candidates) if (existsSync(c)) return c;

  const bundled = path.join(home, 'Library/Application Support/Claude/claude-code');
  if (!existsSync(bundled)) return null;
  // Newest version folder first
  const versions = readdirSync(bundled)
    .map(v => path.join(bundled, v))
    .filter(v => statSync(v).isDirectory())
    .sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs);
  for (const v of versions) {
    for (const build of readdirSync(v)) {
      const bin = path.join(v, build, 'claude.app/Contents/MacOS/claude');
      if (existsSync(bin)) return bin;
    }
  }
  return null;
}

export interface PromptContext {
  prompt: string;
  projectId?: string;
  sketchName: string;
  files: { name: string; content: string }[];
  errors: string[];
  history: { prompt: string; reply: string }[];
  model?: string;
  // Reference images, as data URLs
  attachments?: { name: string; dataUrl: string }[];
}

// Models the prompt box can pick (anything else falls back to Claude Code's default)
export const MODELS = ['claude-opus-5-5', 'claude-sonnet-5-5', 'claude-haiku-5-5'];

// Attachments are written here for Claude to read (and only here)
const ATTACH_DIR = (() => {
  const dir = path.join(os.tmpdir(), 'p5-editor-attachments');
  mkdirSync(dir, { recursive: true });
  return realpathSync(dir); // /var → /private/var, so the Read rule matches
})();

function saveAttachments(list: PromptContext['attachments']): string[] {
  if (!list?.length) return [];
  return list.slice(0, 6).flatMap((a, i) => {
    const m = /^data:image\/(png|jpe?g|gif|webp);base64,(.+)$/.exec(a.dataUrl);
    if (!m) return [];
    const file = path.join(ATTACH_DIR, `${Date.now()}-${i}.${m[1] === 'jpeg' ? 'jpg' : m[1]}`);
    writeFileSync(file, Buffer.from(m[2], 'base64'));
    return [file];
  });
}

// One answer, no tool calls: Claude replies with a summary and the edits, and the
// editor applies them itself. Much faster than writing code through the MCP tools.
const SYSTEM_PROMPT = `You are Claude, working inside a local p5.js editor. The user types requests into a prompt bar while their sketch runs live next to it.

Reply in EXACTLY this format and nothing else (no markdown, no code fences):

<summary>One short plain sentence saying what you changed.</summary>
<edit file="sketch.js"><find>exact existing text</find><replace>new text</replace></edit>

Rules for edits:
- <find> must be copied verbatim from the current file and appear exactly once in it. Keep it short: just the lines that change plus enough context to be unique.
- Use as many <edit> blocks as needed, in any order, for any file.
- To create a file, or when you rewrite most of a file, use <file name="sketch.js">the complete new content</file> instead of edits.
- If no code change is needed (a question), reply with only the summary.

Rules for sketches:
- Keep the dials() controls at the top working and add controls for new settings where it helps.
- Keep existing control and folder names (don't rename a \`blues\` folder to \`reds\` when changing colours); change their default values instead, so the Controls panel follows.
- Don't ask questions; make a sensible choice.
- If the user attached images, look at them with Read before answering.`;

export type RunEvent =
  | { type: 'status'; text: string }
  | { type: 'done'; text: string; edits: Edit[] }
  | { type: 'error'; text: string };

export type Edit =
  | { kind: 'replace'; file: string; find: string; replace: string }
  | { kind: 'file'; file: string; content: string };

// Pulls the summary and edits out of Claude's answer
export function parseAnswer(answer: string): { summary: string; edits: Edit[] } {
  const summary = /<summary>([\s\S]*?)<\/summary>/.exec(answer)?.[1].trim() ?? '';
  const edits: Edit[] = [];
  const re = /<edit file="([^"]+)">\s*<find>([\s\S]*?)<\/find>\s*<replace>([\s\S]*?)<\/replace>\s*<\/edit>|<file name="([^"]+)">([\s\S]*?)<\/file>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(answer))) {
    if (m[1]) edits.push({ kind: 'replace', file: m[1], find: m[2], replace: m[3] });
    else edits.push({ kind: 'file', file: m[4], content: m[5].replace(/^\n/, '') });
  }
  return { summary: summary || (edits.length ? 'Done.' : answer.trim().slice(0, 300)), edits };
}

// ---- A warm Claude Code session, reused between prompts ----

type Session = {
  proc: ChildProcess;
  key: string; // model + sketch: a new one starts when either changes
  turns: number;
  sentFiles: string; // what this session has already seen
  busy: boolean;
  onLine: ((msg: Record<string, unknown>) => void) | null;
};

const MAX_TURNS = 12; // then start fresh, so the context stays small and quick
const g = globalThis as unknown as { __claudeSession?: Session | null };

function startSession(bin: string, model: string | undefined, key: string): Session {
  const args = [
    '-p',
    '--input-format', 'stream-json',
    '--output-format', 'stream-json',
    '--include-partial-messages',
    '--verbose',
    '--no-session-persistence',
    '--strict-mcp-config',
    '--tools', 'Read',
    '--allowedTools', `Read(/${ATTACH_DIR}/**)`,
    '--system-prompt', SYSTEM_PROMPT,
    ...(model && MODELS.includes(model) ? ['--model', model] : []),
  ];
  const proc = spawn(bin, args, { cwd: ATTACH_DIR, stdio: ['pipe', 'pipe', 'pipe'], env: process.env });
  const session: Session = { proc, key, turns: 0, sentFiles: '', busy: false, onLine: null };
  let buffer = '';
  proc.stdout!.on('data', (chunk: Buffer) => {
    buffer += chunk.toString();
    let nl;
    while ((nl = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, nl).trim();
      buffer = buffer.slice(nl + 1);
      if (!line) continue;
      try { session.onLine?.(JSON.parse(line)); } catch {}
    }
  });
  proc.on('close', () => {
    if (g.__claudeSession === session) g.__claudeSession = null;
    session.onLine?.({ type: '__closed' });
  });
  proc.on('error', () => session.onLine?.({ type: '__closed' }));
  return session;
}

function getSession(bin: string, ctx: PromptContext): Session {
  const key = `${ctx.model ?? ''}|${ctx.projectId ?? ctx.sketchName}`;
  const current = g.__claudeSession;
  if (current && current.key === key && current.turns < MAX_TURNS && !current.proc.killed && current.proc.exitCode === null) {
    return current;
  }
  current?.proc.kill();
  const session = startSession(bin, ctx.model, key);
  g.__claudeSession = session;
  return session;
}

// Runs one prompt; calls onEvent as it goes. Returns a function that stops it.
export function runPrompt(ctx: PromptContext, onEvent: (e: RunEvent) => void): (() => void) | null {
  const bin = findClaude();
  if (!bin) {
    onEvent({ type: 'error', text: 'Claude Code isn’t installed. See CLAUDE.md → Prompt box.' });
    return null;
  }
  const session = getSession(bin, ctx);
  if (session.busy) {
    onEvent({ type: 'error', text: 'Claude is still working on the last prompt' });
    return null;
  }
  session.busy = true;

  // The current code goes along only when it changed since this session last saw it
  const filesText = ctx.files.map(f => `--- ${f.name} ---\n${f.content}`).join('\n\n');
  const parts: string[] = [];
  if (filesText !== session.sentFiles) {
    parts.push(`Current files of the sketch “${ctx.sketchName}”:\n\n${filesText}`);
    session.sentFiles = filesText;
  } else {
    parts.push('(The files are unchanged since your last edit.)');
  }
  if (session.turns === 0 && ctx.history.length) {
    parts.push('Earlier requests in this sketch (oldest first):\n' + ctx.history.map(h => `- “${h.prompt}” → ${h.reply}`).join('\n'));
  }
  if (ctx.errors.length) parts.push(`Recent console errors:\n${ctx.errors.join('\n')}`);
  const images = saveAttachments(ctx.attachments);
  if (images.length) parts.push(`Attached reference image${images.length > 1 ? 's' : ''} (look with Read):\n${images.join('\n')}`);
  parts.push(`Request: ${ctx.prompt}`);

  let answer = '';
  let finished = false;
  const finish = (e: RunEvent) => {
    if (finished) return;
    finished = true;
    session.busy = false;
    session.onLine = null;
    onEvent(e);
  };

  onEvent({ type: 'status', text: 'Thinking…' });
  session.onLine = (msg) => {
    if (msg.type === '__closed') {
      finish({ type: 'error', text: 'Claude Code stopped unexpectedly. Try again.' });
      return;
    }
    if (msg.type === 'stream_event') {
      const ev = msg.event as { type?: string; content_block?: { type?: string; name?: string } };
      if (ev?.type === 'content_block_start') {
        const block = ev.content_block?.type;
        if (block === 'thinking') onEvent({ type: 'status', text: 'Thinking…' });
        if (block === 'text') onEvent({ type: 'status', text: 'Writing code…' });
        if (block === 'tool_use') onEvent({ type: 'status', text: 'Looking at your image…' });
      }
      return;
    }
    if (msg.type === 'assistant') {
      const content = (msg.message as { content?: { type: string; text?: string }[] })?.content ?? [];
      for (const part of content) if (part.type === 'text' && part.text) answer += part.text;
      return;
    }
    if (msg.type === 'result') {
      session.turns++;
      const text = String(msg.result ?? answer ?? '');
      if (msg.is_error || /not logged in/i.test(text)) {
        finish({ type: 'error', text: /not logged in|login/i.test(text) ? 'Claude Code isn’t signed in yet. In Terminal, run: claude auth login' : text || 'Something went wrong' });
        return;
      }
      const { summary, edits } = parseAnswer(text || answer);
      finish({ type: 'done', text: summary, edits });
    }
  };

  session.proc.stdin!.write(JSON.stringify({
    type: 'user',
    message: { role: 'user', content: [{ type: 'text', text: parts.join('\n\n') }] },
  }) + '\n');

  return () => {
    // Stop: end this session; the next prompt starts a fresh one
    session.proc.kill();
    finish({ type: 'error', text: 'Stopped' });
  };
}
