import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, readFileSync, readlinkSync, realpathSync, rmSync, symlinkSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { CLI, PLAYBOOK, PSTACK, git, world } from './helpers.mjs';

const PLUGIN = { id: 'jawsome-playbooks@jawsome-playbooks', version: '0.1.0', scope: 'user', enabled: true };
const MARKET = { name: 'jawsome-playbooks', source: 'github', repo: 'JawsomeJason/jawsome-playbooks' };

/**
 * A healthy jawsome-playbooks install in a fake home: a stub `claude` on PATH that logs every call and lists `plugins`,
 * playbook on PATH, the mode skill linked into ~/.claude/skills, and the web checkout recorded in
 * config.json with its team playbooks committed. Tests remove one piece at a time.
 */
function doctorWorld({ plugins = [PLUGIN], marketplaces = [MARKET], claude = true, ...opts } = {}) {
  const w = world(opts);
  const bin = join(w.root, 'bin');
  const log = join(w.root, 'claude.log');
  mkdirSync(bin);
  writeFileSync(join(w.root, 'plugins.json'), JSON.stringify(plugins));
  writeFileSync(join(w.root, 'marketplaces.json'), JSON.stringify(marketplaces));
  if (claude) {
    writeFileSync(
      join(bin, 'claude'),
      `#!/bin/sh
printf '%s\\n' "$*" >> '${log}'
case "$*" in
  'plugin list --json') cat '${join(w.root, 'plugins.json')}' ;;
  'plugin marketplace list --json') cat '${join(w.root, 'marketplaces.json')}' ;;
esac
`,
    );
    chmodSync(join(bin, 'claude'), 0o755);
  }
  symlinkSync(PLAYBOOK, join(bin, 'playbook'));
  const layers = JSON.parse(readFileSync(join(w.config, 'config.json'), 'utf8'));
  if (w.repo) writeFileSync(join(w.config, 'config.json'), JSON.stringify({ ...layers, pstack: '0.9.0', repos: { web: { checkout: w.repo } } }, null, 2));
  mkdirSync(join(w.config, 'mode', 'tester-mode'), { recursive: true });
  writeFileSync(join(w.config, 'mode', 'tester-mode', 'SKILL.md'), '---\nname: tester-mode\n---\n');
  mkdirSync(join(w.home, '.claude', 'skills'), { recursive: true });
  symlinkSync(join(w.config, 'mode', 'tester-mode'), join(w.home, '.claude', 'skills', 'tester-mode'));
  if (w.repo) {
    git(w.repo, ['add', '.agents']);
    git(w.repo, ['commit', '-q', '-m', 'team playbooks']);
  }
  const env = { PATH: `${bin}:/usr/bin:/bin` };
  const doctor = (args = [], { cwd = w.outside, env: extra = {} } = {}) => w.run(['doctor', ...args], { cwd, env: { ...env, ...extra } });
  const calls = () => (existsSync(log) ? readFileSync(log, 'utf8') : '');
  return { ...w, bin, env, doctor, calls };
}

const HEALTHY = (w) => `✓ pstack-claude 1.0.0: ${PSTACK}
✓ jawsome-playbooks 0.1.0 installed in Claude Code (user scope)
✓ playbook: ${w.bin}/playbook -> ${realpathSync(PLAYBOOK)}
✓ config ${w.config}: config.json parses, handle tester
✓ mode skill ${w.config}/mode/tester-mode is linked into ${w.home}/.claude/skills
✓ web: ${w.repo}/.agents/playbooks holds 2 team playbooks
✓ playbook check --repo web passed
doctor passed
`;

test('doctor passes a healthy install, only reads, and writes nothing', () => {
  const w = doctorWorld();
  const before = readFileSync(join(w.config, 'config.json'), 'utf8');
  const r = w.doctor();
  assert.equal(r.stderr, '');
  assert.equal(r.stdout, HEALTHY(w));
  assert.equal(r.status, 0);
  assert.equal(w.calls(), 'plugin list --json\n');
  assert.equal(readFileSync(join(w.config, 'config.json'), 'utf8'), before, 'check runs pinned, so it records no pstack version');
});

/** Removes the plugin, the command link, the mode link, and the team playbooks from a healthy world. */
function brokenWorld(opts) {
  const w = doctorWorld({ plugins: [], marketplaces: [], ...opts });
  unlinkSync(join(w.bin, 'playbook'));
  unlinkSync(join(w.home, '.claude', 'skills', 'tester-mode'));
  rmSync(join(w.repo, '.agents', 'playbooks'), { recursive: true });
  dropTeamChildren(w);
  return w;
}

/** Deletes the fixture's user files that extend a team file, so a world with no team files still passes check. */
function dropTeamChildren(w) {
  for (const path of ['babysitting-an-acme-pr-tester.md', 'releasing-web-tester.md', 'repos/web/babysitting-an-acme-pr-web.md']) rmSync(join(w.config, 'playbooks', path));
}

