import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readFileSync, renameSync, symlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { BIN, FIXTURES, PSTACK, git, lines, tempDir, world } from './helpers.mjs';

const OK_LINE = "Every project playbook matches this pstack's playbooks.";
const readLayers = (config) => JSON.parse(readFileSync(join(config, 'config.json'), 'utf8'));
const setPstack = (config, version) => {
  const path = join(config, 'config.json');
  writeFileSync(path, readFileSync(path, 'utf8').replace('"pstack": "1.0.0"', `"pstack": "${version}"`));
};

const BABYSIT = `# babysit (web · acme-eng · pstack 1.0.0)

1. Check the team's merge calendar. Skip it on hotfix branches.   [babysitting-an-acme-pr ~ babysitting-an-acme-pr-web]
2. **Declare the mode before any poll.** Pick drive or background for the PR.   [babysit]
3. **Work the merge frontier.** The lowest open PR matters first.   [babysit]
4. Read ~~the default branch's ruleset~~ the trunk ruleset before the first push.   [babysit-tester ~ babysitting-an-acme-pr-tester]
5. **Order is conflicts, then threads, then CI.** Batch fixes into one push.   [babysit ~ babysitting-an-acme-pr]

   On a conflict, report it and stop. Snapshot diffs count as CI.
6. **Stop at the human's line.** ~~Babysitting never authorizes merging~~ Merge once approved and green.   [babysit ~ babysit-tester]

Family: babysit (pstack), babysitting-an-acme-pr (team), babysit-tester (user), babysitting-an-acme-pr-tester (user), babysitting-an-acme-pr-web (user)

Notes:
- Ping the author when the frontier is merge-ready.   [babysit-tester]

Overrides:
- step 1: babysitting-an-acme-pr-web added to "Check the team's merge calendar" (babysitting-an-acme-pr)
- step 4: babysitting-an-acme-pr-tester replaced "the default branch's ruleset" (babysit-tester)
- step 5: babysitting-an-acme-pr added to "Order is conflicts, then threads, then CI" (babysit)
- step 6: babysit-tester replaced "Babysitting never authorizes merging" (babysit)

pstack check-playbooks:
ok
`;

test('show applies a family in topological order and tags each step with the stems that wrote and edited it', () => {
  const w = world();
  const r = w.run(['playbook', 'compute', 'babysit']);
  assert.equal(r.stderr, '');
  assert.equal(r.stdout, BABYSIT);
  assert.equal(r.status, 0);
});

test('show --json carries the same family as data', () => {
  const w = world();
  const r = w.run(['playbook', 'compute', 'babysit', '--json']);
  assert.equal(r.status, 0);
  assert.deepEqual(JSON.parse(r.stdout), {
    playbook: 'babysit',
    asked: 'babysit',
    repo: 'web',
    owner: 'acme-eng',
    org: 'acme',
    pstack: '1.0.0',
    family: [
      { stem: 'babysit', kind: 'pstack' },
      { stem: 'babysitting-an-acme-pr', kind: 'team' },
      { stem: 'babysit-tester', kind: 'user' },
      { stem: 'babysitting-an-acme-pr-tester', kind: 'user' },
      { stem: 'babysitting-an-acme-pr-web', kind: 'user' },
    ],
    steps: [
      { text: "Check the team's merge calendar. Skip it on hotfix branches.", origin: 'babysitting-an-acme-pr', kind: 'team', touched: ['babysitting-an-acme-pr-web'] },
      { text: '**Declare the mode before any poll.** Pick drive or background for the PR.', origin: 'babysit', kind: 'pstack', touched: [] },
      { text: '**Work the merge frontier.** The lowest open PR matters first.', origin: 'babysit', kind: 'pstack', touched: [] },
      { text: 'Read the trunk ruleset before the first push.', origin: 'babysit-tester', kind: 'user', touched: ['babysitting-an-acme-pr-tester'] },
      {
        text: '**Order is conflicts, then threads, then CI.** Batch fixes into one push.\n\n   On a conflict, report it and stop. Snapshot diffs count as CI.',
        origin: 'babysit',
        kind: 'pstack',
        touched: ['babysitting-an-acme-pr'],
      },
      { text: "**Stop at the human's line.** Merge once approved and green.", origin: 'babysit', kind: 'pstack', touched: ['babysit-tester'] },
    ],
    notes: [{ text: 'Ping the author when the frontier is merge-ready.', file: 'babysit-tester' }],
    overrides: [
      { step: 1, file: 'babysitting-an-acme-pr-web', verb: 'In', quote: "Check the team's merge calendar", origin: 'babysitting-an-acme-pr' },
      { step: 4, file: 'babysitting-an-acme-pr-tester', verb: 'Replace', quote: "the default branch's ruleset", origin: 'babysit-tester' },
      { step: 5, file: 'babysitting-an-acme-pr', verb: 'In', quote: 'Order is conflicts, then threads, then CI', origin: 'babysit' },
      { step: 6, file: 'babysit-tester', verb: 'Replace', quote: 'Babysitting never authorizes merging', origin: 'babysit' },
    ],
    handoffs: [],
    problems: [],
    pstackCheck: { status: 'ok', lines: [OK_LINE] },
  });
});

test('show by any member of a family prints the root family and says which member was asked for', () => {
  const w = world();
  for (const name of ['babysit-tester', 'babysitting-an-acme-pr', 'babysitting-an-acme-pr-web']) {
    const r = w.run(['playbook', 'show', name]);
    assert.equal(r.status, 0, name);
    assert.equal(r.stdout, BABYSIT.replace('\n\n1. ', `\n\n${name} is part of the babysit family.\n\n1. `), name);
    assert.equal(JSON.parse(w.run(['playbook', 'show', name, '--json']).stdout).asked, name);
  }
});

