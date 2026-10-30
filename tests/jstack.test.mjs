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

1. Check the team's merge calendar. Skip it on hotfix branches.   [org.standard ~ repo.overrides]
2. **Declare the mode before any poll.** Pick drive or background for the PR.   [pstack]
3. **Work the merge frontier.** The lowest open PR matters first.   [pstack]
4. Read ~~the default branch's ruleset~~ the trunk ruleset before the first push.   [user ~ org.overrides]
5. **Order is conflicts, then threads, then CI.** Batch fixes into one push.   [pstack ~ org.standard]

   On a conflict, report it and stop. Snapshot diffs count as CI.
6. **Stop at the human's line.** ~~Babysitting never authorizes merging~~ Merge once approved and green.   [pstack ~ user]

Notes:
- Ping the author when the frontier is merge-ready.   [user]

Overrides:
- step 1: repo.overrides added to "Check the team's merge calendar" (org.standard)
- step 4: org.overrides replaced "the default branch's ruleset" (user)
- step 5: org.standard added to "Order is conflicts, then threads, then CI" (pstack)
- step 6: user replaced "Babysitting never authorizes merging" (pstack)

pstack check-playbooks:
ok
`;

test('compute layers every verb in cascade order and tags each step with its provenance', () => {
  const w = world();
  const r = w.run(['playbook', 'compute', 'babysit']);
  assert.equal(r.stderr, '');
  assert.equal(r.stdout, BABYSIT);
  assert.equal(r.status, 0);
});

test('compute --json carries the same cascade as data', () => {
  const w = world();
  const r = w.run(['playbook', 'compute', 'babysit', '--json']);
  assert.equal(r.status, 0);
  assert.deepEqual(JSON.parse(r.stdout), {
    playbook: 'babysit',
    repo: 'web',
    owner: 'acme-eng',
    org: 'acme',
    pstack: '1.0.0',
    steps: [
      { text: "Check the team's merge calendar. Skip it on hotfix branches.", origin: 'org.standard', touched: ['repo.overrides'] },
      { text: '**Declare the mode before any poll.** Pick drive or background for the PR.', origin: 'pstack', touched: [] },
      { text: '**Work the merge frontier.** The lowest open PR matters first.', origin: 'pstack', touched: [] },
      { text: 'Read the trunk ruleset before the first push.', origin: 'user', touched: ['org.overrides'] },
      {
        text: '**Order is conflicts, then threads, then CI.** Batch fixes into one push.\n\n   On a conflict, report it and stop. Snapshot diffs count as CI.',
        origin: 'pstack',
        touched: ['org.standard'],
      },
      { text: "**Stop at the human's line.** Merge once approved and green.", origin: 'pstack', touched: ['user'] },
    ],
    notes: [{ text: 'Ping the author when the frontier is merge-ready.', layer: 'user' }],
    overrides: [
      { step: 1, layer: 'repo.overrides', verb: 'In', quote: "Check the team's merge calendar", origin: 'org.standard' },
      { step: 4, layer: 'org.overrides', verb: 'Replace', quote: "the default branch's ruleset", origin: 'user' },
      { step: 5, layer: 'org.standard', verb: 'In', quote: 'Order is conflicts, then threads, then CI', origin: 'pstack' },
      { step: 6, layer: 'user', verb: 'Replace', quote: 'Babysitting never authorizes merging', origin: 'pstack' },
    ],
    handoffs: [],
    problems: [],
    pstackCheck: { status: 'ok', lines: [OK_LINE] },
  });
});

test('a playbook with no numbered steps takes each bold-lead paragraph as a step', () => {
  const r = world().run(['playbook', 'compute', 'opening-a-pr']);
  assert.equal(r.stdout, `# opening-a-pr (web · acme-eng · pstack 1.0.0)

1. **Commits.** Commit in small units.   [pstack]
2. Sign every commit.   [user]
3. **Titles.** Use a typed subject line.   [pstack ~ user]
Keep it short. Name the scope.
4. **Readiness.** Open every PR ready.   [pstack]

Overrides:
- step 3: user added to "Keep it short." (pstack)

pstack check-playbooks:
ok
`);
  assert.equal(r.status, 0);
});

test('higher personal layers edit a standalone playbook by stem, anchored on its cascaded steps', () => {
  const r = world().run(['playbook', 'compute', 'triage']);
  assert.equal(r.stdout, `# triage (web · acme-eng · pstack 1.0.0)

