#!/usr/bin/env node
// Blocks a direct Edit or Write of an operator layer file, so playbook edits go through `playbook extend` and `playbook new`,
// which accept only valid grammar and roll back an edit that fails `check`. Team folders are not covered: they change through pull requests.
import { readFileSync, realpathSync } from 'node:fs';
import { homedir } from 'node:os';
import { basename, dirname, join, relative, resolve } from 'node:path';

if (process.env.JSTACK_ALLOW_LAYER_EDITS === '1') process.exit(0);

let input;
try {
  input = JSON.parse(readFileSync(0, 'utf8'));
} catch {
  process.exit(0);
}
const file = input.tool_input?.file_path;
if (typeof file !== 'string') process.exit(0);

const LAYER_FILE = /^(?:01-user|02-orgs\/[^/]+\/02-overrides|03-repos\/[^/]+\/02-overrides)\/.+\.md$/;

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

const config = resolve(process.env.JSTACK_CONFIG || join(homedir(), '.jstack'));
const inLayer = [[resolve(file), config], [real(file), real(config)]].some(([path, root]) => {
  const rel = relative(root, path);
  return !rel.startsWith('..') && LAYER_FILE.test(rel.split('\\').join('/'));
});
if (!inLayer) process.exit(0);
process.stderr.write(
  `${file} is a jstack layer file. Change it through the CLI so that only valid grammar lands: ` +
    '`playbook extend <parent> <file-name> after|before|replace|in "<quote>" --with <text|->` edits a playbook, ' +
    'and `playbook new <name> --when "<sentence>" --from-file <path|->` adds a standalone one. Both run `check` and undo an edit that fails it. ' +
    'To edit the file by hand anyway, set JSTACK_ALLOW_LAYER_EDITS=1.\n',
);
process.exit(2);