test('a playbook with no numbered steps takes each bold-lead paragraph as a step', () => {
  const r = world().run(['playbook', 'compute', 'opening-a-pr']);
  assert.equal(r.stdout, `# opening-a-pr (web · acme-eng · pstack 1.0.0)

1. **Commits.** Commit in small units.   [opening-a-pr]
2. Sign every commit.   [opening-a-pr-tester]
3. **Titles.** Use a typed subject line.   [opening-a-pr ~ opening-a-pr-tester]
Keep it short. Name the scope.
4. **Readiness.** Open every PR ready.   [opening-a-pr]

Family: opening-a-pr (pstack), opening-a-pr-tester (user)

Overrides:
- step 3: opening-a-pr-tester added to "Keep it short." (opening-a-pr)

pstack check-playbooks:
ok
`);
  assert.equal(r.status, 0);
});

test('a chain of user files edits a standalone playbook, each anchored on what its ancestors leave', () => {
  const r = world().run(['playbook', 'compute', 'triage']);
  assert.equal(r.stdout, `# triage (web · acme-eng · pstack 1.0.0)

1. Reproduce the bug.   [triage]
2. ~~Capture the logs~~ Capture the server logs.   [triage-acme ~ triage-web]
3. Write the failing test.   [triage]

Family: triage (user), triage-acme (user), triage-web (user)

Overrides:
- step 2: triage-web replaced "Capture the logs" (triage-acme)

pstack check-playbooks:
ok
`);
  assert.equal(r.status, 0);
});

test('scope folders decide where a user file is active, never its order', () => {
  const w = world();
  const outside = w.run(['playbook', 'show', 'triage', '--json'], { cwd: w.outside });
  assert.deepEqual(JSON.parse(outside.stdout).family.map((m) => m.stem), ['triage']);
  const other = world({ remote: 'git@example.com:acme-eng/api.git' });
  assert.deepEqual(JSON.parse(other.run(['playbook', 'show', 'triage', '--json']).stdout).family.map((m) => m.stem), ['triage', 'triage-acme']);
});

test('a standalone team playbook starts from its own numbered steps, and a user file extends it', () => {
  const r = world().run(['playbook', 'compute', 'releasing-web']);
  assert.equal(r.stdout, `# releasing-web (web · acme-eng · pstack 1.0.0)

1. Tag the release.   [releasing-web]
2. Post the tag in the team channel.   [releasing-web-tester]
3. Watch the deploy.   [releasing-web]

Family: releasing-web (team), releasing-web-tester (user)

pstack check-playbooks:
ok
`);
  assert.equal(r.status, 0);
});

test('a user file whose parent is active only in another repo is dormant here: info, not a problem', () => {
  const w = world();
  const r = w.run(['check'], { cwd: w.outside });
  assert.deepEqual(lines(r.stdout), [
    `info: ${w.config}/playbooks/babysitting-an-acme-pr-tester.md:2: extends babysitting-an-acme-pr, which only web defines, so this file is dormant here`,
    `info: ${w.config}/playbooks/releasing-web-tester.md:2: extends releasing-web, which only web defines, so this file is dormant here`,
    'check passed: pstack 1.0.0',
  ]);
  assert.equal(r.status, 0);
  assert.match(w.run(['playbook', 'show', 'releasing-web-tester'], { cwd: w.outside }).stderr, /releasing-web-tester is dormant here/);
});

test('apply order breaks ties team before user, then by stem, so sibling In text lands in that order', () => {
  const w = world({
    files: {
      'playbooks/aa-mine.md': '---\nextends: babysit\nwhen: w\n---\n\n- **In** "Work the merge frontier" AA.\n',
      'playbooks/zz-mine.md': '---\nextends: babysit\nwhen: w\n---\n\n- **In** "Work the merge frontier" ZZ.\n',
    },
    team: { 'zz-acme.md': '---\nextends: babysit\nwhen: w\nsource: proposed\n---\n\n- **In** "Work the merge frontier" TEAM.\n' },
  });
  const out = JSON.parse(w.run(['playbook', 'show', 'babysit', '--json']).stdout);
  assert.equal(out.steps[2].text, '**Work the merge frontier.** The lowest open PR matters first. TEAM. AA. ZZ.');
  assert.deepEqual(out.family.map((m) => m.stem), ['babysit', 'babysitting-an-acme-pr', 'zz-acme', 'aa-mine', 'babysit-tester', 'babysitting-an-acme-pr-tester', 'babysitting-an-acme-pr-web', 'zz-mine']);
  assert.deepEqual(out.overrides.filter((o) => o.step === 3).map((o) => [o.file, o.after]), [['zz-acme', undefined], ['aa-mine', ['zz-acme']], ['zz-mine', ['zz-acme', 'aa-mine']]]);
  assert.match(w.run(['playbook', 'show', 'babysit']).stdout, /^- step 3: zz-mine added to "Work the merge frontier" \(babysit, after zz-acme, aa-mine\)$/m);
});

test('a quote sees only what its ancestors wrote, and check names the file that wrote it', () => {
  const w = world({ files: { 'playbooks/sibling.md': '---\nextends: babysit\nwhen: w\n---\n\n- **In** "Merge once approved" Then tag it.\n' } });
  const r = w.run(['check']);
  assert.ok(lines(r.stdout).includes(`${w.config}/playbooks/sibling.md:6: quote not found in what its parents leave: "Merge once approved"; babysit-tester wrote it, so add babysit-tester to extends`), r.stdout);
  assert.equal(r.status, 1);
  writeFileSync(join(w.config, 'playbooks/sibling.md'), '---\nextends: babysit-tester\nwhen: w\n---\n\n- **In** "Merge once approved" Then tag it.\n');
  assert.equal(w.run(['check']).status, 0);
  assert.match(w.run(['playbook', 'show', 'babysit']).stdout, /Merge once approved and green\. Then tag it\. {3}\[babysit ~ babysit-tester ~ sibling\]/);
});

