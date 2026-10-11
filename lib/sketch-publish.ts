// Server-only: commits the sketches/ folder and pushes it to GitHub, so the
// editor's Save button backs sketches up without opening GitHub Desktop.
//
// Pushes with a deploy key that only has access to this repository
// (~/.ssh/p5js_editor_deploy). GitHub Desktop keeps using its own login;
// afterwards we move origin/main along so Desktop shows everything as pushed.
import { execFile } from 'child_process';
import { promisify } from 'util';
import os from 'os';
import path from 'path';

const run = promisify(execFile);
const REPO = process.cwd();
const KEY = path.join(os.homedir(), '.ssh', 'p5js_editor_deploy');
const SSH = `ssh -i "${KEY}" -o IdentitiesOnly=yes -o BatchMode=yes`;
const BRANCH = 'main';

export type PublishResult =
  | { status: 'pushed' | 'up-to-date' }
  | { status: 'saved-locally'; reason: string };

const git = (...args: string[]) =>
  run('git', ['-c', `core.sshCommand=${SSH}`, ...args], { cwd: REPO, timeout: 30_000 });

// One git run at a time; quick double-clicks queue up instead of colliding
let queue: Promise<unknown> = Promise.resolve();

export function publishSketches(projectName: string): Promise<PublishResult> {
  const job = queue.then(() => publish(projectName));
  queue = job.catch(() => {});
  return job;
}

async function publish(projectName: string): Promise<PublishResult> {
  // Commit only the sketches folder, never other work in progress
  await git('add', '-A', '--', 'sketches');
  const { stdout: staged } = await git('diff', '--cached', '--name-only', '--', 'sketches');
  if (staged.trim()) {
    const name = projectName.replace(/[\r\n]+/g, ' ').slice(0, 80) || 'sketch';
    await git('commit', '-m', `Save sketch: ${name}`, '--', 'sketches');
  }

  const { stdout: originUrl } = await git('remote', 'get-url', 'origin');
  const match = originUrl.trim().match(/github\.com[/:](.+?)(?:\.git)?$/);
  if (!match) return { status: 'saved-locally', reason: 'No GitHub repository linked' };

  const { stdout: ahead } = await git('rev-list', '--count', `origin/${BRANCH}..HEAD`).catch(() => ({ stdout: '1' }));
  if (!staged.trim() && ahead.trim() === '0') return { status: 'up-to-date' };

  try {
    await git('push', `git@github.com:${match[1]}.git`, `HEAD:${BRANCH}`);
  } catch (error) {
    const message = String((error as { stderr?: string }).stderr || error);
    const reason = /rejected|non-fast-forward|fetch first/.test(message)
      ? 'GitHub has newer changes. Pull them in GitHub Desktop first'
      : /Permission denied|publickey|denied/.test(message)
        ? 'The deploy key is missing or has no write access on GitHub'
        : 'Could not reach GitHub';
    console.error('Publishing sketches failed:', message);
    return { status: 'saved-locally', reason };
  }

  await git('update-ref', `refs/remotes/origin/${BRANCH}`, 'HEAD');
  return { status: 'pushed' };
}