1. Reproduce the bug.   [user]
2. ~~Capture the logs~~ Capture the server logs.   [org.overrides ~ repo.overrides]
3. Write the failing test.   [user]

Overrides:
- step 2: repo.overrides replaced "Capture the logs" (org.overrides)

pstack check-playbooks:
ok
`);
  assert.equal(r.status, 0);
});

test('a standalone team playbook starts from its own numbered steps', () => {
  const r = world().run(['playbook', 'compute', 'web-release']);
  assert.equal(r.stdout, `# web-release (web · acme-eng · pstack 1.0.0)

1. Tag the release.   [repo.standard]
2. Post the tag in the team channel.   [repo.overrides]
3. Watch the deploy.   [repo.standard]

pstack check-playbooks:
ok
`);
  assert.equal(r.status, 0);
});

test('a team Replace on pstack text wins over a lower layer that replaced the same words', () => {
  const team = readFileSync(join(FIXTURES, 'config/02-orgs/acme/01-standard/babysit.md'), 'utf8');
  const w = world({
    files: { '02-orgs/acme/01-standard/babysit.md': team + '- **Replace** "Babysitting never authorizes merging" Hand it to the release captain\n' },
  });
  const r = w.run(['playbook', 'compute', 'babysit', '--json']);
  const out = JSON.parse(r.stdout);
  assert.deepEqual(out.steps[5], {
    text: "**Stop at the human's line.** Hand it to the release captain.",
    origin: 'pstack',
    touched: ['user', 'org.standard'],
  });
  assert.deepEqual(
    out.overrides.filter((o) => o.step === 6),
    [
      { step: 6, layer: 'user', verb: 'Replace', quote: 'Babysitting never authorizes merging', origin: 'pstack' },
      { step: 6, layer: 'org.standard', verb: 'Replace', quote: 'Babysitting never authorizes merging', origin: 'pstack', over: 'user' },
    ],
  );
  const md = w.run(['playbook', 'compute', 'babysit']).stdout;
  assert.match(md, /^6\. \*\*Stop at the human's line\.\*\* ~~Babysitting never authorizes merging~~ ~~Merge once approved and green~~ Hand it to the release captain\. {3}\[pstack ~ user ~ org\.standard\]$/m);
  assert.match(md, /^- step 6: org\.standard replaced "Babysitting never authorizes merging" \(pstack, over user\)$/m);
});

test('with no config the cascade is pstack alone', () => {
  const w = world({ checkout: false });
  const r = w.run(['playbook', 'compute', 'feature'], { env: { JSTACK_CONFIG: join(w.root, 'missing') } });
  assert.equal(r.stdout, `# feature (pstack 1.0.0)

1. Name the data shape.   [pstack]
2. Delegate the code.   [pstack]
3. Verify on the real surface.   [pstack]
4. Run **Opening a PR**, per **Nowhere**.   [pstack]

Hands off to:
- opening-a-pr (step 4)

pstack check-playbooks:
not run: no .agents/playbooks
`);
  assert.equal(r.status, 0);
});

const HANDOFFS = {
  files: {
    '01-user/handoffs.md': `---
when: handing work between playbooks
---

1. Run **Opening a PR** once the diff is clean.
2. Write it per **Comments**, then hand it to Shiping.
3. Route that request to **Babysat**, or per \`playbooks/triage.md\`.
4. Then run web-releas and opening-a-pr.
5. Hand the frontier to Babysit once green.
6. Run read-only checks per PR.
`,
    '03-repos/web/02-overrides/handoffs.md': `---
extends: handoffs
when: handing work between web playbooks
---

- Then run web-release, or hand it to **Babysit**.
`,
  },
};

test('compute withholds a playbook whose layer file hands off to a playbook nothing defines', () => {
  const w = world(HANDOFFS);
  const r = w.run(['playbook', 'compute', 'handoffs']);
  assert.equal(r.stdout, `# handoffs (web · acme-eng · pstack 1.0.0)

No steps: a layer file that edits handoffs has problems, so some of its edits would be lost. Fix the files below, then run \`playbook check\` until it passes.

Problems:
${w.config}/01-user/handoffs.md:6: hands off to Shiping, which no layer or pstack defines
${w.config}/01-user/handoffs.md:7: hands off to Babysat, which no layer or pstack defines
${w.config}/01-user/handoffs.md:8: hands off to web-releas, which no layer or pstack defines

pstack check-playbooks:
ok
`);
  assert.equal(r.status, 1);
});