test('two siblings that Replace the same words fail check, naming both files', () => {
  const team = readFileSync(join(FIXTURES, 'team/acme/babysitting-an-acme-pr.md'), 'utf8');
  const w = world({ team: { 'babysitting-an-acme-pr.md': `${team}- **Replace** "Babysitting never authorizes merging" Hand it to the release captain\n` } });
  const r = w.run(['check']);
  assert.ok(lines(r.stdout).includes(`${w.config}/playbooks/babysit-tester.md:6: replaces words that babysitting-an-acme-pr also replaces in babysit step 6; make one file extend the other`), r.stdout);
  assert.equal(r.status, 1);
});

test('a cycle among user files fails check and names the cycle, self-extension included', () => {
  const w = world({
    files: {
      'playbooks/loop-a.md': '---\nextends: loop-b\nwhen: w\n---\n\n- A note.\n',
      'playbooks/loop-b.md': '---\nextends: babysit, loop-a\nwhen: w\n---\n\n- A note.\n',
      'playbooks/self.md': '---\nextends: self\nwhen: w\n---\n\n- A note.\n',
    },
  });
  const out = lines(w.run(['check']).stdout);
  assert.ok(out.includes(`${w.config}/playbooks/loop-a.md:2: extends a cycle: loop-a -> loop-b -> loop-a`), out.join('\n'));
  assert.ok(out.includes(`${w.config}/playbooks/loop-b.md:2: extends a cycle: loop-b -> loop-a -> loop-b`), out.join('\n'));
  assert.ok(out.includes(`${w.config}/playbooks/self.md:2: extends a cycle: self -> self`), out.join('\n'));
  assert.equal(w.run(['playbook', 'show', 'babysit']).status, 1);
});

test('a missing parent fails check; a stem that takes a bundled or an active name fails with a rename hint', () => {
  const w = world({
    files: {
      'playbooks/typo.md': '---\nextends: babysitt\nwhen: w\n---\n\n- A note.\n',
      'playbooks/feature.md': '---\nextends: feature\nwhen: w\n---\n\n- **In** "Name the data shape." x\n',
      'playbooks/repos/web/babysit-tester.md': '---\nextends: babysit\nwhen: w\n---\n\n- A note.\n',
    },
  });
  const out = lines(w.run(['check']).stdout);
  assert.ok(out.includes(`${w.config}/playbooks/typo.md:2: extends babysitt, which no playbook defines`), out.join('\n'));
  assert.ok(out.includes(`${w.config}/playbooks/feature.md:1: feature is a bundled playbook's name; rename the file, such as feature-tester.md`), out.join('\n'));
  assert.ok(out.includes(`${w.config}/playbooks/repos/web/babysit-tester.md:1: babysit-tester is also ${w.config}/playbooks/babysit-tester.md; rename one, such as babysit-tester-web.md`), out.join('\n'));
});

test('a team file that extends a stem pstack does not bundle fails, as pstack-claude requires', () => {
  const w = world({ team: { 'triage-acme-team.md': '---\nextends: triage\nwhen: w\nsource: x\n---\n\n- **In** "Reproduce the bug." x\n' } });
  const out = lines(w.run(['check']).stdout);
  assert.ok(out.includes('.agents/playbooks/triage-acme-team.md:2: team files extend only bundled playbooks, and pstack 1.0.0 bundles no triage'), out.join('\n'));
});

test('a team file without its scope word gets an info line', () => {
  const w = world({ team: { 'tidying.md': '---\nextends: babysit\nwhen: w\nsource: x\n---\n\n- A note.\n' } });
  const r = w.run(['check']);
  assert.ok(lines(r.stdout).includes('info: .agents/playbooks/tidying.md:1: a team file name carries its scope word (acme or web), such as tidying-acme.md'), r.stdout);
  assert.equal(r.status, 0);
});

test('a layer key and the numbered config layout are retired, and check says what to do', () => {
  const w = world({
    files: {
      'playbooks/old.md': '---\nextends: babysit\nwhen: w\nlayer: user\n---\n\n- A note.\n',
      '01-user/babysit.md': '---\nextends: babysit\nwhen: w\n---\n\n- A note.\n',
    },
    team: { 'old-acme.md': '---\nextends: babysit\nwhen: w\nlayer: org.standard\n---\n\n- A note.\n' },
  });
  const out = lines(w.run(['check']).stdout);
  assert.ok(out.includes(`${w.config}/playbooks/old.md:4: layer: is retired, because extends sets the order; delete it`), out.join('\n'));
  assert.ok(out.includes('.agents/playbooks/old-acme.md:4: layer: is retired, because extends sets the order; delete it'), out.join('\n'));
  assert.ok(out.includes(`${w.config}/01-user:1: numbered layer folders are retired; move each file into playbooks/ (playbooks/orgs/<org>/ or playbooks/repos/<repo>/ to limit where it applies) under a unique name, as playbooks.md describes`), out.join('\n'));
});

test('with no config the playbook is pstack alone', () => {
  const w = world({ checkout: false });
  const r = w.run(['playbook', 'compute', 'feature'], { env: { JSTACK_CONFIG: join(w.root, 'missing') } });
  assert.equal(r.stdout, `# feature (pstack 1.0.0)

1. Name the data shape.   [feature]
2. Delegate the code.   [feature]
3. Verify on the real surface.   [feature]
4. Run **Opening a PR**, per **Nowhere**.   [feature]

Hands off to:
- opening-a-pr (step 4)

pstack check-playbooks:
not run: no .agents/playbooks
`);
  assert.equal(r.status, 0);
});

const HANDOFFS = {
  files: {
    'playbooks/handoffs.md': `---
when: handing work between playbooks
---

1. Run **Opening a PR** once the diff is clean.
2. Write it per **Comments**, then hand it to Shiping.
3. Route that request to **Babysat**, or per \`playbooks/triage.md\`.
4. Then run releasing-we and opening-a-pr.
5. Hand the frontier to Babysit once green.
6. Run read-only checks per PR.
`,
    'playbooks/repos/web/handoffs-web.md': `---
extends: handoffs
when: handing work between web playbooks
---

- Then run releasing-web, or hand it to **Babysit**.
`,
  },
};

