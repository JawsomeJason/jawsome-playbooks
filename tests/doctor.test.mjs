import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, readFileSync, readlinkSync, realpathSync, rmSync, symlinkSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { BIN, CLI, PSTACK, world } from './helpers.mjs';

const JSTACK_PLUGIN = { id: 'jstack@jstack', version: '0.1.0', scope: 'user', enabled: true };
const JSTACK_MARKET = { name: 'jstack', source: 'github', repo: 'JawsomeJason/jstack' };

/**
 * A healthy jstack install in a fake home: a stub `claude` on PATH that logs every call and lists `plugins`, jstack-cli
 * and Java's `jstack` on PATH, the mode skill linked into ~/.claude/skills, and the web checkout recorded in
 * config.json with its team link and exclude line. Tests remove one piece at a time.
 */
function doctorWorld({ plugins = [JSTACK_PLUGIN], marketplaces = [JSTACK_MARKET], claude = true, ...opts } = {}) {
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
  writeFileSync(join(bin, 'jstack'), '#!/bin/sh\necho java\n');
  chmodSync(join(bin, 'jstack'), 0o755);
  symlinkSync(BIN, join(bin, 'jstack-cli'));
  const layers = JSON.parse(readFileSync(join(w.config, 'config.json'), 'utf8'));
  if (w.repo) writeFileSync(join(w.config, 'config.json'), JSON.stringify({ ...layers, pstack: '0.9.0', repos: { web: { checkout: w.repo } } }, null, 2));
  mkdirSync(join(w.config, 'mode', 'tester-mode'), { recursive: true });
  writeFileSync(join(w.config, 'mode', 'tester-mode', 'SKILL.md'), '---\nname: tester-mode\n---\n');
  mkdirSync(join(w.home, '.claude', 'skills'), { recursive: true });
  symlinkSync(join(w.config, 'mode', 'tester-mode'), join(w.home, '.claude', 'skills', 'tester-mode'));
  if (w.repo) writeFileSync(join(w.repo, '.git', 'info', 'exclude'), '# git ls-files --others --exclude-from=.git/info/exclude\n/.agents/playbooks\n');
  const env = { PATH: `${bin}:/usr/bin:/bin` };
  const doctor = (args = [], { cwd = w.outside, env: extra = {} } = {}) => w.run(['doctor', ...args], { cwd, env: { ...env, ...extra } });
  const calls = () => (existsSync(log) ? readFileSync(log, 'utf8') : '');
  return { ...w, bin, env, doctor, calls };
}

const HEALTHY = (w) => `✓ pstack-claude 1.0.0: ${PSTACK}
✓ jstack 0.1.0 installed in Claude Code (user scope)
✓ jstack-cli: ${w.bin}/jstack-cli -> ${realpathSync(BIN)}
- jstack on PATH is ${w.bin}/jstack, not jstack-cli; type jstack-cli to run jstack
✓ config ${w.config}: config.json parses, handle tester
✓ mode skill ${w.config}/mode/tester-mode is linked into ${w.home}/.claude/skills
✓ web: ${w.repo}/.agents/playbooks links to ${w.config}/03-repos/web/01-team, and ${w.repo}/.git/info/exclude hides it
✓ jstack-cli check --repo web passed
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

/** Removes the jstack plugin, jstack-cli, the mode link, the team link, and the exclude line from a healthy world. */
function brokenWorld(opts) {
  const w = doctorWorld({ plugins: [], marketplaces: [], ...opts });
  unlinkSync(join(w.bin, 'jstack-cli'));
  unlinkSync(join(w.home, '.claude', 'skills', 'tester-mode'));
  unlinkSync(join(w.repo, '.agents', 'playbooks'));
  writeFileSync(join(w.repo, '.git', 'info', 'exclude'), '');
  return w;
}

test('each failing check prints the exact commands that fix it, and doctor exits 1', () => {
  const w = brokenWorld();
  const r = w.doctor();
  assert.equal(
    r.stdout,
    `✓ pstack-claude 1.0.0: ${PSTACK}
