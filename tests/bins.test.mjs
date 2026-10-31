import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { symlinkSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { BIN, PLAYBOOK, PSTACK, tempDir, world } from './helpers.mjs';

function bins() {
  const w = world();
  const env = { ...process.env, HOME: w.home, PLAYBOOKS_CONFIG: w.config, PLAYBOOKS_PSTACK_DIR: PSTACK };
  const exec = (bin, args) => {
    const r = spawnSync(bin, args, { cwd: w.repo, encoding: 'utf8', env });
    return { status: r.status, stdout: r.stdout, stderr: r.stderr };
  };
  return { playbook: (...args) => exec(PLAYBOOK, args), cli: (...args) => exec(BIN, args) };
}

test('playbook show prints what jstack-cli playbook compute prints, as text and as JSON', () => {
  const { playbook, cli } = bins();
  for (const flags of [[], ['--json']]) {
    const show = playbook('show', 'babysit', ...flags);
    assert.equal(show.status, 0, show.stderr);
    assert.match(show.stdout, /\S/);
    assert.deepEqual(show, cli('playbook', 'compute', 'babysit', ...flags));
    assert.deepEqual(show, playbook('compute', 'babysit', ...flags));
    assert.deepEqual(show, cli('playbook', 'show', 'babysit', ...flags));
  }
});

test('playbook and jstack-cli run list, locate, and check to the same output', () => {
  const { playbook, cli } = bins();
  assert.deepEqual(playbook('list', '--json'), cli('playbook', 'list', '--json'));
  assert.deepEqual(playbook('locate', 'babysit', 'anything', '--json'), cli('playbook', 'locate', 'babysit', 'anything', '--json'));
  const check = playbook('check', '--json');
  assert.equal(check.status, 0, check.stderr);
  assert.deepEqual(check, cli('check', '--json'));
});

test('each bin accepts only its own command shapes, and prints its own name in the usage', () => {
  const { playbook, cli } = bins();
  for (const args of [['playbook', 'list'], ['playbook', 'show', 'babysit']]) {
    assert.equal(playbook(...args).status, 2, args.join(' '));
  }
  for (const args of [['list'], ['show', 'babysit'], ['compute', 'babysit']]) {
    assert.equal(cli(...args).status, 2, args.join(' '));
  }
  assert.match(playbook('--help').stdout, /^usage: playbook list/);
  assert.match(cli('--help').stdout, /^usage: jstack-cli playbook list/);
});

test('playbook runs through a symlink placed on PATH', () => {
  const dir = tempDir();
  symlinkSync(PLAYBOOK, join(dir, 'playbook'));
  const r = spawnSync(join(dir, 'playbook'), ['--help'], { encoding: 'utf8', env: { ...process.env } });
  assert.match(r.stdout, /^usage: playbook list/);
});