test('check flags a layer handoff nothing defines, and leaves section names and pstack text alone', () => {
  const w = world(HANDOFFS);
  const r = w.run(['check']);
  assert.deepEqual(lines(r.stdout), [
    OK_LINE,
    `${w.config}/01-user/handoffs.md:6: hands off to Shiping, which no layer or pstack defines`,
    `${w.config}/01-user/handoffs.md:7: hands off to Babysat, which no layer or pstack defines`,
    `${w.config}/01-user/handoffs.md:8: hands off to web-releas, which no layer or pstack defines`,
    'proposed: .agents/playbooks/babysit.md:5',
    'check failed: 3 problems against pstack 1.0.0',
  ]);
  assert.equal(r.status, 1);
});

const LINKS = {
  files: {
    '01-user/watching-review-asks.md': `---
when: watching for review asks
---

1. **Read the asks.** List them.
2. **Answer each.** Reply in the thread.
3. **Report.** Say what changed.
`,
    '01-user/reviewing-code.md': `---
when: reviewing code
---

1. **Read the diff.** All of it.
`,
    '01-user/links.md': `---
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

test('check flags a near-miss link and a step the playbook lacks, and leaves correct prose alone', () => {
  const w = world(LINKS);
  const r = w.run(['check']);
  const links = `${w.config}/01-user/links.md`;
  assert.deepEqual(lines(r.stdout), [
    OK_LINE,
    `${links}:5: "Run babysit" names babysit but does not register as a handoff; write playbooks/babysit.md`,
    `${links}:6: "runs reviewing-code" names reviewing-code but does not register as a handoff; write playbooks/reviewing-code.md`,
    `${links}:9: watching-review-asks step 4, but watching-review-asks has 3 steps`,
    `${links}:10: babysit step 9, but babysit has 6 steps`,
    `${links}:11: "Run babysit" names babysit but does not register as a handoff; write playbooks/babysit.md`,
    'proposed: .agents/playbooks/babysit.md:5',
    'check failed: 5 problems against pstack 1.0.0',
  ]);
  assert.equal(r.status, 1);
});

test('compute withholds a playbook whose layer file has a near-miss link', () => {
  const w = world(LINKS);
  const r = w.run(['playbook', 'compute', 'links']);
  assert.match(r.stdout, /^No steps: /m);
  assert.equal(r.status, 1);
});

test('a handoff to a playbook only another org defines is info, not a problem', () => {
  const w = world({
    files: {
      '02-orgs/other/01-standard/syncing-a-ticket.md': `---
when: moving a ticket on
layer: org.standard
source: ruleset
---

1. Move the ticket to done.
`,
      '01-user/landing.md': `---
when: landing a PR
---

1. Once the last PR lands, run syncing-a-ticket.
`,
    },
  });
  const r = w.run(['check']);
  assert.deepEqual(lines(r.stdout), [
    OK_LINE,
    `info: ${w.config}/01-user/landing.md:5: hands off to syncing-a-ticket, which only 02-orgs/other/01-standard defines`,
    'proposed: .agents/playbooks/babysit.md:5',
    'check passed: pstack 1.0.0',
  ]);
  assert.equal(r.status, 0);
  const json = JSON.parse(w.run(['check', '--json']).stdout);
  assert.deepEqual(json.problems, []);
  assert.deepEqual(json.info, [{ path: `${w.config}/01-user/landing.md`, line: 5, message: 'hands off to syncing-a-ticket, which only 02-orgs/other/01-standard defines' }]);
});

test('a handoff inside an edit is checked, but the pstack words it quotes are not', () => {
  const w = world({
    files: {
      '01-user/feature.md': `---
extends: feature
when: building a feature
---

- **In** "Run **Opening a PR**, per **Nowhere**." Then hand it to **Shiping**.
`,
    },
  });
  const r = w.run(['check']);
  assert.ok(lines(r.stdout).includes(`${w.config}/01-user/feature.md:6: hands off to Shiping, which no layer or pstack defines`), r.stdout);
  assert.ok(!r.stdout.includes('Nowhere'), r.stdout);
});

test('list shows which layer defines or edits each playbook', () => {
  const r = world().run(['playbook', 'list']);
  assert.equal(r.stdout, `web (acme-eng · pstack 1.0.0)
playbook      source    user  org.std  org.ovr  repo.std  repo.ovr
babysit       pstack     +       +        +        ·         +
feature       pstack     ·       ·        ·        ·         ·
opening-a-pr  pstack     +       ·        ·        ·         ·
triage        user       ●       ·        +        ·         +
web-release   repo.std   ·       ·        ·        ●         +
● defines  + edits  · untouched
`);
  assert.equal(r.status, 0);
});

test('list --json names each cell', () => {
  const out = JSON.parse(world().run(['playbook', 'list', '--json']).stdout);
  assert.deepEqual(out.layers, ['user', 'org.standard', 'org.overrides', 'repo.standard', 'repo.overrides']);
  assert.deepEqual(out.playbooks.find((p) => p.name === 'web-release'), {
    name: 'web-release',
    source: 'repo.standard',
    layers: { user: 'none', 'org.standard': 'none', 'org.overrides': 'none', 'repo.standard': 'defines', 'repo.overrides': 'edits' },
  });
});

test('check passes a clean config, passes pstack lines through and lists proposed team rules', () => {
  const r = world().run(['check']);
  assert.equal(r.stdout, `${OK_LINE}
proposed: .agents/playbooks/babysit.md:5
check passed: pstack 1.0.0
`);
  assert.equal(r.status, 0);
});

const BROKEN = {
  files: {
    '01-user/broken.md': `---
extends: babysit, nope
---

- **In** "PR" more words.
- **Replace** "stays out of every step" x
- **After** "no such words" y
`,
    '01-user/solo.md': `---
when: a solo flow
---

1. Do the thing.
- **After** "Do the thing" again
`,
    '03-repos/web/01-team/bad-team.md': `---
extends: babysit
when: a bad team rule
layer: repo.standard
---

- **In** "the trunk ruleset" z
`,
    '03-repos/web/01-team/triage.md': `---
when: triaging in web
layer: repo.standard
source: ruleset
---

- **In** "Reproduce the bug." x
`,
  },
  links: { '01-user/gone.md': '../nowhere.md' },
};

test('check reports every validator rule with path and line', () => {
  const w = world(BROKEN);
  const r = w.run(['check']);
  const c = w.config;
  assert.deepEqual(lines(r.stdout).sort(), [
    OK_LINE,
    `${c}/01-user/broken.md:1: missing when:`,
    `${c}/01-user/broken.md:2: extends nope, which pstack 1.0.0 has no playbook for`,
    `${c}/01-user/broken.md:5: quote matches steps 1 and 2; make it longer`,
    `${c}/01-user/broken.md:6: quote is outside a numbered step`,
    `${c}/01-user/broken.md:7: quote not found: "no such words"`,
    `${c}/01-user/gone.md:1: broken link -> ../nowhere.md`,
    `${c}/01-user/solo.md:6: standalone playbook cannot carry edits`,
    '.agents/playbooks/bad-team.md:1: team file needs layer: and source:',
    '.agents/playbooks/bad-team.md:7: team files may quote pstack only',
    '.agents/playbooks/triage.md:7: team files may quote pstack only',
    'check failed: 10 problems against pstack 1.0.0',
    'proposed: .agents/playbooks/babysit.md:5',
  ].sort());
  assert.equal(r.status, 1);
});

test('a file that targets a playbook only by its stem gets an info line, and the cascade still applies it', () => {
  const stemOnly = `---
when: building a feature
---

- **In** "Name the data shape." stem words.
`;
  const w = world({ files: { '01-user/feature.md': stemOnly } });
  const r = w.run(['check']);
  assert.ok(lines(r.stdout).includes(`info: ${w.config}/01-user/feature.md:1: targets feature by its file name; add \`extends: feature\` to say so`));
  assert.equal(r.status, 0, r.stdout);
  const listed = JSON.parse(w.run(['check', '--json']).stdout);
  assert.deepEqual(listed.problems, []);
  const before = w.run(['playbook', 'compute', 'feature']).stdout;
  assert.match(before, /stem words/);
  writeFileSync(join(w.config, '01-user/feature.md'), stemOnly.replace('when:', 'extends: feature\nwhen:'));
  assert.ok(!w.run(['check']).stdout.includes('targets feature'));
  assert.equal(w.run(['playbook', 'compute', 'feature']).stdout, before);
});