✗ jstack is not installed in Claude Code
    claude plugin marketplace add JawsomeJason/jstack
    claude plugin install jstack@jstack -s user
✗ jstack-cli is not on PATH
    mkdir -p ${w.home}/.local/bin
    ln -s ${realpathSync(BIN)} ${w.home}/.local/bin/jstack-cli
    add ${w.home}/.local/bin to PATH
- jstack on PATH is ${w.bin}/jstack, not jstack-cli; type jstack-cli to run jstack
✓ config ${w.config}: config.json parses, handle tester
✗ mode skill ${w.config}/mode/tester-mode is not linked into any skills folder
    ln -s ${w.config}/mode/tester-mode ${w.home}/.claude/skills/tester-mode
✗ web: ${w.repo}/.agents/playbooks is missing; ${w.repo}/.git/info/exclude does not hide /.agents/playbooks
    ln -s ${w.config}/03-repos/web/01-team ${w.repo}/.agents/playbooks
    echo /.agents/playbooks >> ${w.repo}/.git/info/exclude
✓ jstack-cli check --repo web passed
doctor failed: 4 problems
`,
  );
  assert.equal(r.status, 1);
  assert.equal(w.calls(), 'plugin list --json\nplugin marketplace list --json\n');
});

test('doctor --json carries each finding with its status and fixes', () => {
  const w = brokenWorld({ marketplaces: [JSTACK_MARKET] });
  const r = w.doctor(['--json']);
  const out = JSON.parse(r.stdout);
  assert.equal(r.status, 1);
  assert.equal(out.passed, false);
  assert.deepEqual(
    out.findings.map((f) => [f.id, f.status]),
    [['pstack', 'ok'], ['plugin', 'fail'], ['cli', 'fail'], ['jstack', 'info'], ['config', 'ok'], ['mode', 'fail'], ['repo:web', 'fail'], ['check:web', 'ok']],
  );
  assert.deepEqual(out.findings[1], {
    id: 'plugin',
    status: 'fail',
    message: 'jstack is not installed in Claude Code',
    details: [],
    fixes: [{ command: 'claude plugin install jstack@jstack -s user', run: true }],
  });
});

test('without claude on PATH, doctor reads install records and prints every harness row from the README', () => {
  const w = brokenWorld({ claude: false });
  const r = w.doctor([], { env: { JSTACK_PSTACK_DIR: '' } });
  const out = r.stdout.split('\n');
  const at = (line) => out.indexOf(line);
  assert.ok(at('✗ pstack-claude not found') >= 0, r.stdout);
  assert.equal(out[at('✗ pstack-claude not found') + 1], '    Claude Code: claude plugin marketplace add michael-denyer/pstack-claude, then claude plugin install pstack@pstack-claude -s user');
  assert.ok(out.includes('    Pi: pi install git:github.com/michael-denyer/pstack-claude'), r.stdout);
  assert.ok(at('✗ jstack is not installed in any harness install record') >= 0, r.stdout);
  assert.ok(out.includes('    Codex: codex plugin marketplace add JawsomeJason/jstack, then codex plugin add jstack@jstack'), r.stdout);
  assert.equal(r.status, 1);

  const record = join(w.home, '.someharness', 'plugins');
  mkdirSync(record, { recursive: true });
  writeFileSync(join(record, 'installed_plugins.json'), JSON.stringify({ plugins: { 'jstack@market': [{ scope: 'user', version: '0.2.0' }] } }));
  assert.ok(w.doctor().stdout.includes(`✓ jstack 0.2.0 in ${record}/installed_plugins.json\n`));
});

test('a jstack-cli on PATH that is not jstack fails with no command to run', () => {
  const w = doctorWorld();
  unlinkSync(join(w.bin, 'jstack-cli'));
  writeFileSync(join(w.bin, 'jstack-cli'), '#!/bin/sh\n');
  chmodSync(join(w.bin, 'jstack-cli'), 0o755);
  const out = JSON.parse(w.doctor(['--json']).stdout);
  assert.deepEqual(out.findings.find((f) => f.id === 'cli'), {
    id: 'cli',
    status: 'fail',
    message: `jstack-cli on PATH is ${w.bin}/jstack-cli, which is not jstack's`,
    details: [],
    fixes: [{ command: `move ${w.bin}/jstack-cli aside, then: ln -s ${realpathSync(BIN)} ${w.home}/.local/bin/jstack-cli`, run: false }],
  });
});

