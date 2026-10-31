import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { CLI, PSTACK, tempDir, world } from './helpers.mjs';

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

/** Config that records `web`, so a write made from outside its checkout still has to hold there. */
const recorded = (w) => writeFileSync(join(w.config, 'config.json'), JSON.stringify({ handle: 'tester', pstack: '1.0.0', orgs: { acme: { owners: ['acme-eng'] } }, repos: { web: { checkout: w.repo } } }));

test('a user write that breaks a repo it reaches is refused, from outside that repo too', () => {
  const w = world({ files: { '02-orgs/acme/02-overrides/mode.md': '---\nextends: babysit\nwhen: Acme\n---\n\n- **In** "Declare the mode" Be brief.\n' } });
  recorded(w);
  const r = w.run(['playbook', 'extend', 'babysit', 'tmpf', 'replace', 'Declare the mode', '--with', 'the rules', '--when', 'w'], { cwd: w.outside });
  assert.equal(r.status, 1, r.stdout);
  assert.match(r.stderr, /nothing was written/);
  assert.match(r.stderr, /in web: .*02-overrides\/mode\.md:\d+: quote not found: "Declare the mode"/);
  assert.equal(existsSync(join(w.config, '01-user', 'tmpf.md')), false);
  assert.equal(w.run(['check', '--repo', 'web']).status, 0);
});

test('a user write that breaks only the context with no repo is refused from inside a repo', () => {
  const w = world();
  recorded(w);
  assert.equal(w.run(['playbook', 'show', 'babysit']).stdout.match(/^\d+\. /gm).length, 6);
  const r = w.run(['playbook', 'extend', 'babysit', 'mine', 'in', 'Declare the mode', '--with', 'see babysit step 6', '--when', 'w']);
  assert.equal(r.status, 1, r.stdout);
  assert.match(r.stderr, /in no repo: .*mine\.md:\d+: babysit step 6, but babysit has \d steps/);
  assert.equal(existsSync(join(w.config, '01-user', 'mine.md')), false);
});

test('a repo write that names a step only that repo has passes, because no other context reads the file', () => {
  const w = world();
  recorded(w);
  const r = w.run(['playbook', 'extend', 'babysit', 'r', 'in', 'Declare the mode', '--with', 'see babysit step 6', '--when', 'w', '--layer', 'repo']);
  assert.equal(r.status, 0, r.stderr);
});

const LATIN1 = Buffer.concat([Buffer.from('---\nextends: babysit\nwhen: Babysitting\n---\n\n- **In** "Declare the mode" Caf'), Buffer.from([0xe9]), Buffer.from('.\n')]);

test('a refused extend restores a file that is not UTF-8 byte for byte, and a passing one keeps its bytes', () => {
  const w = world();
  const path = join(w.config, '01-user', 'combo.md');
  writeFileSync(path, LATIN1);
  assert.equal(w.run(['playbook', 'extend', 'babysit', 'combo', 'in', 'Declare the mode', '--with', 'see babysit step 99']).status, 1);
  assert.deepEqual(readFileSync(path), LATIN1);
  assert.equal(w.run(['playbook', 'extend', 'feature', 'combo', 'in', 'Name the data shape', '--with', 'Thé.']).status, 0);
  const kept = readFileSync(path);
  assert.ok(kept.includes(Buffer.from([0xe9, 0x2e, 0x0a])), 'the 0xE9 byte survives');
  assert.ok(kept.includes(Buffer.from('extends: babysit, feature\n')));
  assert.ok(kept.includes(Buffer.from('Thé.\n')));
});