test('extends of a playbook the same layer defines says so instead of blaming pstack', () => {
  const w = world({
    files: {
      '01-user/aaa-flow.md': `---\nextends: zzz-flow\nwhen: a flow\n---\n\n- A note.\n`,
      '01-user/zzz-flow.md': `---\nwhen: another flow\n---\n\n1. Do the thing.\n`,
    },
  });
  const r = w.run(['check']);
  assert.ok(lines(r.stdout).includes(`${w.config}/01-user/aaa-flow.md:2: extends zzz-flow, which the user layer defines, and a layer extends only playbooks below it`));
  assert.equal(r.status, 1);
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

test('check flags a layers key, since the numbered folders set the cascade order', () => {
  const w = world();
  const layers = readLayers(w.config);
  writeFileSync(join(w.config, 'config.json'), JSON.stringify({ ...layers, layers: ['repo.overrides', 'user'] }));
  const r = w.run(['check']);
  assert.ok(lines(r.stdout).includes(`${w.config}/config.json:1: "layers" is retired: the numbered folders set the cascade order, so delete the key`), r.stdout);
  assert.equal(r.status, 1);
  const out = JSON.parse(w.run(['playbook', 'list', '--json']).stdout);
  assert.deepEqual(out.layers, ['user', 'org.standard', 'org.overrides', 'repo.standard', 'repo.overrides']);
});

test('check names the rename for each unnumbered layer folder', () => {
  const w = world();
  renameSync(join(w.config, '01-user'), join(w.config, 'user'));
  const r = w.run(['check']);
  assert.ok(lines(r.stdout).includes(`${w.config}/user:1: rename user/ to 01-user/ (inside it: standard/ to 01-standard/, team/ to 01-team/, overrides/ to 02-overrides/)`), r.stdout);
  assert.equal(r.status, 1);
});

test('compute withholds the steps when a file touching the playbook has problems, and exits 1', () => {
  const w = world(BROKEN);
  const r = w.run(['playbook', 'compute', 'babysit']);
  assert.match(r.stdout, /^# babysit \(web · acme-eng · pstack 1\.0\.0\)$/m);
  assert.match(r.stdout, /^No steps: .*`playbook check`/m);
  assert.doesNotMatch(r.stdout, /^1\. /m);
  assert.match(r.stdout, /^Problems:$/m);
  assert.ok(r.stdout.includes(`${w.config}/01-user/broken.md:5: quote matches steps 1 and 2; make it longer`), r.stdout);
  assert.ok(r.stdout.includes(`${w.config}/01-user/gone.md:1: broken link -> ../nowhere.md`), r.stdout);
  assert.ok(!r.stdout.includes('solo.md'), 'problems in files that target other playbooks stay out');
  assert.equal(r.status, 1);
  const j = JSON.parse(w.run(['playbook', 'compute', 'babysit', '--json']).stdout);
  assert.deepEqual([j.steps, j.notes, j.overrides, j.handoffs], [[], [], [], []]);
  assert.ok(j.problems.length > 0);
});

test('a dangling link in .agents/playbooks is reported, not a crash, and skips pstack\'s checker', () => {
  const w = world({ links: { '03-repos/web/01-team/stale.md': '../../../02-orgs/acme/01-standard/gone.md' } });
  const r = w.run(['playbook', 'compute', 'babysit']);
  assert.ok(r.stdout.includes('.agents/playbooks/stale.md:1: broken link -> ../../../02-orgs/acme/01-standard/gone.md'), r.stdout);
  assert.match(r.stdout, /pstack check-playbooks:\nnot run: broken link in \.agents\/playbooks\n$/);
  assert.match(r.stdout, /^1\. Check the team's merge calendar\./m);
  assert.equal(r.status, 1);
});

test('a new pstack version that passes check is recorded in config.json', () => {
  const w = world();
  setPstack(w.config, '0.9.0');
  const r = w.run(['playbook', 'compute', 'babysit']);
  assert.equal(r.stdout, BABYSIT);
  assert.equal(r.status, 0);
  assert.equal(
    readFileSync(join(w.config, 'config.json'), 'utf8'),
    readFileSync(join(FIXTURES, 'config/config.json'), 'utf8'),
    'only the pstack value changes, so the user\'s formatting survives',
  );
});

test('a new pstack version that fails check stops compute and records nothing', () => {
  const w = world(BROKEN);
  setPstack(w.config, '0.9.0');
  const r = w.run(['playbook', 'compute', 'babysit']);
  assert.ok(!r.stdout.includes('# babysit'), r.stdout);
  assert.ok((r.stdout + r.stderr).includes(`${w.config}/01-user/broken.md:7: quote not found: "no such words"`));
  assert.equal(r.status, 1);
  assert.equal(readLayers(w.config).pstack, '0.9.0');
});

test('check --pstack checks another installed version by name or path without writing', () => {
  for (const pick of ['1.1.0', join(FIXTURES, 'pstack', '1.1.0')]) {
    const w = world();
    const r = w.run(['check', '--pstack', pick]);
    const out = lines(r.stdout + r.stderr);
    assert.ok(out.includes(`${w.config}/01-user/babysit.md:6: quote not found: "Babysitting never authorizes merging"`), r.stdout);
    assert.ok(out.includes('.agents/playbooks/babysit.md:9: quote not found: "Order is conflicts, then threads, then CI"'), r.stdout);
    assert.ok(out.includes('.agents/playbooks/babysit.md: "Order is conflicts, then threads, then CI" is not in any playbook it extends'), 'pstack 1.1.0 checker lines pass through');
    assert.equal(r.status, 1);
    assert.equal(readLayers(w.config).pstack, '1.0.0');
  }
});

test('--repo outside a checkout reads team files from the config and infers the org from their links', () => {
  const w = world();
  const r = w.run(['playbook', 'compute', 'babysit', '--repo', 'web'], { cwd: w.outside });
  const body = (s) => s.slice(s.indexOf('\n1. '), s.indexOf('\npstack check-playbooks:'));
  assert.match(r.stdout, /^# babysit \(web · acme · pstack 1\.0\.0\)$/m);
  assert.equal(body(r.stdout), body(BABYSIT));
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

test('locate names the step a quote finds and the file each layer would write an edit in', () => {
  const w = world();
  const r = w.run(['playbook', 'locate', 'babysit', 'Work the merge frontier']);
  assert.equal(r.stderr, '');
  assert.equal(
    r.stdout,
    `# babysit step 3 (web · acme-eng · pstack 1.0.0)

**Work the merge frontier.** The lowest open PR matters first.   [pstack]

Write the edit in:
- user: ${w.config}/01-user/babysit.md (exists)
- org.standard: .agents/playbooks/babysit.md (exists)
- org.overrides: ${w.config}/02-orgs/acme/02-overrides/babysit.md (exists)
- repo.standard: .agents/playbooks/web-babysit.md (new)
- repo.overrides: ${w.config}/03-repos/web/02-overrides/babysit.md (exists)
`,
  );
  assert.equal(r.status, 0);
});

test('locate checks the quote against each layer as the layers below it leave the step', () => {
  const w = world();
  const r = w.run(['playbook', 'locate', 'babysit', 'before the first push', '--json']);
  assert.equal(r.status, 0);
  assert.deepEqual(JSON.parse(r.stdout), {
    playbook: 'babysit',
    repo: 'web',
    owner: 'acme-eng',
    org: 'acme',
    pstack: '1.0.0',
    step: 4,
    text: 'Read the trunk ruleset before the first push.',
    origin: 'user',
    touched: ['org.overrides'],
    layers: [
      { layer: 'user', path: join(w.config, '01-user', 'babysit.md'), exists: true, problem: 'this layer wrote the step; change its text there' },
      { layer: 'org.standard', path: '.agents/playbooks/babysit.md', exists: true, problem: 'team files may quote pstack only' },
      { layer: 'org.overrides', path: join(w.config, '02-orgs', 'acme', '02-overrides', 'babysit.md'), exists: true, problem: null },
      { layer: 'repo.standard', path: '.agents/playbooks/web-babysit.md', exists: false, problem: 'team files may quote pstack only' },
      { layer: 'repo.overrides', path: join(w.config, '03-repos', 'web', '02-overrides', 'babysit.md'), exists: true, problem: null },
    ],
  });
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
