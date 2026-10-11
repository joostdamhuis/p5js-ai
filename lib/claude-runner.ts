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
  sketchName: string;
  files: { name: string; content: string }[];
  errors: string[];
  history: { prompt: string; reply: string }[];
  model?: string;
  // Reference images, as data URLs
  attachments?: { name: string; dataUrl: string }[];
}

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

// Models the prompt box can pick (anything else falls back to Claude Code's default)
export const MODELS = ['claude-opus-5-5', 'claude-sonnet-5-5', 'claude-haiku-5-5'];

const MCP_SERVER = path.join(process.cwd(), 'p5js-mcp-server-ts/dist/index.js');

function systemPrompt(ctx: PromptContext) {
  return [
    'You are Claude, working inside the user’s local p5.js editor through the p5js-editor tools.',
    'The user typed a request into the editor’s prompt box while looking at their running sketch.',
    'Make the change directly: use update_code with the COMPLETE file (select_file first for files other than sketch.js), then start_execution.',
    'Keep the dials() controls at the top of the sketch working and add controls for new settings where it helps. Keep existing control and folder names (e.g. don’t rename a `blues` folder to `reds` when changing colours); change their default values instead, so the Controls panel follows.',
    'Don’t ask questions; make a sensible choice. When done, reply with ONE short plain sentence describing what changed, no code, no markdown.',
    '',
    `Sketch: ${ctx.sketchName}`,
    ...ctx.files.map(f => `\n--- ${f.name} ---\n${f.content}`),
    ctx.errors.length ? `\nRecent console errors:\n${ctx.errors.join('\n')}` : '',
    ctx.history.length
      ? '\nEarlier requests in this sketch (oldest first):\n' + ctx.history.map(h => `- “${h.prompt}” → ${h.reply}`).join('\n')
      : '',
  ].join('\n');
}

export type RunEvent =
  | { type: 'status'; text: string }
  | { type: 'done'; text: string }
  | { type: 'error'; text: string };

const TOOL_STATUS: Record<string, string> = {
  get_sketch: 'Reading the sketch…',
  Read: 'Looking at your image…',
  update_code: 'Writing code…',
  select_file: 'Opening a file…',
  create_file: 'Adding a file…',
  start_execution: 'Running it…',
  stop_execution: 'Stopping…',
};

// Runs one prompt with Claude Code in the background; calls onEvent as it goes
export function runPrompt(ctx: PromptContext, onEvent: (e: RunEvent) => void): ChildProcess | null {
  const bin = findClaude();
  if (!bin) {
    onEvent({ type: 'error', text: 'Claude Code isn’t installed. See CLAUDE.md → Prompt box.' });
    return null;
  }

  const images = saveAttachments(ctx.attachments);
  const prompt = images.length
    ? `${ctx.prompt}\n\nI attached ${images.length === 1 ? 'an image' : `${images.length} images`} as reference; look at ${images.length === 1 ? 'it' : 'them'} with Read first:\n${images.join('\n')}`
    : ctx.prompt;

  const mcpConfig = JSON.stringify({
    mcpServers: { 'p5js-editor': { command: process.execPath, args: [MCP_SERVER] } },
  });
  const args = [
    '-p', prompt,
    '--output-format', 'stream-json',
    '--verbose',
    '--mcp-config', mcpConfig,
    '--strict-mcp-config',
    '--allowedTools', 'mcp__p5js-editor', `Read(/${ATTACH_DIR}/**)`,
    '--disallowedTools', 'Bash,Edit,Write,NotebookEdit,WebFetch,WebSearch,Task',
    '--append-system-prompt', systemPrompt(ctx),
    ...(ctx.model && MODELS.includes(ctx.model) ? ['--model', ctx.model] : []),
  ];

  const child = spawn(bin, args, { cwd: process.cwd(), stdio: ['ignore', 'pipe', 'pipe'], env: process.env });
  let buffer = '';
  let finished = false;
  let stderr = '';

  child.stdout.on('data', (chunk: Buffer) => {
    buffer += chunk.toString();
    let nl;
    while ((nl = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, nl).trim();
      buffer = buffer.slice(nl + 1);
      if (!line) continue;
      let msg: any;
      try { msg = JSON.parse(line); } catch { continue; }
      if (msg.type === 'assistant') {
        for (const part of msg.message?.content ?? []) {
          if (part.type === 'tool_use') {
            const name = String(part.name).replace('mcp__p5js-editor__', '');
            onEvent({ type: 'status', text: TOOL_STATUS[name] ?? 'Working…' });
          } else if (part.type === 'thinking') {
            onEvent({ type: 'status', text: 'Thinking…' });
          }
        }
      } else if (msg.type === 'result') {
        finished = true;
        const text = String(msg.result ?? '').trim();
        if (msg.is_error || /not logged in/i.test(text)) {
          onEvent({ type: 'error', text: /not logged in|login/i.test(text) ? 'Claude Code isn’t signed in yet. In Terminal, run: claude auth login' : text || 'Something went wrong' });
        } else {
          onEvent({ type: 'done', text: text || 'Done.' });
        }
      }
    }
  });
  child.stderr.on('data', (chunk: Buffer) => { stderr += chunk.toString(); });
  child.on('close', (code) => {
    if (!finished) onEvent({ type: 'error', text: code === null ? 'Stopped' : (stderr.trim().split('\n').pop() || `Claude Code exited (${code})`) });
  });
  child.on('error', (err) => onEvent({ type: 'error', text: err.message }));
  return child;
}