test('show withholds a playbook whose file hands off to a playbook nothing defines', () => {
  const w = world(HANDOFFS);
  const r = w.run(['playbook', 'compute', 'handoffs']);
  assert.equal(r.stdout, `# handoffs (web · acme-eng · pstack 1.0.0)

No steps: a file in the handoffs family has problems, so some of its edits would be lost. Fix the files below, then run \`playbook check\` until it passes.

Problems:
${w.config}/playbooks/handoffs.md:6: hands off to Shiping, which no playbook defines
${w.config}/playbooks/handoffs.md:7: hands off to Babysat, which no playbook defines
${w.config}/playbooks/handoffs.md:8: hands off to releasing-we, which no playbook defines

pstack check-playbooks:
ok
`);
  assert.equal(r.status, 1);
});

test('check flags a handoff nothing defines, and leaves section names and pstack text alone', () => {
  const w = world(HANDOFFS);
  const r = w.run(['check']);
  assert.deepEqual(lines(r.stdout), [
    OK_LINE,
    `${w.config}/playbooks/handoffs.md:6: hands off to Shiping, which no playbook defines`,
    `${w.config}/playbooks/handoffs.md:7: hands off to Babysat, which no playbook defines`,
    `${w.config}/playbooks/handoffs.md:8: hands off to releasing-we, which no playbook defines`,
    'check failed: 3 problems against pstack 1.0.0',
  ]);
  assert.equal(r.status, 1);
});

const LINKS = {
  files: {
    'playbooks/watching-review-asks.md': `---
when: watching for review asks
---

1. **Read the asks.** List them.
2. **Answer each.** Reply in the thread.
3. **Report.** Say what changed.
`,
    'playbooks/reviewing-code.md': `---
when: reviewing code
---

1. **Read the diff.** All of it.
`,
    'playbooks/links.md': `---
when: linking playbooks
---

1. Run babysit once the PR is open.
2. The frontier runs reviewing-code on each PR.
3. Run Babysit, which covers watching-review-asks steps 2 and 3.
4. Then babysit step 6 stops at the human's line.
5. After watching-review-asks step 4, ping the author.
6. Also see babysit steps 2, 9.
7. Run \`babysit\`.
8. Run read-only checks per PR, and a step 2 retry.
`,
  },
};

test('check reports a near-miss link as info, fails a step the playbook lacks, and leaves correct prose alone', () => {
  const w = world(LINKS);
  const r = w.run(['check']);
  const links = `${w.config}/playbooks/links.md`;
  const nearMiss = (line, phrase, stem) => `info: ${links}:${line}: "${phrase}" may name ${stem} but does not register as a handoff; if it is one, write playbooks/${stem}.md`;
  assert.deepEqual(lines(r.stdout), [
    OK_LINE,
    `${links}:9: watching-review-asks step 4, but watching-review-asks has 3 steps`,
    `${links}:10: babysit step 9, but babysit has 6 steps`,
    nearMiss(5, 'Run babysit', 'babysit'),
    nearMiss(6, 'runs reviewing-code', 'reviewing-code'),
    nearMiss(11, 'Run babysit', 'babysit'),
    'check failed: 2 problems against pstack 1.0.0',
  ]);
  assert.equal(r.status, 1);
});

test('prose that happens to follow a run-like word with a playbook name never fails check or withholds', () => {
  const w = world({
    files: {
      'playbooks/prose.md': `---
when: writing prose
---

1. Open one PR per feature.
2. Run feature flags first.
3. Ran babysit checks.
4. After running feature builds, stop.
5. Per feature flag.
`,
    },
  });
  assert.equal(w.run(['check']).status, 0);
  const show = w.run(['playbook', 'show', 'prose']);
  assert.equal(show.status, 0);
  assert.match(show.stdout, /^1\. Open one PR per feature\./m);
});

test('a step reference needs a whole playbook name, and reads a path and a range', () => {
  const body = (line) => ({ files: { 'playbooks/refs.md': `---\nwhen: refs\n---\n\n1. ${line}\n` } });
  assert.equal(world(body('Do the pre-babysit step 99.')).run(['check']).status, 0);
  assert.equal(world(body('See babysit steps 2-5.')).run(['check']).status, 0);
  for (const line of ['See playbooks/babysit.md step 99.', 'See babysit steps 2-99.', 'See `babysit` steps 2 to 99.']) {
    const r = world(body(line)).run(['check']);
    assert.equal(r.status, 1, line);
    assert.match(r.stdout, /babysit step 99, but babysit has 6 steps/, line);
  }
});

test('a handoff to a playbook only another scope defines is info, not a problem', () => {
  const w = world({
    files: {
      'playbooks/orgs/other/syncing-a-ticket.md': `---
when: moving a ticket on
---

1. Move the ticket to done.
`,
      'playbooks/landing.md': `---
when: landing a PR
---

1. Once the last PR lands, run syncing-a-ticket.
`,
    },
  });
  const r = w.run(['check']);
  assert.deepEqual(lines(r.stdout), [
    OK_LINE,
    `info: ${w.config}/playbooks/landing.md:5: hands off to syncing-a-ticket, which only playbooks/orgs/other defines`,
    'check passed: pstack 1.0.0',
  ]);
  assert.equal(r.status, 0);
  const json = JSON.parse(w.run(['check', '--json']).stdout);
  assert.deepEqual(json.problems, []);
  assert.deepEqual(json.info, [{ path: `${w.config}/playbooks/landing.md`, line: 5, message: 'hands off to syncing-a-ticket, which only playbooks/orgs/other defines' }]);
});

