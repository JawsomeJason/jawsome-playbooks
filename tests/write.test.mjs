import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { CLI, PSTACK, world } from './helpers.mjs';

const read = (path) => readFileSync(path, 'utf8');
const piped = (w, args, input) => {
  const r = spawnSync(process.execPath, [CLI, ...args], {
    cwd: w.repo,
    input,
    encoding: 'utf8',
    env: { ...process.env, HOME: w.home, JSTACK_CONFIG: w.config, JSTACK_PSTACK_DIR: PSTACK },
  });
  return { status: r.status, stdout: r.stdout, stderr: r.stderr };
};

test('extend creates a user file whose backticks and quotes survive stdin, and check passes', () => {
  const w = world();
  const r = piped(w, ['playbook', 'extend', 'babysit', 'mine', 'in', 'Declare the mode', '--with', '-', '--when', 'Babysitting a PR'], 'Run `gh pr view --json "state"`.\n');
  assert.equal(r.status, 0, r.stderr);
  assert.equal(read(join(w.config, '01-user', 'mine.md')), '---\nextends: babysit\nwhen: Babysitting a PR\n---\n\n- **In** "Declare the mode" Run `gh pr view --json "state"`.\n');
  assert.match(r.stdout, /# babysit step 2 /);
  assert.match(r.stdout, /Run `gh pr view --json "state"`\.   \[pstack ~ user\]/);
  assert.equal(w.run(['check']).status, 0);
});

test('extend appends to an existing file and adds the parent to extends', () => {
  const w = world({ files: { '01-user/combo.md': '---\nextends: feature\nwhen: Features\n---\n\n- **After** "Name the data shape" Think first.\n' } });
  const r = w.run(['playbook', 'extend', 'babysit', 'combo', 'in', 'Declare the mode', '--with', 'Be brief.']);
  assert.equal(r.status, 0, r.stderr);
  assert.equal(read(join(w.config, '01-user', 'combo.md')), '---\nextends: feature, babysit\nwhen: Features\n---\n\n- **After** "Name the data shape" Think first.\n- **In** "Declare the mode" Be brief.\n');
});

test('extend writes org and repo overrides, and never a team folder', () => {
  const w = world();
  assert.equal(w.run(['playbook', 'extend', 'babysit', 'o', 'in', 'Declare the mode', '--with', 'x', '--when', 'w', '--layer', 'org']).status, 0);
  assert.equal(w.run(['playbook', 'extend', 'babysit', 'r', 'in', 'Declare the mode', '--with', 'x', '--when', 'w', '--layer', 'repo']).status, 0);
  assert.ok(existsSync(join(w.config, '02-orgs', 'acme', '02-overrides', 'o.md')));
  assert.ok(existsSync(join(w.config, '03-repos', 'web', '02-overrides', 'r.md')));
  assert.equal(existsSync(join(w.config, '02-orgs', 'acme', '01-standard', 'o.md')), false);
  const team = w.run(['playbook', 'extend', 'babysit', 'o', 'in', 'Declare the mode', '--with', 'x', '--layer', 'team']);
  assert.equal(team.status, 2);
});

test('extend refuses a quote that matches no step or several, and writes nothing', () => {
  const w = world();
  const none = w.run(['playbook', 'extend', 'babysit', 'mine', 'in', 'Not a phrase', '--with', 'x', '--when', 'w']);
  assert.equal(none.status, 1);
  assert.match(none.stderr, /quote not found/);
  const many = w.run(['playbook', 'extend', 'babysit', 'mine', 'in', 'the', '--with', 'x', '--when', 'w']);
  assert.equal(many.status, 1);
  assert.match(many.stderr, /matches steps 1, 2, 3 and 4/);
  assert.match(many.stderr, /\n1\. .*\n2\. /s);
  assert.equal(existsSync(join(w.config, '01-user', 'mine.md')), false);
});

test('extend refuses a new file without --when, and a missing text source', () => {
  const w = world();
  assert.match(w.run(['playbook', 'extend', 'babysit', 'mine', 'in', 'Declare the mode', '--with', 'x']).stderr, /needs --when/);
  assert.match(w.run(['playbook', 'extend', 'babysit', 'mine', 'in', 'Declare the mode', '--when', 'w']).stderr, /exactly one of --with and --with-file/);
});

test('an edit that fails check is rolled back to the prior bytes, or the new file is removed', () => {
  const path = '01-user/combo.md';
  const prior = '---\nextends: babysit\nwhen: Babysitting\n---\n\n- **In** "Declare the mode" Be brief.\n';
  const w = world({ files: { [path]: prior } });
  const bad = w.run(['playbook', 'extend', 'babysit', 'combo', 'in', 'Declare the mode', '--with', 'see babysit step 99']);
  assert.equal(bad.status, 1);
  assert.match(bad.stderr, /nothing was written/);
  assert.match(bad.stderr, /babysit step 99, but babysit has 6 steps/);
  assert.equal(read(join(w.config, path)), prior);
  const fresh = w.run(['playbook', 'extend', 'babysit', 'fresh', 'in', 'Declare the mode', '--with', 'see babysit step 99', '--when', 'w']);
  assert.equal(fresh.status, 1);
  assert.equal(existsSync(join(w.config, '01-user', 'fresh.md')), false);
  assert.equal(w.run(['check']).status, 0);
});

test('new makes a standalone playbook and refuses a taken name, no steps, or edit lines', () => {
  const w = world();
  const ok = piped(w, ['playbook', 'new', 'tidy-up', '--when', 'Tidying up', '--from-file', '-'], '1. **Sweep.** Clear the desk.\n2. **Stop.** Done.\n');
  assert.equal(ok.status, 0, ok.stderr);
  assert.equal(read(join(w.config, '01-user', 'tidy-up.md')), '---\nextends:\nwhen: Tidying up\n---\n\n1. **Sweep.** Clear the desk.\n2. **Stop.** Done.\n');
  assert.equal(w.run(['check']).status, 0);
  const refuse = (name, body) => piped(w, ['playbook', 'new', name, '--when', 'w', '--from-file', '-'], body);
  assert.match(refuse('babysit', '1. a\n').stderr, /already exists/);
  assert.match(refuse('tidy-up', '1. a\n').stderr, /already exists/);
  assert.match(refuse('plain', 'Just prose.\n').stderr, /no numbered steps/);
  assert.match(refuse('edits', '1. a\n- **In** "a" b\n').stderr, /cannot carry edit lines/);
  assert.equal(refuse('plain', 'Just prose.\n').status, 1);
  assert.equal(existsSync(join(w.config, '01-user', 'plain.md')), false);
});

test('new refuses a name that a lower layer defines', () => {
  const w = world({ files: { '01-user/tidy-up.md': '---\nextends:\nwhen: Tidying\n---\n\n1. a\n' } });
  const r = piped(w, ['playbook', 'new', 'tidy-up', '--when', 'w', '--from-file', '-', '--layer', 'repo'], '1. b\n');
  assert.equal(r.status, 1);
  assert.match(r.stderr, /already exists at or below the repo\.overrides layer/);
});

test('write options are refused on read commands', () => {
  const w = world();
  assert.equal(w.run(['check', '--with', 'x']).status, 2);
});