test('each failing check prints the exact commands that fix it, and doctor exits 1', () => {
  const w = brokenWorld();
  const r = w.doctor();
  assert.equal(
    r.stdout,
    `✓ pstack-claude 1.0.0: ${PSTACK}
✗ jawsome-playbooks is not installed in Claude Code
    claude plugin marketplace add JawsomeJason/jawsome-playbooks
    claude plugin install jawsome-playbooks@jawsome-playbooks -s user
✗ playbook is not on PATH
    mkdir -p ${w.home}/.local/bin
    ln -s ${realpathSync(PLAYBOOK)} ${w.home}/.local/bin/playbook
    add ${w.home}/.local/bin to PATH
✓ config ${w.config}: config.json parses, handle tester
✗ mode skill ${w.config}/mode/tester-mode is not linked into any skills folder
    ln -s ${w.config}/mode/tester-mode ${w.home}/.claude/skills/tester-mode
- web: ${w.repo} has no .agents/playbooks, so it has no team playbooks
✓ playbook check --repo web passed
doctor failed: 3 problems
`,
  );
  assert.equal(r.status, 1);
  assert.equal(w.calls(), 'plugin list --json\nplugin marketplace list --json\n');
});

test('doctor ignores a leftover jstack-cli link, because the alias is gone', () => {
  const w = doctorWorld();
  symlinkSync(PLAYBOOK, join(w.bin, 'jstack-cli'));
  const r = w.doctor();
  assert.equal(r.stdout, HEALTHY(w));
  assert.deepEqual(JSON.parse(w.doctor(['--json']).stdout).findings.filter((f) => f.id === 'cli').map((f) => f.status), ['ok']);
});

test('doctor --json carries each finding with its status and fixes', () => {
  const w = brokenWorld({ marketplaces: [MARKET] });
  const r = w.doctor(['--json']);
  const out = JSON.parse(r.stdout);
  assert.equal(r.status, 1);
  assert.equal(out.passed, false);
  assert.deepEqual(
    out.findings.map((f) => [f.id, f.status]),
    [['pstack', 'ok'], ['plugin', 'fail'], ['cli', 'fail'], ['config', 'ok'], ['mode', 'fail'], ['repo:web', 'info'], ['check:web', 'ok']],
  );
  assert.deepEqual(out.findings[1], {
    id: 'plugin',
    status: 'fail',
    message: 'jawsome-playbooks is not installed in Claude Code',
    details: [],
    fixes: [{ command: 'claude plugin install jawsome-playbooks@jawsome-playbooks -s user', run: true }],
  });
});

test('without claude on PATH, doctor reads install records and prints every harness row from the README', () => {
  const w = brokenWorld({ claude: false });
  const r = w.doctor([], { env: { PLAYBOOKS_PSTACK_DIR: '' } });
  const out = r.stdout.split('\n');
  const at = (line) => out.indexOf(line);
  assert.ok(at('✗ pstack-claude not found') >= 0, r.stdout);
  assert.equal(out[at('✗ pstack-claude not found') + 1], '    Claude Code: claude plugin marketplace add michael-denyer/pstack-claude, then claude plugin install pstack@pstack-claude -s user');
  assert.ok(out.includes('    Pi: pi install git:github.com/michael-denyer/pstack-claude'), r.stdout);
  assert.ok(at('✗ jawsome-playbooks is not installed in any harness install record') >= 0, r.stdout);
  assert.ok(out.includes('    Codex: codex plugin marketplace add JawsomeJason/jawsome-playbooks, then codex plugin add jawsome-playbooks@jawsome-playbooks'), r.stdout);
  assert.equal(r.status, 1);

  const record = join(w.home, '.someharness', 'plugins');
  mkdirSync(record, { recursive: true });
  writeFileSync(join(record, 'installed_plugins.json'), JSON.stringify({ plugins: { 'jawsome-playbooks@market': [{ scope: 'user', version: '0.2.0' }] } }));
  assert.ok(w.doctor().stdout.includes(`✓ jawsome-playbooks 0.2.0 in ${record}/installed_plugins.json\n`));
});

test('a playbook on PATH that is not ours fails with no command to run', () => {
  const w = doctorWorld();
  unlinkSync(join(w.bin, 'playbook'));
  writeFileSync(join(w.bin, 'playbook'), '#!/bin/sh\n');
  chmodSync(join(w.bin, 'playbook'), 0o755);
  const out = JSON.parse(w.doctor(['--json']).stdout);
  assert.deepEqual(out.findings.find((f) => f.id === 'cli'), {
    id: 'cli',
    status: 'fail',
    message: `playbook on PATH is ${w.bin}/playbook, which is not jawsome-playbooks'`,
    details: [],
    fixes: [{ command: `move ${w.bin}/playbook aside, then: ln -s ${realpathSync(PLAYBOOK)} ${w.home}/.local/bin/playbook`, run: false }],
  });
});

