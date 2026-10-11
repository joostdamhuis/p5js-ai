// Starts everything the p5.js AI Editor needs, in one window:
//   the hub (port 3001) and the editor (port 3000).
// Claude's MCP server is started by the Claude app and finds the hub on its own.
//
// Run with: npm run studio   (or double-click start-p5.command)
import { spawn, execFileSync } from 'child_process';
import { existsSync, statSync, readdirSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MCP_DIR = path.join(REPO, 'p5js-mcp-server-ts');
const EDITOR_URL = 'http://localhost:3000';
const HUB_URL = 'http://localhost:3001';

const say = (msg = '') => console.log(msg);
const fail = (msg) => {
  say(`\n❌ ${msg}\n`);
  process.exit(1);
};

const sh = (cmd, args, opts = {}) => {
  try {
    return execFileSync(cmd, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], ...opts }).trim();
  } catch {
    return '';
  }
};

// ---------- 1. Make sure dependencies and Claude's MCP server are built ----------

const npm = (args, cwd) => {
  say(`📦 npm ${args.join(' ')} (${path.basename(cwd)})…`);
  execFileSync('npm', args, { cwd, stdio: 'inherit' });
};

const newestMtime = (dir) => {
  let newest = 0;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    newest = Math.max(newest, entry.isDirectory() ? newestMtime(p) : statSync(p).mtimeMs);
  }
  return newest;
};

if (!existsSync(path.join(REPO, 'node_modules'))) npm(['install'], REPO);
if (!existsSync(path.join(MCP_DIR, 'node_modules'))) npm(['install'], MCP_DIR);
const mcpBuilt = path.join(MCP_DIR, 'dist', 'index.js');
if (!existsSync(mcpBuilt) || newestMtime(path.join(MCP_DIR, 'src')) > statSync(mcpBuilt).mtimeMs) {
  npm(['run', 'build'], MCP_DIR);
}

// ---------- 2. Free ports 3000 and 3001, but only from our own old processes ----------

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function freePort(port) {
  const pids = sh('lsof', ['-nP', `-iTCP:${port}`, '-sTCP:LISTEN', '-t']).split('\n').filter(Boolean);
  for (const pid of pids) {
    const cwd = sh('lsof', ['-a', '-p', pid, '-d', 'cwd', '-Fn']).split('\n').find((l) => l.startsWith('n'))?.slice(1) || '';
    const name = sh('ps', ['-o', 'comm=', '-p', pid]).split('/').pop() || 'another app';
    if (!cwd.startsWith(REPO)) {
      fail(`Port ${port} is being used by ${name} (not this editor).\n   Quit ${name}, then double-click start-p5.command again.`);
    }
    say(`🧹 Stopping an old ${port === 3000 ? 'editor' : 'hub'} that was still running…`);
    try { process.kill(Number(pid), 'SIGTERM'); } catch {}
    for (let i = 0; i < 30 && sh('ps', ['-p', pid, '-o', 'pid=']); i++) await sleep(100);
    try { process.kill(Number(pid), 'SIGKILL'); } catch {}
  }
}

await freePort(3000);
await freePort(3001);

// ---------- 3. Start the hub and the editor; restart them if they crash ----------

const children = new Map();
let stopping = false;

function start(name, args, filter = () => true) {
  const child = spawn(process.execPath, args, {
    cwd: REPO,
    env: { ...process.env, FORCE_COLOR: '1' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  children.set(name, child);
  const prefix = name === 'hub' ? '[hub]    ' : '[editor] ';
  const pipe = (stream) => {
    let buffer = '';
    stream.on('data', (chunk) => {
      buffer += chunk;
      const lines = buffer.split('\n');
      buffer = lines.pop();
      for (const line of lines) if (line.trim() && filter(line)) say(prefix + line);
    });
  };
  pipe(child.stdout);
  pipe(child.stderr);
  child.on('exit', (code) => {
    children.delete(name);
    if (stopping) return;
    say(`⚠️  The ${name} stopped (code ${code}). Restarting it…`);
    setTimeout(() => start(name, args, filter), 1000);
  });
}

start('hub', ['websocket-bridge-server.js'], (line) => !line.includes('Heartbeat'));
start('editor', [path.join(REPO, 'node_modules', 'next', 'dist', 'bin', 'next'), 'dev', '-p', '3000']);

const stopAll = () => {
  if (stopping) return;
  stopping = true;
  say('\n👋 Stopping the editor and hub…');
  for (const child of children.values()) child.kill('SIGTERM');
  setTimeout(() => process.exit(0), 500);
};
process.on('SIGINT', stopAll);
process.on('SIGTERM', stopAll);
process.on('SIGHUP', stopAll); // Terminal window closed

// ---------- 4. Wait until both answer, then open the browser ----------

async function waitFor(url, check, seconds) {
  for (let i = 0; i < seconds * 2; i++) {
    try {
      const res = await fetch(url);
      if (await check(res)) return true;
    } catch {}
    await sleep(500);
  }
  return false;
}

const hubOk = await waitFor(HUB_URL, async (res) => (await res.json()).hub === 'p5js-editor', 20);
const editorOk = await waitFor(EDITOR_URL, async (res) => res.ok, 120);

if (!hubOk || !editorOk) {
  say(`\n⚠️  ${!hubOk ? 'The hub' : 'The editor'} didn't start. Scroll up for the error, or ask Claude to look at it.`);
} else {
  sh('open', [EDITOR_URL]);
  say('');
  say('✅ The p5.js editor is running at ' + EDITOR_URL);
  say('   Claude connects on its own (the Claude app needs to be open).');
  say('   Keep this window open while you work. Close it to stop everything.');
  say('');
}
