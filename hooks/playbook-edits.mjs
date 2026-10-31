#!/usr/bin/env node
// Blocks a direct Edit or Write of an operator's user playbook file, so playbook edits go through `playbook extend` and
// `playbook new`, which accept only valid grammar and roll back an edit that adds a `check` problem. A file that has a problem
// stays open, because a stale quote can only be repaired by hand. Team files are not covered: they change through pull requests.
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, realpathSync } from 'node:fs';
import { homedir } from 'node:os';
import { basename, dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// The JSTACK_ names and ~/.jstack are read until 0.9.0, as the playbook script reads them.
const env = (name, legacy = name) => process.env[`PLAYBOOKS_${name}`] ?? process.env[`JSTACK_${legacy}`];
if (env('ALLOW_EDITS', 'ALLOW_PLAYBOOK_EDITS') === '1') process.exit(0);

let input;
try {
  input = JSON.parse(readFileSync(0, 'utf8'));
} catch {
  process.exit(0);
}
const file = input.tool_input?.file_path;
if (typeof file !== 'string') process.exit(0);

const USER_FILE = /^playbooks\/(?:(?:orgs|repos)\/[^/]+\/)?(?!README\.md$)[^/]+\.md$/;

// The nearest existing ancestor is resolved, so a file that does not exist yet still resolves through its folder's symlinks.
function real(path) {
  const tail = [];
  for (let p = resolve(path); ; p = dirname(p)) {
    try {
      return join(realpathSync(p), ...tail);
    } catch {
      if (dirname(p) === p) return resolve(path);
      tail.unshift(basename(p));
    }
  }
}

const current = join(homedir(), '.jawsome-playbooks');
const legacy = join(homedir(), '.jstack');
const config = resolve(env('CONFIG') || (!existsSync(current) && existsSync(legacy) ? legacy : current));
const isUserFile = [[resolve(file), config], [real(file), real(config)]].some(([path, root]) => {
  const rel = relative(root, path);
  return !rel.startsWith('..') && USER_FILE.test(rel.split('\\').join('/'));
});
if (!isUserFile) process.exit(0);

const CLI = fileURLToPath(new URL('../skills/playbook/scripts/playbook.mjs', import.meta.url));

/** The paths `check` reports a problem in, in every context, or null when the check cannot run. */
function pathsWithProblems() {
  const r = spawnSync(process.execPath, [CLI, 'check', '--every-repo', '--json'], { encoding: 'utf8', timeout: 25000 });
  if (r.status !== 0 && r.status !== 1) return null;
  try {
    return JSON.parse(r.stdout).problems.map((p) => p.path);
  } catch {
    return null;
  }
}

const paths = pathsWithProblems();
if (!paths) {
  const message = `jawsome-playbooks could not run \`playbook check\`, so the direct edit of ${file} is not blocked. Run \`playbook check --every-repo\` after it.`;
  process.stderr.write(`${message}\n`);
  process.stdout.write(`${JSON.stringify({ systemMessage: message })}\n`);
  process.exit(0);
}
if (paths.some((path) => real(path) === real(file))) process.exit(0);
process.stderr.write(
  `${file} is a jawsome-playbooks user playbook file. Change it through the CLI so that only valid grammar lands: ` +
    '`playbook extend <parent> [<file-name>] after|before|replace|in "<quote>" --with <text|->` edits a playbook, ' +
    'and `playbook new <name> --when "<sentence>" --from-file <path|->` adds a standalone one. Both run `check` and undo an edit that adds a problem. A file that has a `check` problem can be edited directly, to repair it. ' +
    'To edit the file by hand anyway, set PLAYBOOKS_ALLOW_EDITS=1.\n',
);
process.exit(2);