test('a missing config dir fails and names the setup command', () => {
  const w = doctorWorld();
  rmSync(w.config, { recursive: true });
  const r = w.doctor();
  assert.ok(r.stdout.includes(`✗ no config dir at ${w.config}\n    /jawsome-playbooks:setup\n`), r.stdout);
  assert.ok(r.stdout.includes('✓ playbook check passed\n'), r.stdout);
  assert.equal(r.status, 1);
});

test('a repo with no known checkout is info, and the current checkout counts as known', () => {
  const w = doctorWorld();
  const layers = JSON.parse(readFileSync(join(w.config, 'config.json'), 'utf8'));
  layers.repos = { web: {} };
  writeFileSync(join(w.config, 'config.json'), JSON.stringify(layers));
  dropTeamChildren(w);
  const outside = w.doctor();
  assert.ok(outside.stdout.includes('- web: no checkout known; set repos.web.checkout in config.json, or run doctor from the checkout\n'), outside.stdout);
  assert.equal(outside.status, 0);
  const inside = w.doctor([], { cwd: w.repo });
  assert.ok(inside.stdout.includes(`✓ web: ${w.repo}/.agents/playbooks holds 2 team playbooks`), inside.stdout);
});

test('team playbooks that git does not track are info, and a leftover link into the config dir fails', () => {
  const w = doctorWorld();
  git(w.repo, ['rm', '-r', '-q', '--cached', '.agents']);
  const untracked = w.doctor();
  assert.ok(untracked.stdout.includes(`- web: ${w.repo}/.agents/playbooks holds 2 team playbooks, but git does not track them, so teammates do not see them\n`), untracked.stdout);
  assert.equal(untracked.status, 0);
  rmSync(join(w.repo, '.agents', 'playbooks'), { recursive: true });
  mkdirSync(join(w.config, 'old-team'));
  symlinkSync(join(w.config, 'old-team'), join(w.repo, '.agents', 'playbooks'));
  const linked = w.doctor();
  assert.ok(linked.stdout.includes(`✗ web: ${w.repo}/.agents/playbooks links into the config dir; team playbooks are committed copies, so replace the link with them
    rm ${w.repo}/.agents/playbooks
`), linked.stdout);
  assert.equal(linked.status, 1);
});

test('a failing playbook check shows its lines', () => {
  const w = doctorWorld({ files: { 'playbooks/broken.md': '---\nextends: babysit\n---\n\n- **In** "no such words" more.\n' } });
  const r = w.doctor();
  assert.ok(
    r.stdout.includes(`✗ playbook check --repo web failed
    ${w.config}/playbooks/broken.md:1: missing when:
    ${w.config}/playbooks/broken.md:5: quote not found: "no such words"
`),
    r.stdout,
  );
  assert.equal(r.status, 1);
});

test('doctor --fix without a terminal prints the fixes and runs none', () => {
  const w = brokenWorld();
  const r = w.doctor(['--fix']);
  assert.match(r.stdout, /^fixes not run: no terminal to ask on$/m);
  assert.equal(w.calls(), 'plugin list --json\nplugin marketplace list --json\n');
  assert.equal(existsSync(join(w.repo, '.agents', 'playbooks')), false);
  assert.equal(r.status, 1);
});

const python = spawnSync('sh', ['-c', 'command -v python3'], { encoding: 'utf8' }).stdout.trim();

test('doctor --fix asks per fix on the terminal and runs only the ones answered y', { skip: python ? false : 'needs python3 for a pseudo-terminal' }, () => {
  const w = brokenWorld();
  // Answers, in finding order: plugin y, playbook n, mode link y.
  const pty = 'import pty, sys; sys.exit(pty.spawn(sys.argv[1:]) >> 8)';
  const r = spawnSync(python, ['-c', pty, process.execPath, CLI, 'doctor', '--fix'], {
    cwd: w.outside,
    input: 'y\nn\ny\n',
    encoding: 'utf8',
    env: { ...process.env, HOME: w.home, PLAYBOOKS_CONFIG: w.config, PLAYBOOKS_PSTACK_DIR: PSTACK, ...w.env },
  });
  assert.equal(
    w.calls(),
    'plugin list --json\nplugin marketplace list --json\nplugin marketplace add JawsomeJason/jawsome-playbooks\nplugin install jawsome-playbooks@jawsome-playbooks -s user\nplugin list --json\nplugin marketplace list --json\n',
    r.stdout,
  );
  assert.equal(existsSync(join(w.home, '.local', 'bin', 'playbook')), false);
  assert.equal(readlinkSync(join(w.home, '.claude', 'skills', 'tester-mode')), join(w.config, 'mode', 'tester-mode'));
  assert.equal(r.status, 1, 'the stub claude installs nothing, so the plugin check still fails after the fixes');
});

test('doctor rejects --fix with --json, and the playbook flags', () => {
  const w = doctorWorld();
  for (const args of [['--fix', '--json'], ['--repo', 'web'], ['--pstack', '1.0.0']]) {
    const r = w.doctor(args);
    assert.equal(r.status, 2, args.join(' '));
    assert.match(r.stderr, /usage: playbook/);
  }
  assert.equal(w.run(['check', '--fix']).status, 2);
});