test('a check that throws after the write still restores the file', () => {
  const pstack = join(tempDir(), '1.0.0');
  cpSync(PSTACK, pstack, { recursive: true });
  const w = world({ files: { '01-user/other.md': '---\nextends: babysit\nwhen: Other\n---\n\n- **In** "Declare the mode" Fine.\n' } });
  const path = join(w.config, '01-user', 'combo.md');
  writeFileSync(path, LATIN1);
  // The stub runs inside the check, so the file it locks makes the next read throw only after the write landed.
  writeFileSync(join(pstack, 'skills', 'poteto-mode', 'scripts', 'check-playbooks.mjs'), `import { chmodSync, readFileSync } from 'node:fs';\nif (readFileSync(${JSON.stringify(path)}).includes('boom')) chmodSync(${JSON.stringify(join(w.config, '01-user', 'other.md'))}, 0);\n`);
  const r = w.run(['playbook', 'extend', 'babysit', 'combo', 'in', 'Declare the mode', '--with', 'boom'], { env: { JSTACK_PSTACK_DIR: pstack } });
  assert.notEqual(r.status, 0);
  assert.match(r.stderr, /EACCES/);
  assert.deepEqual(readFileSync(path), LATIN1);
});

const STALE = { '01-user/stale.md': '---\nextends: babysit\nwhen: Stale\n---\n\n- **In** "No longer in pstack" Be brief.\n' };

test('a file with a stale quote does not stop an unrelated write, which says the old problem remains', () => {
  const w = world({ files: STALE });
  assert.equal(w.run(['check']).status, 1);
  const r = w.run(['playbook', 'extend', 'feature', 'mine', 'in', 'Name the data shape', '--with', 'x', '--when', 'w']);
  assert.equal(r.status, 0, r.stderr);
  assert.ok(existsSync(join(w.config, '01-user', 'mine.md')));
  assert.match(r.stdout, /this edit added no problems, but check still reports:\n.*stale\.md:6: quote not found: "No longer in pstack"/);
});

test('a write that adds a problem next to an old one is refused and names only the new one', () => {
  const w = world({ files: STALE });
  const r = w.run(['playbook', 'extend', 'babysit', 'mine', 'in', 'Declare the mode', '--with', 'see babysit step 99', '--when', 'w']);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /refused: this edit adds check problems, so nothing was written/);
  assert.match(r.stderr, /babysit step 99/);
  assert.doesNotMatch(r.stderr, /stale\.md/);
  assert.equal(existsSync(join(w.config, '01-user', 'mine.md')), false);
});

test('check --every-repo finds a problem the current context cannot see, and records nothing', () => {
  const w = world();
  recorded(w);
  writeFileSync(join(w.config, '01-user', 'mine.md'), '---\nextends: babysit\nwhen: w\n---\n\n- **In** "Declare the mode" see babysit step 6\n');
  assert.equal(w.run(['check']).status, 0);
  const before = read(join(w.config, 'config.json'));
  const r = w.run(['check', '--every-repo', '--json']);
  assert.equal(r.status, 1);
  assert.match(JSON.parse(r.stdout).problems[0].message, /babysit step 6, but babysit has \d steps/);
  assert.equal(read(join(w.config, 'config.json')), before);
  assert.equal(w.run(['check', '--every-repo', '--repo', 'web']).status, 2);
});

test('a stale step reference that only changes its count does not refuse an unrelated write', () => {
  const w = world({ files: { '01-user/notes.md': '---\nextends: babysit\nwhen: Notes\n---\n\n- See babysit step 99.\n' } });
  const r = w.run(['playbook', 'extend', 'babysit', 'zz', 'after', 'Declare the mode', '--with', 'Also this.', '--when', 'w']);
  assert.equal(r.status, 0, r.stderr);
  assert.ok(existsSync(join(w.config, '01-user', 'zz.md')));
});

test('a spaced dash after a step number is prose, not a range', () => {
  const w = world({ files: { '01-user/notes.md': '---\nextends: babysit\nwhen: Notes\n---\n\n- See babysit step 1 - 20 minutes of waiting.\n' } });
  assert.equal(w.run(['check']).status, 0);
  const tight = world({ files: { '01-user/notes.md': '---\nextends: babysit\nwhen: Notes\n---\n\n- See babysit steps 1-99.\n' } });
  assert.equal(tight.run(['check']).status, 1);
});