test('a missing config dir fails and names the setup command', () => {
  const w = doctorWorld();
  rmSync(w.config, { recursive: true });
  const r = w.doctor();
  assert.ok(r.stdout.includes(`✗ no config dir at ${w.config}\n    /jstack:setup\n`), r.stdout);
  assert.ok(r.stdout.includes('✓ jstack-cli check passed\n'), r.stdout);
  assert.equal(r.status, 1);
});

test('a repo with no known checkout is info, and the current checkout counts as known', () => {
  const w = doctorWorld();
  const layers = JSON.parse(readFileSync(join(w.config, 'config.json'), 'utf8'));
  delete layers.repos;
  writeFileSync(join(w.config, 'config.json'), JSON.stringify(layers));
  const outside = w.doctor();
  assert.ok(outside.stdout.includes('- web: no checkout known; set repos.web.checkout in config.json, or run doctor from the checkout\n'), outside.stdout);
  assert.equal(outside.status, 0);
  const inside = w.doctor([], { cwd: w.repo });
  assert.ok(inside.stdout.includes(`✓ web: ${w.repo}/.agents/playbooks links to ${w.config}/03-repos/web/01-team`), inside.stdout);
});

test('a failing jstack-cli check shows its lines', () => {
  const w = doctorWorld({ files: { '01-user/broken.md': '---\nextends: babysit\n---\n\n- **In** "no such words" more.\n' } });
  const r = w.doctor();
  assert.ok(
    r.stdout.includes(`✗ jstack-cli check --repo web failed
    ${w.config}/01-user/broken.md:1: missing when:
    ${w.config}/01-user/broken.md:5: quote not found: "no such words"
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
  // Answers, in finding order: jstack plugin y, jstack-cli n, mode link y, web links y.
  const pty = 'import pty, sys; sys.exit(pty.spawn(sys.argv[1:]) >> 8)';
  const r = spawnSync(python, ['-c', pty, process.execPath, CLI, 'doctor', '--fix'], {
    cwd: w.outside,
    input: 'y\nn\ny\ny\n',
    encoding: 'utf8',
    env: { ...process.env, HOME: w.home, JSTACK_CONFIG: w.config, JSTACK_PSTACK_DIR: PSTACK, ...w.env },
  });
  assert.equal(
    w.calls(),
    'plugin list --json\nplugin marketplace list --json\nplugin marketplace add JawsomeJason/jstack\nplugin install jstack@jstack -s user\nplugin list --json\nplugin marketplace list --json\n',
    r.stdout,
  );
  assert.equal(existsSync(join(w.home, '.local', 'bin', 'jstack-cli')), false);
  assert.equal(readlinkSync(join(w.home, '.claude', 'skills', 'tester-mode')), join(w.config, 'mode', 'tester-mode'));
  assert.equal(readlinkSync(join(w.repo, '.agents', 'playbooks')), join(w.config, '03-repos', 'web', '01-team'));
  assert.equal(readFileSync(join(w.repo, '.git', 'info', 'exclude'), 'utf8'), '/.agents/playbooks\n');
  assert.equal(r.status, 1, 'the stub claude installs nothing, so the plugin check still fails after the fixes');
});

test('doctor rejects --fix with --json, and the playbook flags', () => {
  const w = doctorWorld();
  for (const args of [['--fix', '--json'], ['--repo', 'web'], ['--pstack', '1.0.0']]) {
    const r = w.doctor(args);
    assert.equal(r.status, 2, args.join(' '));
    assert.match(r.stderr, /usage: jstack-cli/);
  }
  assert.equal(w.run(['check', '--fix']).status, 2);
});
