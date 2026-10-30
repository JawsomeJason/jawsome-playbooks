import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const read = (path) => JSON.parse(readFileSync(new URL(`../${path}`, import.meta.url), 'utf8'));

test('all five manifests carry the same version', () => {
  const versions = {
    '.claude-plugin/plugin.json': read('.claude-plugin/plugin.json').version,
    '.claude-plugin/marketplace.json': read('.claude-plugin/marketplace.json').plugins.find((p) => p.name === 'jstack')?.version,
    '.codex-plugin/plugin.json': read('.codex-plugin/plugin.json').version,
    '.muse-plugin/plugin.json': read('.muse-plugin/plugin.json').version,
    'package.json': read('package.json').version,
  };
  const expected = versions['package.json'];
  assert.match(expected, /^\d+\.\d+\.\d+/);
  assert.deepEqual(versions, Object.fromEntries(Object.keys(versions).map((path) => [path, expected])));
});

test('the mode contract falls back to jstack-cli, and to poteto-mode only without either command', () => {
  const contract = readFileSync(new URL('../skills/setup/references/mode-contract.md', import.meta.url), 'utf8');
  assert.match(contract, /`playbook` or `jstack-cli`, whichever is on `PATH`/);
  assert.match(contract, /When neither is on `PATH`, it follows poteto-mode as written/);
});
