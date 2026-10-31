import { spawnSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const CLI = fileURLToPath(new URL('../skills/playbook/scripts/playbook.mjs', import.meta.url));
export const BIN = fileURLToPath(new URL('../bin/jstack-cli', import.meta.url));
export const PLAYBOOK = fileURLToPath(new URL('../bin/playbook', import.meta.url));
export const FIXTURES = fileURLToPath(new URL('./fixtures/', import.meta.url));

const made = [];
process.once('exit', () => {
  for (const dir of made) rmSync(dir, { recursive: true, force: true });
});
export const tempDir = () => {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), 'playbooks-test-')));
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
 * A temp copy of the fixture config, plus a git checkout of `web` whose .agents/playbooks holds the team files, as
 * committed copies: the acme org files pinned in .agents/playbooks.lock, as a sync writes them, and web's own files
 * outside the lock. config.json records the checkout. `files` writes extra config files and `team` extra team files
 * (null deletes one); `links` adds symlinks, keyed by config-relative path, or checkout-relative under `.agents/`.
 */
export function world({ files = {}, team = {}, links = {}, remote = 'git@example.com:acme-eng/web.git', checkout = true } = {}) {
  const root = tempDir();
  const config = join(root, 'config');
  cpSync(join(FIXTURES, 'config'), config, { recursive: true, verbatimSymlinks: true });
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
    const dir = join(repo, '.agents', 'playbooks');
    mkdirSync(dir, { recursive: true });
    const org = readdirSync(join(FIXTURES, 'team', 'acme'));
    for (const name of org) cpSync(join(FIXTURES, 'team', 'acme', name), join(dir, name));
    for (const name of readdirSync(join(FIXTURES, 'team', 'web'))) cpSync(join(FIXTURES, 'team', 'web', name), join(dir, name));
    for (const [name, content] of Object.entries(team)) {
      if (content === null) rmSync(join(dir, name));
      else writeFileSync(join(dir, name), content);
    }
    const lock = { source: 'acme-eng/agents', commit: '0'.repeat(40), files: Object.fromEntries(org.map((name) => [name, 'sha256:0'])) };
    writeFileSync(join(repo, '.agents', 'playbooks.lock'), `${JSON.stringify(lock, null, 2)}\n`);
    const settings = JSON.parse(readFileSync(join(config, 'config.json'), 'utf8'));
    writeFileSync(join(config, 'config.json'), `${JSON.stringify({ ...settings, repos: { web: { checkout: repo } } }, null, 2)}\n`);
  }
  for (const [path, content] of Object.entries(files)) {
    mkdirSync(dirname(join(config, path)), { recursive: true });
    writeFileSync(join(config, path), content);
  }
  for (const [path, target] of Object.entries(links)) {
    const at = path.startsWith('.agents/') ? join(repo, path) : join(config, path);
    mkdirSync(dirname(at), { recursive: true });
    symlinkSync(target, at);
  }
  const run = (args, { cwd = repo ?? outside, env = {} } = {}) => {
    const r = spawnSync(process.execPath, [CLI, ...args], {
      cwd,
      encoding: 'utf8',
      env: withoutNulls({ ...process.env, ...GIT_ENV, HOME: home, PLAYBOOKS_CONFIG: config, PLAYBOOKS_PSTACK_DIR: PSTACK, ...env }),
    });
    return { status: r.status, stdout: r.stdout, stderr: r.stderr };
  };
  return { root, config, repo, home, outside, run };
}

/** The env with every key whose value is null removed, so a test can unset a variable the defaults set. */
export const withoutNulls = (env) => Object.fromEntries(Object.entries(env).filter(([, v]) => v !== null));

export const lines = (text) => text.split('\n').filter(Boolean);
