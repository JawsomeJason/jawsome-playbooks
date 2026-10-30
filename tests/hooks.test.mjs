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
    ['Read', { file_path: '/home/sam/.jstack/01-user/feature.md' }],
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

const LAYER_HOOK = fileURLToPath(new URL('../hooks/layer-edits.mjs', import.meta.url));

test('layer hook blocks an Edit of a layer file, through a symlink too, and lets other files pass', () => {
  const w = world();
  symlinkSync(join(w.config, '01-user'), join(w.root, 'alias'));
  const hook = (file, env = {}) =>
    spawnSync(process.execPath, [LAYER_HOOK], {
      input: JSON.stringify({ tool_name: 'Edit', tool_input: { file_path: file } }),
      encoding: 'utf8',
      env: { ...process.env, HOME: w.home, JSTACK_CONFIG: w.config, JSTACK_PSTACK_DIR: PSTACK, ...env },
    });
  for (const blocked of ['01-user/babysit.md', '01-user/new-file.md', '02-orgs/acme/02-overrides/babysit.md', '03-repos/web/02-overrides/x.md']) {
    const r = hook(join(w.config, blocked));
    assert.equal(r.status, 2, blocked);
    assert.match(r.stderr, /playbook extend/);
    assert.match(r.stderr, /playbook new/);
  }
  assert.equal(hook(join(w.root, 'alias', 'babysit.md')).status, 2);
  assert.equal(hook(join(w.config, '01-user/babysit.md'), { JSTACK_ALLOW_LAYER_EDITS: '1' }).status, 0);
  for (const fine of ['config.json', '02-orgs/acme/01-standard/babysit.md', '01-user/notes.txt'].map((f) => join(w.config, f)).concat(join(w.root, 'elsewhere.md'))) {
    assert.equal(hook(fine).status, 0, fine);
  }
});

const layerHook = (w, file, env = {}) =>
  spawnSync(process.execPath, [LAYER_HOOK], {
    cwd: w.repo,
    input: JSON.stringify({ tool_name: 'Edit', tool_input: { file_path: file } }),
    encoding: 'utf8',
    env: { ...process.env, HOME: w.home, JSTACK_CONFIG: w.config, JSTACK_PSTACK_DIR: PSTACK, ...env },
  });

test('layer hook allows a direct edit of a layer file that has a check problem, and only that file', () => {
  const w = world({ files: { '01-user/stale.md': '---\nextends: babysit\nwhen: Stale\n---\n\n- **In** "No longer in pstack" Be brief.\n' } });
  assert.equal(layerHook(w, join(w.config, '01-user/stale.md')).status, 0);
  assert.equal(layerHook(w, join(w.config, '01-user/babysit.md')).status, 2);
});

test('layer hook covers only top-level files, and leaves a README and subfolders alone', () => {
  const w = world();
  for (const fine of ['01-user/README.md', '01-user/archive/old.md', '02-orgs/acme/02-overrides/archive/old.md', '03-repos/web/02-overrides/README.md']) {
    assert.equal(layerHook(w, join(w.config, fine)).status, 0, fine);
  }
});

test('layer hook fails open and says so when the check cannot run', () => {
  const w = world();
  const r = layerHook(w, join(w.config, '01-user/babysit.md'), { JSTACK_PSTACK_DIR: join(w.root, 'nothing') });
  assert.equal(r.status, 0);
  assert.match(JSON.parse(r.stdout).systemMessage, /could not run `playbook check`.*not blocked/);
  assert.match(r.stderr, /could not run `playbook check`/);
});

test('the plugin registers the layer-edit hook for Edit and Write', () => {
  const hooks = JSON.parse(readFileSync(new URL('../hooks/hooks.json', import.meta.url), 'utf8'));
  const entry = hooks.hooks.PreToolUse.find((h) => h.hooks.some((c) => c.command.includes('layer-edits.mjs')));
  assert.equal(entry.matcher, 'Edit|Write');
});
