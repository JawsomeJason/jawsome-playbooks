#!/usr/bin/env node
// Blocks reading an installed pstack playbook file directly. That file holds only pstack's
// steps, so an agent that reads it skips every layer; `jstack-cli playbook compute` applies them.
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
if (!m || (tool === 'Bash' && /\bjstack(?:-cli|\.mjs)\b/.test(target))) process.exit(0);
process.stderr.write(
  `Read the ${m[1]} playbook through jstack instead: run \`jstack-cli playbook compute ${m[1]}\`. ` +
    "The bundled file holds only pstack's steps, so reading it skips the operator's layers.\n",
);
process.exit(2);