test('a handoff to a derived name resolves to its root family, and one to a dormant file is info', () => {
  const w = world({ files: { 'playbooks/landing.md': '---\nwhen: landing\n---\n\n1. Then hand it to babysit-tester.\n2. Once it ships, run releasing-web-tester.\n' } });
  const r = w.run(['playbook', 'show', 'landing', '--json']);
  assert.equal(r.status, 0, r.stdout);
  assert.deepEqual(JSON.parse(r.stdout).handoffs, [
    { playbook: 'babysit', steps: [1], inNotes: false },
    { playbook: 'releasing-web', steps: [2], inNotes: false },
  ]);
  const outside = w.run(['check'], { cwd: w.outside });
  assert.ok(lines(outside.stdout).includes(`info: ${w.config}/playbooks/landing.md:6: hands off to releasing-web-tester, which is dormant here`), outside.stdout);
  assert.equal(outside.status, 0);
});

test('a handoff inside an edit is checked, but the pstack words it quotes are not', () => {
  const w = world({
    files: {
      'playbooks/feature-tester.md': `---
extends: feature
when: building a feature
---

- **In** "Run **Opening a PR**, per **Nowhere**." Then hand it to **Shiping**.
`,
    },
  });
  const r = w.run(['check']);
  assert.ok(lines(r.stdout).includes(`${w.config}/playbooks/feature-tester.md:6: hands off to Shiping, which no playbook defines`), r.stdout);
  assert.ok(!r.stdout.includes('Nowhere'), r.stdout);
});

test('list shows each root with its kind and its active family', () => {
  const r = world().run(['playbook', 'list']);
  assert.equal(r.stdout, `web (acme-eng · pstack 1.0.0)
playbook       kind    family
babysit        pstack  babysitting-an-acme-pr, babysit-tester, babysitting-an-acme-pr-tester, babysitting-an-acme-pr-web
feature        pstack
opening-a-pr   pstack  opening-a-pr-tester
releasing-web  team    releasing-web-tester
triage         user    triage-acme, triage-web
`);
  assert.equal(r.status, 0);
});

test('list --json names each root, its kind and its family in apply order', () => {
  const out = JSON.parse(world().run(['playbook', 'list', '--json']).stdout);
  assert.deepEqual(out.playbooks.find((p) => p.name === 'releasing-web'), { name: 'releasing-web', kind: 'team', family: ['releasing-web-tester'] });
  assert.deepEqual(out.playbooks.find((p) => p.name === 'triage'), { name: 'triage', kind: 'user', family: ['triage-acme', 'triage-web'] });
  assert.equal(out.layers, undefined);
});

test('check passes a clean config and passes pstack lines through', () => {
  const r = world().run(['check']);
  assert.equal(r.stdout, `${OK_LINE}
check passed: pstack 1.0.0
`);
  assert.equal(r.status, 0);
});

const BROKEN = {
  files: {
    'playbooks/broken.md': `---
extends: babysit, nope
---

- **In** "PR" more words.
- **Replace** "stays out of every step" x
- **After** "no such words" y
`,
    'playbooks/solo.md': `---
when: a solo flow
---

1. Do the thing.
- **After** "Do the thing" again
`,
  },
  team: {
    'bad-team-acme.md': `---
extends: babysit
when: a bad team rule
layer: repo.standard
---

- **In** "the trunk ruleset" z
`,
    'triaging-in-web.md': `---
extends: triage
when: triaging in web
source: ruleset
---

- **In** "Reproduce the bug." x
`,
  },
  links: { 'playbooks/gone.md': '../nowhere.md' },
};

test('check reports every validator rule with path and line', () => {
  const w = world(BROKEN);
  const r = w.run(['check']);
  const c = w.config;
  assert.deepEqual(lines(r.stdout).sort(), [
    OK_LINE,
    `${c}/playbooks/broken.md:1: missing when:`,
    `${c}/playbooks/broken.md:2: extends nope, which no playbook defines`,
    `${c}/playbooks/broken.md:5: quote matches steps 2 and 3; make it longer`,
    `${c}/playbooks/broken.md:6: quote is outside a numbered step`,
    `${c}/playbooks/broken.md:7: quote not found: "no such words"`,
    `${c}/playbooks/gone.md:1: broken link -> ../nowhere.md`,
    `${c}/playbooks/solo.md:6: standalone playbook cannot carry edits`,
    '.agents/playbooks/bad-team-acme.md:4: layer: is retired, because extends sets the order; delete it',
    '.agents/playbooks/bad-team-acme.md:7: quote not found: "the trunk ruleset"',
    '.agents/playbooks/triaging-in-web.md:2: team files extend only bundled playbooks, and pstack 1.0.0 bundles no triage',
    'check failed: 10 problems against pstack 1.0.0',
  ].sort());
  assert.equal(r.status, 1);
});

test('a user file may extend a user standalone, whatever the order of their names', () => {
  const w = world({
    files: {
      'playbooks/aaa-flow.md': `---\nextends: zzz-flow\nwhen: a flow\n---\n\n- **After** "Do the thing" Then rest.\n`,
      'playbooks/zzz-flow.md': `---\nwhen: another flow\n---\n\n1. Do the thing.\n`,
    },
  });
  assert.equal(w.run(['check']).status, 0);
  assert.match(w.run(['playbook', 'show', 'zzz-flow']).stdout, /^2\. Then rest\. {3}\[aaa-flow\]$/m);
});

test('a pstack checker failure with no jstack problems says so in the last line', () => {
  const w = world();
  const pstack = join(w.root, '1.0.0');
  cpSync(PSTACK, pstack, { recursive: true });
  cpSync(join(FIXTURES, 'pstack/1.1.0/skills/poteto-mode/scripts'), join(pstack, 'skills/poteto-mode/scripts'), { recursive: true });
  const r = w.run(['check'], { env: { JSTACK_PSTACK_DIR: pstack } });
  assert.equal(lines(r.stdout).at(-1), "check failed: pstack's checker failed against pstack 1.0.0");
  assert.equal(r.status, 1);
});

