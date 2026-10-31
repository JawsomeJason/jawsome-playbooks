import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const README = join(dirname(fileURLToPath(import.meta.url)), '..', 'README.md');
const INSTALL_STEPS = 5;

function pstackReadmePath() {
  if (process.env.PSTACK_CLAUDE_README) return process.env.PSTACK_CLAUDE_README;
  const home = homedir();
  return readdirSync(home)
    .filter((entry) => entry.startsWith('.'))
    .map((dot) => join(home, dot, 'plugins', 'marketplaces', 'pstack-claude', 'README.md'))
    .find((path) => existsSync(path));
}

/**
 * pstack-claude names a harness in an install `<summary>`, or in the sentence under "Other harnesses" that lists
 * the harnesses reading `~/.agents/skills/`. A listed item that names a harness already found, such as
 * "skills-only Codex installs", is a variant of it, not a harness.
 */
function pstackHarnesses(readme) {
  const summaries = [...readme.matchAll(/<summary><strong>(.+?)<\/strong><\/summary>/g)].map((m) => m[1]);
  const harnesses = summaries.filter((name) => name !== 'Other harnesses');
  const shared = readme.match(/^(.+?) read skills from `~\/\.agents\/skills\/`/m);
  assert.ok(shared, 'pstack-claude README no longer lists the harnesses that read ~/.agents/skills/; update this parser');
  for (const item of shared[1].replace(/\([^)]*\)/g, '').split(/,\s*(?:and\s+)?|\s+and\s+/)) {
    const name = item.trim();
    if (name && !harnesses.some((known) => name.includes(known))) harnesses.push(name);
  }
  return harnesses;
}

/** The first-column cells of the first `| Harness |` table under each `### <n>.` install step. */
function stepTables(readme) {
  const tables = new Map();
  for (const section of readme.split(/^### /m).slice(1)) {
    const step = section.match(/^(\d+)\./)?.[1];
    if (!step) continue;
    const lines = section.split('\n');
    const header = lines.findIndex((line) => /^\|\s*Harness\s*\|/.test(line));
    if (header === -1) continue;
    const rows = [];
    for (const line of lines.slice(header + 2)) {
      if (!line.startsWith('|')) break;
      rows.push(line.split('|')[1].trim());
    }
    tables.set(Number(step), rows);
  }
  return tables;
}

const pstackReadme = pstackReadmePath();

test('every install step has one harness table naming each harness pstack-claude supports, in its order', {
  skip: pstackReadme ? false : 'no pstack-claude README: set PSTACK_CLAUDE_README or install pstack-claude so $HOME/.*/plugins/marketplaces/pstack-claude/README.md exists',
}, () => {
  const harnesses = pstackHarnesses(readFileSync(pstackReadme, 'utf8'));
  const tables = stepTables(readFileSync(README, 'utf8'));
  const problems = [];
  for (let step = 1; step <= INSTALL_STEPS; step++) {
    const rows = tables.get(step);
    if (!rows) {
      problems.push(`step ${step} has no "| Harness |" table, so it is missing: ${harnesses.join(', ')}`);
      continue;
    }
    const missing = harnesses.filter((name) => !rows.includes(name));
    if (missing.length) problems.push(`step ${step} table is missing: ${missing.join(', ')}`);
    else if (rows.join('\n') !== harnesses.join('\n')) problems.push(`step ${step} rows are [${rows.join(', ')}], expected pstack-claude's order [${harnesses.join(', ')}]`);
  }
  assert.deepEqual(problems, [], `README.md install tables drift from ${pstackReadme}:\n${problems.join('\n')}`);
});
