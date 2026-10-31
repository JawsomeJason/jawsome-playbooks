import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, symlinkSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { CLI, PLAYBOOK, PSTACK, tempDir, world } from './helpers.mjs';

function bins() {
  const w = world();
  const env = { ...process.env, HOME: w.home, PLAYBOOKS_CONFIG: w.config, PLAYBOOKS_PSTACK_DIR: PSTACK };
  const exec = (bin, args) => {
    const r = spawnSync(bin, args, { cwd: w.repo, encoding: 'utf8', env });
    return { status: r.status, stdout: r.stdout, stderr: r.stderr };
  };
  return { playbook: (...args) => exec(PLAYBOOK, args), script: (...args) => exec(process.execPath, [CLI, ...args]) };
}

test('playbook show prints what compute and a direct run of the script print, as text and as JSON', () => {
  const { playbook, script } = bins();
  for (const flags of [[], ['--json']]) {
    const show = playbook('show', 'babysit', ...flags);
    assert.equal(show.status, 0, show.stderr);
    assert.match(show.stdout, /\S/);
    assert.deepEqual(show, playbook('compute', 'babysit', ...flags));
    assert.deepEqual(show, script('show', 'babysit', ...flags));
  }
});

test('playbook is the only bin, and it rejects the grouped command shape of the removed alias', () => {
  assert.equal(existsSync(join(PLAYBOOK, '..', 'jstack-cli')), false);
  const { playbook } = bins();
  for (const args of [['playbook', 'list'], ['playbook', 'show', 'babysit']]) {
    assert.equal(playbook(...args).status, 2, args.join(' '));
  }
  assert.match(playbook('--help').stdout, /^usage: playbook list/);
  assert.doesNotMatch(playbook('--help').stdout, /jstack/);
});

test('playbook runs through a symlink placed on PATH', () => {
  const dir = tempDir();
  symlinkSync(PLAYBOOK, join(dir, 'playbook'));
  const r = spawnSync(join(dir, 'playbook'), ['--help'], { encoding: 'utf8', env: { ...process.env } });
  assert.match(r.stdout, /^usage: playbook list/);
});