test('check flags a layers key, since extends sets the order', () => {
  const w = world();
  const layers = readLayers(w.config);
  writeFileSync(join(w.config, 'config.json'), JSON.stringify({ ...layers, layers: ['repo.overrides', 'user'] }));
  const r = w.run(['check']);
  assert.ok(lines(r.stdout).includes(`${w.config}/config.json:1: "layers" is retired: extends sets the order, so delete the key`), r.stdout);
  assert.equal(r.status, 1);
});

test('compute withholds the steps when a file touching the playbook has problems, and exits 1', () => {
  const w = world(BROKEN);
  const r = w.run(['playbook', 'compute', 'babysit']);
  assert.match(r.stdout, /^# babysit \(web · acme-eng · pstack 1\.0\.0\)$/m);
  assert.match(r.stdout, /^No steps: .*`playbook check`/m);
  assert.doesNotMatch(r.stdout, /^1\. /m);
  assert.match(r.stdout, /^Problems:$/m);
  assert.ok(r.stdout.includes(`${w.config}/playbooks/broken.md:5: quote matches steps 2 and 3; make it longer`), r.stdout);
  assert.ok(r.stdout.includes(`${w.config}/playbooks/gone.md:1: broken link -> ../nowhere.md`), r.stdout);
  assert.ok(!r.stdout.includes('solo.md'), 'problems in files that target other playbooks stay out');
  assert.equal(r.status, 1);
  const j = JSON.parse(w.run(['playbook', 'compute', 'babysit', '--json']).stdout);
  assert.deepEqual([j.steps, j.notes, j.overrides, j.handoffs], [[], [], [], []]);
  assert.ok(j.problems.length > 0);
});

test('a dangling link in .agents/playbooks is reported, not a crash, and skips pstack\'s checker', () => {
  const w = world({ links: { '.agents/playbooks/stale.md': '../gone.md' } });
  const r = w.run(['playbook', 'compute', 'babysit']);
  assert.ok(r.stdout.includes('.agents/playbooks/stale.md:1: broken link -> ../gone.md'), r.stdout);
  assert.match(r.stdout, /pstack check-playbooks:\nnot run: broken link in \.agents\/playbooks\n$/);
  assert.match(r.stdout, /^1\. Check the team's merge calendar\./m);
  assert.equal(r.status, 1);
});

test('a new pstack version that passes check is recorded in config.json', () => {
  const w = world();
  const written = readFileSync(join(w.config, 'config.json'), 'utf8');
  setPstack(w.config, '0.9.0');
  const r = w.run(['playbook', 'compute', 'babysit']);
  assert.equal(r.stdout, BABYSIT);
  assert.equal(r.status, 0);
  assert.equal(
    readFileSync(join(w.config, 'config.json'), 'utf8'),
    written,
    'only the pstack value changes, so the user\'s formatting survives',
  );
});

test('a new pstack version that fails check stops compute and records nothing', () => {
  const w = world(BROKEN);
  setPstack(w.config, '0.9.0');
  const r = w.run(['playbook', 'compute', 'babysit']);
  assert.ok(!r.stdout.includes('# babysit'), r.stdout);
  assert.ok((r.stdout + r.stderr).includes(`${w.config}/playbooks/broken.md:7: quote not found: "no such words"`));
  assert.equal(r.status, 1);
  assert.equal(readLayers(w.config).pstack, '0.9.0');
});

test('check --pstack checks another installed version by name or path without writing', () => {
  for (const pick of ['1.1.0', join(FIXTURES, 'pstack', '1.1.0')]) {
    const w = world();
    const r = w.run(['check', '--pstack', pick]);
    const out = lines(r.stdout + r.stderr);
    assert.ok(out.includes(`${w.config}/playbooks/babysit-tester.md:6: quote not found: "Babysitting never authorizes merging"`), r.stdout);
    assert.ok(out.includes('.agents/playbooks/babysitting-an-acme-pr.md:8: quote not found: "Order is conflicts, then threads, then CI"'), r.stdout);
    assert.ok(out.includes('.agents/playbooks/babysitting-an-acme-pr.md: "Order is conflicts, then threads, then CI" is not in any playbook it extends'), 'pstack 1.1.0 checker lines pass through');
    assert.equal(r.status, 1);
    assert.equal(readLayers(w.config).pstack, '1.0.0');
  }
});

test('--repo outside a checkout reads the team files from the checkout config.json records', () => {
  const w = world();
  const r = w.run(['playbook', 'compute', 'babysit', '--repo', 'web'], { cwd: w.outside });
  assert.equal(r.stdout, BABYSIT);
  assert.equal(r.status, 0);
});

test('a worktree resolves to its main checkout', () => {
  const w = world();
  const tree = join(w.root, 'web-tree');
  git(w.repo, ['worktree', 'add', '-q', tree, '-b', 'side']);
  const r = w.run(['playbook', 'compute', 'babysit'], { cwd: tree });
  assert.equal(r.stdout, BABYSIT);
});

test('an https remote resolves owner and repo too', () => {
  const r = world({ remote: 'https://example.com/acme-eng/web.git' }).run(['playbook', 'compute', 'babysit']);
  assert.equal(r.stdout, BABYSIT);
});

test('without JSTACK_PSTACK_DIR the newest pstack under a home plugin cache wins by semver', () => {
  const w = world();
  const cache = join(w.home, '.someharness', 'plugins', 'cache', 'market', 'pstack');
  mkdirSync(cache, { recursive: true });
  symlinkSync(join(FIXTURES, 'pstack', '1.0.0'), join(cache, '1.9.0'));
  symlinkSync(join(FIXTURES, 'pstack', '1.1.0'), join(cache, '1.10.0'));
  const r = w.run(['playbook', 'list'], { env: { JSTACK_PSTACK_DIR: '' } });
  assert.match(r.stdout, /^web \(acme-eng · pstack 1\.10\.0\)$/m);
  assert.equal(r.status, 0);
});

// A home with pstack 1.9.0 and 1.10.0 in a plugin cache, and an install record that names `recorded` as the active one.
function cachedHome(recorded) {
  const w = world();
  const harness = join(w.home, '.someharness', 'plugins');
  const cache = join(harness, 'cache', 'market', 'pstack');
  mkdirSync(cache, { recursive: true });
  symlinkSync(join(FIXTURES, 'pstack', '1.0.0'), join(cache, '1.9.0'));
  symlinkSync(join(FIXTURES, 'pstack', '1.1.0'), join(cache, '1.10.0'));
  const record = {
    version: 2,
    plugins: {
      'other@market': [{ scope: 'user', installPath: join(harness, 'cache', 'market', 'other', '9.9.9'), version: '9.9.9' }],
      'pstack@market': [{ scope: 'user', installPath: join(cache, recorded), version: recorded }],
    },
  };
  writeFileSync(join(harness, 'installed_plugins.json'), JSON.stringify(record));
  return w;
}

test('without JSTACK_PSTACK_DIR the install record picks the active pstack over a newer cached one', () => {
  const r = cachedHome('1.9.0').run(['playbook', 'list'], { env: { JSTACK_PSTACK_DIR: '' } });
  assert.match(r.stdout, /^web \(acme-eng · pstack 1\.9\.0\)$/m);
  assert.equal(r.status, 0);
});

test('an install record whose folder is gone falls back to the newest cached pstack', () => {
  const r = cachedHome('1.8.0').run(['playbook', 'list'], { env: { JSTACK_PSTACK_DIR: '' } });
  assert.match(r.stdout, /^web \(acme-eng · pstack 1\.10\.0\)$/m);
  assert.equal(r.status, 0);
});

test('JSTACK_PSTACK_DIR wins over the install record', () => {
  const r = cachedHome('1.9.0').run(['playbook', 'list']);
  assert.match(r.stdout, /^web \(acme-eng · pstack 1\.0\.0\)$/m);
  assert.equal(r.status, 0);
});

test('check records the pstack it used in a new config.json that has no pstack yet', () => {
  const w = cachedHome('1.9.0');
  const path = join(w.config, 'config.json');
  const { pstack, ...rest } = readLayers(w.config);
  writeFileSync(path, JSON.stringify(rest));
  const r = w.run(['check'], { env: { JSTACK_PSTACK_DIR: '' } });
  assert.match(r.stdout, /check passed: pstack 1\.9\.0$/m);
  assert.equal(readLayers(w.config).pstack, '1.9.0');
});

// A pstack plugin folder named like a clone's plugins/pstack, whose name is no version.
function namedPstack(w, manifests) {
  const dir = join(w.root, 'clone', 'plugins', 'pstack');
  cpSync(PSTACK, dir, { recursive: true });
  for (const [path, content] of Object.entries(manifests)) {
    mkdirSync(join(dir, path, '..'), { recursive: true });
    writeFileSync(join(dir, path), JSON.stringify(content));
  }
  return dir;
}

test('a pstack folder whose name is no version takes its version from the plugin manifest', () => {
  for (const manifest of ['.claude-plugin/plugin.json', '.codex-plugin/plugin.json', '.muse-plugin/plugin.json', 'package.json']) {
    const w = world();
    const env = { JSTACK_PSTACK_DIR: namedPstack(w, { [manifest]: { name: 'pstack', version: '2.3.4' } }) };
    assert.match(w.run(['playbook', 'list'], { env }).stdout, /^web \(acme-eng · pstack 2\.3\.4\)$/m, manifest);
    assert.match(w.run(['check'], { env }).stdout, /^check passed: pstack 2\.3\.4$/m, manifest);
    assert.equal(readLayers(w.config).pstack, '2.3.4', manifest);
  }
});

test('a pstack with no version anywhere is named by its path and never recorded', () => {
  const w = world();
  const dir = namedPstack(w, { '.claude-plugin/plugin.json': { name: 'pstack' } });
  const env = { JSTACK_PSTACK_DIR: dir };
  assert.match(w.run(['playbook', 'list'], { env }).stdout, new RegExp(`^web \\(acme-eng · pstack ${dir}\\)$`, 'm'));
  const r = w.run(['check'], { env });
  assert.match(r.stdout, new RegExp(`^check passed: pstack ${dir}$`, 'm'));
  assert.equal(r.status, 0);
  assert.equal(readLayers(w.config).pstack, '1.0.0');
  assert.equal(JSON.parse(w.run(['check', '--json'], { env }).stdout).pstack, null);
});

test('no pstack found is a usage error that names the variable to set', () => {
  const r = world().run(['playbook', 'list'], { env: { JSTACK_PSTACK_DIR: '' } });
  assert.match(r.stderr, /JSTACK_PSTACK_DIR/);
  assert.equal(r.status, 2);
});

test('locate names the step, the stems that wrote and edited it, and the file to extend from the writer of the quoted words', () => {
  const w = world();
  const r = w.run(['playbook', 'locate', 'babysit', 'Work the merge frontier']);
  assert.equal(r.stderr, '');
  assert.equal(
    r.stdout,
    `# babysit step 3 (web · acme-eng · pstack 1.0.0)

**Work the merge frontier.** The lowest open PR matters first.   [babysit]

babysit wrote the quoted words. Write the edit in:
- ${w.config}/playbooks/babysit-tester.md (exists), extending babysit
`,
  );
  assert.equal(r.status, 0);
  const team = w.run(['playbook', 'locate', 'babysit', 'Snapshot diffs count']);
  assert.match(team.stdout, /^babysitting-an-acme-pr wrote the quoted words\. Write the edit in:\n- .*\/playbooks\/babysitting-an-acme-pr-tester\.md \(exists\), extending babysitting-an-acme-pr$/m);
});

test('locate sends an edit to words a user file wrote back to that file', () => {
  const w = world();
  const r = w.run(['playbook', 'locate', 'babysit-tester', 'the trunk ruleset', '--json']);
  assert.equal(r.status, 0);
  assert.deepEqual(JSON.parse(r.stdout), {
    playbook: 'babysit',
    asked: 'babysit-tester',
    repo: 'web',
    owner: 'acme-eng',
    org: 'acme',
    pstack: '1.0.0',
    step: 4,
    text: 'Read the trunk ruleset before the first push.',
    origin: 'babysit-tester',
    kind: 'user',
    touched: ['babysitting-an-acme-pr-tester'],
    writers: ['babysitting-an-acme-pr-tester'],
    edit: { path: join(w.config, 'playbooks', 'babysitting-an-acme-pr-tester.md'), exists: true, own: true, extends: null },
  });
  const md = w.run(['playbook', 'locate', 'babysit', 'the trunk ruleset']).stdout;
  assert.match(md, /^- .*babysitting-an-acme-pr-tester\.md \(exists; it wrote these words, so change its text there\)$/m);
});

test('locate exits 1 when the quote finds no step or more than one', () => {
  const w = world();
  const missing = w.run(['playbook', 'locate', 'babysit', 'no such words']);
  assert.equal(missing.stdout, 'quote not found: "no such words"\n');
  assert.equal(missing.status, 1);
  const ambiguous = w.run(['playbook', 'locate', 'babysit', 'the']);
  assert.match(ambiguous.stdout, /^quote matches steps .+; make it longer\n$/);
  assert.equal(ambiguous.status, 1);
});

test('an unknown playbook and a bad command are usage errors', () => {
  const w = world();
  const unknown = w.run(['playbook', 'compute', 'nope']);
  assert.match(unknown.stderr, /no playbook named nope/);
  assert.equal(unknown.status, 2);
  const bad = w.run(['frobnicate']);
  assert.match(bad.stderr, /usage: jstack-cli/);
  assert.equal(bad.status, 2);
  const help = w.run(['--help']);
  assert.match(help.stdout, /usage: jstack-cli/);
  assert.equal(help.status, 0);
});

test('bin/jstack-cli runs through a symlink placed on PATH', () => {
  const dir = tempDir();
  symlinkSync(BIN, join(dir, 'jstack-cli'));
  const r = spawnSync(join(dir, 'jstack-cli'), ['--help'], { encoding: 'utf8', env: { ...process.env, JSTACK_PSTACK_DIR: PSTACK } });
  assert.match(r.stdout, /usage: jstack-cli/);
  assert.equal(r.status, 0);
});

test('compute logs one line per read only when telemetry is on', () => {
  const w = world();
  const state = join(w.root, 'state');
  const log = join(state, 'usage.jsonl');
  w.run(['playbook', 'compute', 'babysit'], { env: { JSTACK_STATE: state } });
  assert.equal(existsSync(log), false, 'telemetry is off by default');
  writeFileSync(join(w.config, 'config.json'), JSON.stringify({ ...readLayers(w.config), telemetry: true }));
  w.run(['playbook', 'compute', 'babysit'], { env: { JSTACK_STATE: state } });
  w.run(['playbook', 'compute', 'triage', '--json'], { env: { JSTACK_STATE: state } });
  w.run(['playbook', 'compute', 'no-such-playbook'], { env: { JSTACK_STATE: state } });
  const reads = lines(readFileSync(log, 'utf8')).map((l) => JSON.parse(l));
  assert.deepEqual(reads.map(({ playbook, repo, org, pstack }) => ({ playbook, repo, org, pstack })), [
    { playbook: 'babysit', repo: 'web', org: 'acme', pstack: '1.0.0' },
    { playbook: 'triage', repo: 'web', org: 'acme', pstack: '1.0.0' },
  ]);
  assert.ok(reads.every((r) => !Number.isNaN(Date.parse(r.ts))));
});

test('a telemetry value that is not a boolean is a config error', () => {
  const w = world();
  writeFileSync(join(w.config, 'config.json'), JSON.stringify({ ...readLayers(w.config), telemetry: 'yes' }));
  const r = w.run(['check']);
  assert.equal(r.status, 2);
  assert.match(r.stderr, /"telemetry" must be true or false/);
});

test('a config dir that still has layers.json names the rename', () => {
  const w = world();
  renameSync(join(w.config, 'config.json'), join(w.config, 'layers.json'));
  const r = w.run(['check']);
  assert.equal(r.status, 2);
  assert.equal(r.stderr, `${w.config}/layers.json: rename it to config.json\n`);
});

test('an unresolved extends fails show for every playbook, and says the steps may lack its edits', () => {
  const w = world({ files: { 'playbooks/typo.md': '---\nextends: babysitt\nwhen: A typo\n---\n\n- **In** "Declare the mode" Be brief.\n' } });
  for (const name of ['babysit', 'feature']) {
    const r = w.run(['playbook', 'show', name]);
    assert.equal(r.status, 1, name);
    assert.match(r.stdout, /^1\. /m, `${name} still prints its steps`);
    assert.match(r.stdout, /a file has an extends that names no playbook, so it edits nothing.*may belong in these steps/);
    assert.match(r.stdout, /typo\.md:2: extends babysitt, which no playbook defines/);
    assert.doesNotMatch(r.stdout, /Be brief/);
  }
  const json = JSON.parse(w.run(['playbook', 'show', 'feature', '--json']).stdout);
  assert.ok(json.steps.length > 0);
  assert.match(json.problems[0].message, /extends babysitt/);
});

test('a file that partly resolves withholds what it touches, and only warns on the rest', () => {
  const w = world({ files: { 'playbooks/half.md': '---\nextends: babysit, babysitt\nwhen: Half\n---\n\n- **In** "Declare the mode" Be brief.\n' } });
  const touched = w.run(['playbook', 'show', 'babysit']);
  assert.equal(touched.status, 1);
  assert.match(touched.stdout, /^No steps: /m);
  const other = w.run(['playbook', 'show', 'feature']);
  assert.equal(other.status, 1);
  assert.match(other.stdout, /^1\. /m);
  assert.match(other.stdout, /half\.md:2: extends babysitt/);
});
