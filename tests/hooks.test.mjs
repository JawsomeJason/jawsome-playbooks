import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync, symlinkSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { test } from 'node:test';
import { PSTACK, world } from './helpers.mjs';

const HOOK = fileURLToPath(new URL('../hooks/playbook-reads.mjs', import.meta.url));
const BUNDLED = '/home/sam/.claude/plugins/cache/pstack-claude/pstack/1.0.0/skills/poteto-mode/playbooks/feature.md';
const hook = (tool_name, tool_input) => spawnSync(process.execPath, [HOOK], { input: JSON.stringify({ tool_name, tool_input }), encoding: 'utf8' });

test('reading an installed pstack playbook is blocked with the compute command to run', () => {
  for (const [tool, input] of [['Read', { file_path: BUNDLED }], ['Bash', { command: `sed -n 1,40p ${BUNDLED}` }]]) {
    const r = hook(tool, input);
    assert.equal(r.status, 2, tool);
    assert.match(r.stderr, /run `playbook show feature`/);
  }
});

test('layer files, pstack checkouts, listings and jstack itself pass', () => {
  for (const [tool, input] of [
    ['Read', { file_path: '/home/sam/.jstack/playbooks/feature-sam.md' }],
    ['Read', { file_path: '/home/sam/code/pstack/skills/poteto-mode/playbooks/feature.md' }],
    ['Bash', { command: 'ls /home/sam/.claude/plugins/cache/pstack-claude/pstack/1.0.0/skills/poteto-mode/playbooks/' }],
    ['Bash', { command: `JSTACK_PSTACK_DIR=x jstack-cli check # ${BUNDLED}` }],
    ['Bash', { command: `playbook show feature # ${BUNDLED}` }],
    ['Edit', { file_path: BUNDLED }],
  ]) {
    assert.equal(hook(tool, input).status, 0, JSON.stringify(input));
  }
});

test('the plugin registers the hook for Read and Bash', () => {
  const hooks = JSON.parse(readFileSync(new URL('../hooks/hooks.json', import.meta.url), 'utf8'));
  const entry = hooks.hooks.PreToolUse.find((h) => h.hooks.some((c) => c.command.includes('playbook-reads.mjs')));
  assert.equal(entry.matcher, 'Read|Bash');
});

const EDIT_HOOK = fileURLToPath(new URL('../hooks/playbook-edits.mjs', import.meta.url));

const editHook = (w, file, env = {}) =>
  spawnSync(process.execPath, [EDIT_HOOK], {
    cwd: w.repo,
    input: JSON.stringify({ tool_name: 'Edit', tool_input: { file_path: file } }),
    encoding: 'utf8',
    env: { ...process.env, HOME: w.home, JSTACK_CONFIG: w.config, JSTACK_PSTACK_DIR: PSTACK, ...env },
  });

test('edit hook blocks an Edit of a user playbook file in any scope, through a symlink too, and lets other files pass', () => {
  const w = world();
  symlinkSync(join(w.config, 'playbooks'), join(w.root, 'alias'));
  for (const blocked of ['playbooks/babysit-tester.md', 'playbooks/new-file.md', 'playbooks/orgs/acme/triage-acme.md', 'playbooks/repos/web/x.md']) {
    const r = editHook(w, join(w.config, blocked));
    assert.equal(r.status, 2, blocked);
    assert.match(r.stderr, /playbook extend/);
    assert.match(r.stderr, /playbook new/);
  }
  assert.equal(editHook(w, join(w.root, 'alias', 'babysit-tester.md')).status, 2);
  assert.equal(editHook(w, join(w.config, 'playbooks/babysit-tester.md'), { JSTACK_ALLOW_PLAYBOOK_EDITS: '1' }).status, 0);
  const fine = ['config.json', 'playbooks/notes.txt', 'scripts/x/run.md'].map((f) => join(w.config, f));
  for (const file of [...fine, join(w.repo, '.agents', 'playbooks', 'babysitting-an-acme-pr.md'), join(w.root, 'elsewhere.md')]) {
    assert.equal(editHook(w, file).status, 0, file);
  }
});

test('edit hook allows a direct edit of a file that has a check problem, and only that file', () => {
  const w = world({ files: { 'playbooks/stale.md': '---\nextends: babysit\nwhen: Stale\n---\n\n- **In** "No longer in pstack" Be brief.\n' } });
  assert.equal(editHook(w, join(w.config, 'playbooks/stale.md')).status, 0);
  assert.equal(editHook(w, join(w.config, 'playbooks/babysit-tester.md')).status, 2);
});

test('edit hook covers only top-level files of each scope folder, and leaves a README and deeper folders alone', () => {
  const w = world();
  for (const fine of ['playbooks/README.md', 'playbooks/archive/old.md', 'playbooks/orgs/acme/archive/old.md', 'playbooks/repos/web/README.md', 'playbooks/orgs/README.md']) {
    assert.equal(editHook(w, join(w.config, fine)).status, 0, fine);
  }
});

test('edit hook fails open and says so when the check cannot run', () => {
  const w = world();
  const r = editHook(w, join(w.config, 'playbooks/babysit-tester.md'), { JSTACK_PSTACK_DIR: join(w.root, 'nothing') });
  assert.equal(r.status, 0);
  assert.match(JSON.parse(r.stdout).systemMessage, /could not run `playbook check`.*not blocked/);
  assert.match(r.stderr, /could not run `playbook check`/);
});

test('the plugin registers the edit hook for Edit and Write', () => {
  const hooks = JSON.parse(readFileSync(new URL('../hooks/hooks.json', import.meta.url), 'utf8'));
  const entry = hooks.hooks.PreToolUse.find((h) => h.hooks.some((c) => c.command.includes('playbook-edits.mjs')));
  assert.equal(entry.matcher, 'Edit|Write');
});
