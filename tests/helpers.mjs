import { spawnSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const CLI = fileURLToPath(new URL('../skills/playbook/scripts/jstack.mjs', import.meta.url));
export const BIN = fileURLToPath(new URL('../bin/jstack-cli', import.meta.url));
export const FIXTURES = fileURLToPath(new URL('./fixtures/', import.meta.url));

const made = [];
process.once('exit', () => {
  for (const dir of made) rmSync(dir, { recursive: true, force: true });
});
export const tempDir = () => {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), 'jstack-test-')));
  made.push(dir);
  return dir;
};

// poteto-mode's SKILL.md is written here, not kept in fixtures, because the repo lint would read it as a skill of this repo.
const pstacks = join(tempDir(), 'pstack');
cpSync(join(FIXTURES, 'pstack'), pstacks, { recursive: true });
writeFileSync(join(pstacks, '1.0.0', 'skills', 'poteto-mode', 'SKILL.md'), '# Poteto mode\n\n## Comments\n\nKeep a comment only for a non-obvious why.\n');
export const PSTACK = join(pstacks, '1.0.0');

const GIT_ENV = {
  GIT_AUTHOR_NAME: 'Test Author',
  GIT_AUTHOR_EMAIL: 'author@example.com',
  GIT_COMMITTER_NAME: 'Test Author',
  GIT_COMMITTER_EMAIL: 'author@example.com',
  GIT_CONFIG_GLOBAL: '/dev/null',
  GIT_CONFIG_NOSYSTEM: '1',
};

export function git(cwd, args) {
  const r = spawnSync('git', args, { cwd, encoding: 'utf8', env: { ...process.env, ...GIT_ENV } });
  if (r.status !== 0) throw new Error(`git ${args.join(' ')}: ${r.stderr}`);
  return r.stdout;
}

/**
 * A temp copy of the fixture config, plus a git checkout of `web` whose .agents/playbooks links to the config's
 * team folder. `files` writes extra config files, `links` adds symlinks, both keyed by config-relative path.
 */
export function world({ files = {}, links = {}, remote = 'git@example.com:acme-eng/web.git', checkout = true } = {}) {
  const root = tempDir();
  const config = join(root, 'config');
  cpSync(join(FIXTURES, 'config'), config, { recursive: true, verbatimSymlinks: true });
  for (const [path, content] of Object.entries(files)) {
    mkdirSync(dirname(join(config, path)), { recursive: true });
    writeFileSync(join(config, path), content);
  }
  // Muse refuses to install a plugin that contains a symlink, so the fixtures store none and this link is made here.
  const teamLinks = { '03-repos/web/01-team/babysit.md': '../../../02-orgs/acme/01-standard/babysit.md', ...links };
  for (const [path, target] of Object.entries(teamLinks)) symlinkSync(target, join(config, path));
  const home = join(root, 'home');
  const outside = join(root, 'outside');
  mkdirSync(home);
  mkdirSync(outside);
  let repo = null;
  if (checkout) {
    repo = join(root, 'web');
    mkdirSync(repo);
    git(repo, ['init', '-q', '-b', 'main']);
    git(repo, ['remote', 'add', 'origin', remote]);
    writeFileSync(join(repo, 'README.md'), 'web\n');
    git(repo, ['add', '-A']);
    git(repo, ['commit', '-q', '-m', 'init']);
    mkdirSync(join(repo, '.agents'));
    symlinkSync(join(config, '03-repos', 'web', '01-team'), join(repo, '.agents', 'playbooks'));
  }
  const run = (args, { cwd = repo ?? outside, env = {} } = {}) => {
    const r = spawnSync(process.execPath, [CLI, ...args], {
      cwd,
      encoding: 'utf8',
      env: { ...process.env, ...GIT_ENV, HOME: home, JSTACK_CONFIG: config, JSTACK_PSTACK_DIR: PSTACK, ...env },
    });
    return { status: r.status, stdout: r.stdout, stderr: r.stderr };
  };
  return { root, config, repo, home, outside, run };
}

export const lines = (text) => text.split('\n').filter(Boolean);
