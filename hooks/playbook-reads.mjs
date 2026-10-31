#!/usr/bin/env node
// Blocks reading an installed pstack playbook file directly. That file holds only pstack's
// steps, so an agent that reads it skips every file that extends it; `playbook show` (or its deprecated alias `jstack-cli playbook compute`) applies them.
import { readFileSync } from 'node:fs';

const BUNDLED = /\/\.claude\/plugins\/[^\s"']*\/skills\/poteto-mode\/playbooks\/([\w.-]+)\.md\b/;

let input;
try {
  input = JSON.parse(readFileSync(0, 'utf8'));
} catch {
  process.exit(0);
}
const { tool_name: tool, tool_input: args = {} } = input;
const target = tool === 'Read' ? args.file_path : tool === 'Bash' ? args.command : null;
const m = typeof target === 'string' ? BUNDLED.exec(target) : null;
if (!m || (tool === 'Bash' && /\b(?:jstack-cli|(?:playbook|jstack)\.mjs|playbook\s+(?:show|compute|list|locate))\b/.test(target))) process.exit(0);
process.stderr.write(
  `Read the ${m[1]} playbook through jawsome-playbooks instead: run \`playbook show ${m[1]}\`. ` +
    "The bundled file holds only pstack's steps, so reading it skips the operator's team and personal edits.\n",
);
process.exit(2);
