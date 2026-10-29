import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

const HOOK = fileURLToPath(new URL('../hooks/playbook-reads.mjs', import.meta.url));
const BUNDLED = '/home/sam/.claude/plugins/cache/pstack-claude/pstack/1.0.0/skills/poteto-mode/playbooks/feature.md';
const hook = (tool_name, tool_input) => spawnSync(process.execPath, [HOOK], { input: JSON.stringify({ tool_name, tool_input }), encoding: 'utf8' });

test('reading an installed pstack playbook is blocked with the compute command to run', () => {
  for (const [tool, input] of [['Read', { file_path: BUNDLED }], ['Bash', { command: `sed -n 1,40p ${BUNDLED}` }]]) {
    const r = hook(tool, input);
    assert.equal(r.status, 2, tool);
    assert.match(r.stderr, /run `jstack-cli playbook compute feature`/);
  }
});

test('layer files, pstack checkouts, listings and jstack itself pass', () => {
  for (const [tool, input] of [
    ['Read', { file_path: '/home/sam/.jstack/01-user/feature.md' }],
    ['Read', { file_path: '/home/sam/code/pstack/skills/poteto-mode/playbooks/feature.md' }],
    ['Bash', { command: 'ls /home/sam/.claude/plugins/cache/pstack-claude/pstack/1.0.0/skills/poteto-mode/playbooks/' }],
    ['Bash', { command: `JSTACK_PSTACK_DIR=x jstack-cli check # ${BUNDLED}` }],
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
