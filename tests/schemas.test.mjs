import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { world } from './helpers.mjs';

const schema = (name) => JSON.parse(readFileSync(new URL(`../skills/playbook/references/schemas/playbook.${name}.schema.json`, import.meta.url), 'utf8'));

/** The JSON Schema keywords the schemas use, enough to fail on a key, a type or a value the schema does not allow. */
function errors(value, node, root, path = '$') {
  if (node.$ref) return errors(value, node.$ref.split('/').slice(1).reduce((n, k) => n[k], root), root, path);
  if (node.oneOf) return node.oneOf.some((n) => errors(value, n, root, path).length === 0) ? [] : [`${path}: matches no oneOf branch`];
  const out = [];
  const types = [node.type ?? []].flat();
  const typeOf = (v) => (v === null ? 'null' : Array.isArray(v) ? 'array' : Number.isInteger(v) ? 'integer' : typeof v);
  if (types.length && !types.some((t) => t === typeOf(value) || (t === 'number' && typeof value === 'number'))) return [`${path}: ${typeOf(value)} is not ${types.join('|')}`];
  if ('const' in node && value !== node.const) out.push(`${path}: not ${node.const}`);
  if (node.enum && !node.enum.includes(value)) out.push(`${path}: ${value} is not one of ${node.enum.join(', ')}`);
  if (typeOf(value) === 'object') {
    for (const key of node.required ?? []) if (!(key in value)) out.push(`${path}: missing ${key}`);
    for (const [key, v] of Object.entries(value)) {
      if (node.properties?.[key]) out.push(...errors(v, node.properties[key], root, `${path}.${key}`));
      else if (node.additionalProperties === false) out.push(`${path}: unexpected ${key}`);
    }
  }
  if (typeOf(value) === 'array' && node.items) value.forEach((v, i) => out.push(...errors(v, node.items, root, `${path}[${i}]`)));
  return out;
}

const valid = (name, value) => assert.deepEqual(errors(value, schema(name), schema(name)), [], name);

test('show, list, locate and check --json match their schemas', () => {
  const w = world({ files: { 'playbooks/landing.md': '---\nwhen: landing\n---\n\n1. Then hand it to babysit-tester.\n' } });
  const json = (args, opts) => JSON.parse(w.run([...args, '--json'], opts).stdout);
  valid('compute', json(['playbook', 'show', 'babysit']));
  valid('compute', json(['playbook', 'show', 'landing']));
  valid('list', json(['playbook', 'list']));
  valid('locate', json(['playbook', 'locate', 'babysit', 'Work the merge frontier']));
  valid('locate', json(['playbook', 'locate', 'babysit', 'the trunk ruleset']));
  valid('check', json(['check']));
  valid('check', json(['check'], { cwd: w.outside }));
});

test('the schemas reject an output that carries a layer name or a key they do not list', () => {
  const out = JSON.parse(world().run(['playbook', 'show', 'babysit', '--json']).stdout);
  assert.notDeepEqual(errors({ ...out, steps: [{ ...out.steps[0], kind: 'org.standard' }] }, schema('compute'), schema('compute')), []);
  assert.notDeepEqual(errors({ ...out, layers: [] }, schema('compute'), schema('compute')), []);
});
