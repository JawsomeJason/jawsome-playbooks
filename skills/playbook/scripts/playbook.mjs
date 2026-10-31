#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { accessSync, appendFileSync, constants, existsSync, lstatSync, mkdirSync, readdirSync, readFileSync, readlinkSync, readSync, realpathSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { basename, delimiter, dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const WRITE_USAGE = `extend <parent> [<file-name>] after|before|replace|in "<quote>" (--with <text|-> | --with-file <path>) [--when <sentence>] [--scope everywhere|org|repo] [--repo <repo>] [--pstack <dir-or-version>]`;
const NEW_USAGE = 'new <name> --when <sentence> --from-file <path|-> [--scope everywhere|org|repo] [--repo <repo>] [--pstack <dir-or-version>]';
const USAGE = `usage: playbook list [--repo <repo>] [--json] [--pstack <dir-or-version>]
       playbook show <name> [--repo <repo>] [--json] [--pstack <dir-or-version>]
       playbook locate <name> <quote> [--repo <repo>] [--json] [--pstack <dir-or-version>]
       playbook ${WRITE_USAGE}
       playbook ${NEW_USAGE}
       playbook check [--repo <repo> | --every-repo] [--json] [--pstack <dir-or-version>]
       playbook doctor [--fix | --json]
       (compute is an alias of show)`;

class UsageError extends Error {
  constructor(message, { usage = false } = {}) {
    super(usage ? `${message ? `${message}\n` : ''}${USAGE}` : message);
  }
}

// User files sit in playbooks/ (active everywhere) or a scope folder under it. A folder says where a file is active, never its order.
const USER_DIR = 'playbooks';
const SCOPES = {
  everywhere: { dir: (c) => join(c.configDir, USER_DIR) },
  org: { dir: (c) => c.repo.org && join(c.configDir, USER_DIR, 'orgs', c.repo.org) },
  repo: { dir: (c) => c.repo.name && join(c.configDir, USER_DIR, 'repos', c.repo.name) },
};
// The numbered layout ordered layers by folder; extends orders files now, so these folders only mislead.
const RETIRED_DIRS = ['01-user', '02-orgs', '03-repos', 'user', 'orgs', 'repos'];
const TEAM_DIR = join('.agents', 'playbooks');

const CHANGE = /^\s*(?:[-*]|\d+\.)\s+\*\*(After|Before|Replace|In)\*\*\s+"([^"]+)"[ \t]*(.*)$/;
const CHANGE_VERB = /^\s*(?:[-*]|\d+\.)\s+\*\*(?:After|Before|Replace|In)\*\*/;
const LIST_ITEM = /^\s*(?:[-*]|\d+\.)\s+(.*)$/;
const NUMBERED_STEP = /^\d+\.\s(.*)$/;
const HEADING = /^#{1,6}\s+(.+)$/;

const FAILURES = {
  ambiguous: { rank: 5, message: (quote, f) => `quote matches steps ${andList(f.steps)}; make it longer` },
  teamOnly: { rank: 4, message: () => 'team files may quote pstack only' },
  unseen: { rank: 3, message: (quote, f) => `quote not found in what its parents leave: "${quote}"; ${f.writer} wrote it, so add ${f.writer} to extends` },
  outside: { rank: 2, message: () => 'quote is outside a numbered step' },
  missing: { rank: 1, message: (quote) => `quote not found: "${quote}"` },
};
const failure = (found, quote) => FAILURES[found.fail].message(quote, found);

const isBlank = (line) => line.trim() === '';
const andList = (items) => (items.length < 2 ? String(items[0]) : `${items.slice(0, -1).join(', ')} and ${items.at(-1)}`);
const quoteRegex = (quote) => new RegExp(quote.trim().split(/\s+/).map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('\\s+'));
const normalize = (text) => text.replace(/^\uFEFF/, '').replaceAll('\r\n', '\n');

/** Splits playbook text into its first heading, intro and step texts: numbered steps, else bold-lead paragraphs. */
function parsePlaybook(text) {
  const lines = normalize(text).split('\n');
  const title = lines.map((l) => HEADING.exec(l)?.[1]).find(Boolean) ?? null;
  return { title, ...(lines.some((l) => NUMBERED_STEP.test(l)) ? numberedSteps(lines) : boldLeadSteps(lines)) };
}

function numberedSteps(lines) {
  const intro = [];
  const steps = [];
  let step = null;
  lines.forEach((line, i) => {
    const m = NUMBERED_STEP.exec(line);
    if (m) {
      step = [m[1]];
      steps.push(step);
    } else if (step && (isBlank(line) || /^\s/.test(line) || !isBlank(lines[i - 1]))) {
      step.push(line);
    } else {
      step = null;
      intro.push(line);
    }
  });
  return { intro: intro.join('\n'), steps: steps.map((s) => s.join('\n').trimEnd()) };
}

function boldLeadSteps(lines) {
  const intro = [];
  const steps = [];
  let para = [];
  const flush = () => {
    if (para.length && /^\*\*.+?\*\*/.test(para[0])) steps.push(para.join('\n'));
    else intro.push(...para);
    para = [];
  };
  for (const line of lines) {
    if (isBlank(line)) flush();
    else para.push(line);
  }
  flush();
  return { intro: intro.join('\n'), steps };
}

/** Frontmatter, edit lines, notes, and the body with edit lines removed, all carrying 1-based line numbers. */
function parseLayerText(raw) {
  const lines = normalize(raw).split('\n');
  const front = {};
  let start = 0;
  let hasFront = false;
  if (lines[0] === '---') {
    const end = lines.indexOf('---', 1);
    if (end > 0) {
      hasFront = true;
      start = end + 1;
      for (let i = 1; i < end; i++) {
        const m = /^([\w-]+):[ \t]*(.*)$/.exec(lines[i]);
        if (m) front[m[1]] = { value: m[2].trim(), line: i + 1 };
      }
    }
  }
  const edits = [];
  const prose = [];
  const notes = [];
  const malformed = [];
  const body = [];
  let open = null;
  for (let i = start; i < lines.length; i++) {
    const line = lines[i];
    const change = CHANGE.exec(line);
    if (change) {
      open = { verb: change[1], quote: change[2], text: change[3].trim(), line: i + 1 };
      edits.push(open);
      prose.push({ text: open.text, line: open.line });
      continue;
    }
    if (CHANGE_VERB.test(line)) {
      malformed.push(i + 1);
      open = null;
      continue;
    }
    body.push(line);
    prose.push({ text: line, line: i + 1 });
    if (isBlank(line) || /^#{1,6}\s/.test(line)) {
      open = null;
      continue;
    }
    const item = LIST_ITEM.exec(line);
    if (item || !open) {
      open = { text: (item ? item[1] : line).trim(), line: i + 1 };
      notes.push(open);
    } else {
      open.text += ` ${line.trim()}`;
    }
  }
  return { front, hasFront, edits, notes, malformed, prose, body: body.join('\n') };
}

// A segment records the stem that wrote it and the stem whose Replace struck it, so each file can see only its ancestors' text.
const segment = (text, writer) => ({ text, writer, struckBy: null });
const newStep = (text, origin, kind) => ({ origin, kind, touched: [], overrides: [], afterOf: null, segments: [segment(text, origin)] });
const effective = (step) => step.segments.filter((s) => !s.struckBy).map((s) => s.text).join('');
const display = (step) => step.segments.map((s) => (s.struckBy ? `~~${s.text}~~ ` : s.text)).join('');
const tags = (step) => `[${[step.origin, ...step.touched].join(' ~ ')}]`;

/** What a file whose ancestors are `seen` reads in a step: its ancestors' segments, less what its ancestors struck. */
const seenBy = (seen) => (s) => seen.has(s.writer) && !(s.struckBy && seen.has(s.struckBy));
const viewText = (step, seen) => step.segments.filter(seenBy(seen)).map((s) => s.text).join('');

/** Splits the segments `inSpan` selects at [start, end) of their joined text, returning the pieces inside. */
function takeSpan(step, inSpan, start, end) {
  const out = [];
  const taken = [];
  let pos = 0;
  for (const seg of step.segments) {
    if (!inSpan(seg)) {
      out.push(seg);
      continue;
    }
    const a = pos;
    const b = pos + seg.text.length;
    pos = b;
    const cuts = [a, Math.max(a, Math.min(b, start)), Math.max(a, Math.min(b, end)), b];
    for (let k = 0; k < 3; k++) {
      if (cuts[k + 1] <= cuts[k]) continue;
      const piece = { ...seg, text: seg.text.slice(cuts[k] - a, cuts[k + 1] - a) };
      out.push(piece);
      if (k === 1) taken.push(piece);
    }
  }
  step.segments = out;
  return taken;
}

/** Strikes the quoted span as `seen` reads it and inserts the change after it. Words a sibling already struck are a clash. */
function replaceSpan(step, edit, stem, seen) {
  const m = quoteRegex(edit.quote).exec(viewText(step, seen));
  const taken = takeSpan(step, seenBy(seen), m.index, m.index + m[0].length);
  const clash = taken.find((s) => s.struckBy)?.struckBy;
  for (const s of taken) s.struckBy ??= stem;
  const last = Math.max(...taken.map((s) => step.segments.indexOf(s)));
  step.segments.splice(last + 1, 0, segment(edit.text, stem));
  return clash ? { clash } : {};
}

const VERBS = {
  // A new After step lands after the steps earlier files put after the same anchor, so it reads in apply order.
  After: {
    edits: false,
    apply: (pb, step, edit, file) => {
      let at = pb.steps.indexOf(step) + 1;
      while (pb.steps[at]?.afterOf === step) at++;
      pb.steps.splice(at, 0, { ...newStep(edit.text, file.stem, file.kind), afterOf: step });
      return {};
    },
  },
  Before: { edits: false, apply: (pb, step, edit, file) => (pb.steps.splice(pb.steps.indexOf(step), 0, newStep(edit.text, file.stem, file.kind)), {}) },
  In: { edits: true, apply: (pb, step, edit, file) => (step.segments.push(segment(` ${edit.text}`, file.stem)), {}) },
  Replace: { edits: true, apply: (pb, step, edit, file, seen) => replaceSpan(step, edit, file.stem, seen) },
};

const makePlaybook = (name, kind, parsed) => ({ name, kind, title: parsed.title, intro: parsed.intro, steps: parsed.steps.map((t) => newStep(t, name, kind)), notes: [], family: [] });

/** The one step a quote names in what `seen` wrote, or the reason it names none. Team files see only bundled text. */
function locate(pb, quote, seen, team) {
  const re = quoteRegex(quote);
  const hits = pb.steps.flatMap((s, i) => (seen.has(s.origin) && re.test(viewText(s, seen)) ? [i + 1] : []));
  if (hits.length === 1) return { step: pb.steps[hits[0] - 1] };
  if (hits.length > 1) return { fail: 'ambiguous', steps: hits };
  const elsewhere = pb.steps.find((s) => re.test(effective(s)));
  if (elsewhere) return team ? { fail: 'teamOnly' } : { fail: 'unseen', writer: writersOf(elsewhere, re)[0] };
  if (re.test(pb.intro)) return { fail: 'outside' };
  return { fail: 'missing' };
}

/** The stems that wrote the unstruck words `re` matches in a step, in step order. */
function writersOf(step, re) {
  const live = step.segments.filter((s) => !s.struckBy);
  const m = re.exec(live.map((s) => s.text).join(''));
  if (!m) return [];
  const out = [];
  let pos = 0;
  for (const s of live) {
    const [a, b] = [pos, pos + s.text.length];
    pos = b;
    if (b > m.index && a < m.index + m[0].length && s.text.trim() && !out.includes(s.writer)) out.push(s.writer);
  }
  return out;
}

/**
 * Builds the extends graph over the active files: roots (bundled playbooks and standalones) and patches. A patch is
 * active when a parent is; one in a cycle, with no parent, or whose parents exist only in other contexts is not.
 */
function buildGraph(bundled, files, universe, pstackName) {
  const nodes = new Map([...bundled.keys()].map((stem) => [stem, { stem, kind: 'pstack', file: null, parents: [] }]));
  const byStem = new Map(files.map((f) => [f.stem, f]));
  for (const file of files) {
    if (bundled.has(file.stem)) continue;
    if (file.extends.length === 0) {
      nodes.set(file.stem, { stem: file.stem, kind: file.kind, file, parents: [] });
      for (const edit of file.edits) file.problems.push({ line: edit.line, message: 'standalone playbook cannot carry edits' });
    }
  }
  for (const file of files) {
    for (const cycle of cycleFrom(file, byStem)) file.problems.push({ line: file.extendsLine, message: `extends a cycle: ${cycle.join(' -> ')}` });
  }
  const pending = files.filter((f) => f.extends.length > 0 && !bundled.has(f.stem) && !f.problems.some((p) => p.message.startsWith('extends a cycle')));
  for (const file of pending) {
    if (file.kind !== 'team') continue;
    for (const stem of file.extends.filter((s) => !bundled.has(s))) {
      file.problems.push({ line: file.extendsLine, message: `team files extend only bundled playbooks, and pstack ${pstackName} bundles no ${stem}` });
      file.unresolved = true;
    }
  }
  const valid = (file, stem) => nodes.has(stem) && (file.kind !== 'team' || bundled.has(stem));
  const teamInvalid = (file, stem) => file.kind === 'team' && !bundled.has(stem);
  // A file applies only where every parent it names exists, so a parent defined only elsewhere keeps it dormant here.
  const ready = (file) => file.extends.some((s) => valid(file, s)) && file.extends.every((s) => valid(file, s) || teamInvalid(file, s) || !universe.has(s));
  for (let grew = true; grew; ) {
    grew = false;
    for (const file of pending) {
      if (nodes.has(file.stem) || !ready(file)) continue;
      nodes.set(file.stem, { stem: file.stem, kind: file.kind, file, parents: [] });
      grew = true;
    }
  }
  const dormant = [];
  for (const file of pending) {
    const node = nodes.get(file.stem);
    if (node) node.parents = file.extends.filter((s) => valid(file, s));
    for (const stem of file.extends) {
      if (valid(file, stem) || teamInvalid(file, stem)) continue;
      const where = universe.get(stem);
      if (pending.some((f) => f.stem === stem)) file.info.push({ line: file.extendsLine, message: `extends ${stem}, which is dormant here, so this file is too` });
      else if (where) file.info.push({ line: file.extendsLine, message: `extends ${stem}, which only ${where.where} defines, so this file is dormant here` });
      else {
        file.problems.push({ line: file.extendsLine, message: `extends ${stem}, which no playbook defines` });
        file.unresolved = true;
      }
    }
    if (!node) dormant.push(file);
  }
  return { nodes, dormant };
}

/** Each cycle through `file` along user extends, as stems from `file` back to itself, at most one per parent. */
function cycleFrom(file, byStem) {
  const found = [];
  for (const first of file.extends) {
    const path = [file.stem];
    const walk = (stem, seen) => {
      if (stem === file.stem) return [...path, stem];
      const next = byStem.get(stem);
      if (!next || seen.has(stem)) return null;
      path.push(stem);
      for (const parent of next.extends) {
        const hit = walk(parent, new Set([...seen, stem]));
        if (hit) return hit;
      }
      path.pop();
      return null;
    };
    const hit = walk(first, new Set());
    if (hit) {
      found.push(hit);
      break;
    }
  }
  return found;
}

/** Every stem `stem` reaches through active parents, itself excluded. */
function ancestorsOf(nodes, stem, memo = new Map()) {
  if (memo.has(stem)) return memo.get(stem);
  const out = new Set();
  memo.set(stem, out);
  for (const parent of nodes.get(stem)?.parents ?? []) {
    out.add(parent);
    for (const a of ancestorsOf(nodes, parent, memo)) out.add(a);
  }
  return out;
}

const KIND_RANK = { pstack: 0, team: 1, user: 2 };
const byApplyOrder = (a, b) => KIND_RANK[a.kind] - KIND_RANK[b.kind] || (a.stem < b.stem ? -1 : a.stem > b.stem ? 1 : 0);

/** A root's family in apply order: a topological sort that breaks ties team before user, then by stem. */
function familyOrder(nodes, root, ancestors) {
  const members = [...nodes.values()].filter((n) => n.stem === root || ancestors(n.stem).has(root));
  const inFamily = new Set(members.map((n) => n.stem));
  const waiting = new Map(members.map((n) => [n.stem, n.parents.filter((p) => inFamily.has(p)).length]));
  const order = [];
  for (let ready = members.filter((n) => waiting.get(n.stem) === 0); ready.length; ) {
    ready.sort(byApplyOrder);
    const next = ready.shift();
    order.push(next);
    for (const n of members) {
      if (!n.parents.includes(next.stem)) continue;
      waiting.set(n.stem, waiting.get(n.stem) - 1);
      if (waiting.get(n.stem) === 0) ready.push(n);
    }
  }
  return order;
}

/**
 * Applies every active family. Each file sees only what its ancestors wrote, so the result does not depend on the
 * order siblings are read in. An edit fails only when it lands in none of its families.
 */
function applyFamilies(bundled, graph) {
  const { nodes } = graph;
  const memo = new Map();
  const ancestors = (stem) => ancestorsOf(nodes, stem, memo);
  const playbooks = new Map();
  const roots = new Map();
  const outcomes = new Map();
  for (const node of nodes.values()) {
    if (node.parents.length || (node.file && node.file.extends.length)) continue;
    const parsed = node.file ? parsePlaybook(node.file.body) : bundled.get(node.stem);
    const pb = makePlaybook(node.stem, node.kind, parsed);
    playbooks.set(node.stem, pb);
    for (const member of familyOrder(nodes, node.stem, ancestors)) {
      pb.family.push({ stem: member.stem, kind: member.kind });
      roots.set(member.stem, [...(roots.get(member.stem) ?? []), node.stem]);
      if (member.stem === node.stem) continue;
      const file = member.file;
      const seen = new Set([...ancestors(file.stem)]);
      if (!outcomes.has(file)) outcomes.set(file, file.edits.map(() => ({ applied: false, fails: [], clash: null, step: null })));
      file.edits.forEach((edit, i) => {
        const found = locate(pb, edit.quote, seen, file.kind === 'team');
        const outcome = outcomes.get(file)[i];
        if (!found.step) return outcome.fails.push(found);
        const verb = VERBS[edit.verb];
        const step = found.step;
        const result = verb.apply(pb, step, edit, file, seen);
        outcome.applied = true;
        if (result.clash) outcome.clash = { other: result.clash, pb, step };
        if (!verb.edits || step.origin === file.stem) return;
        const after = step.touched.filter((s) => s !== file.stem);
        step.overrides.push({ file: file.stem, verb: edit.verb, quote: edit.quote, origin: step.origin, ...(after.length ? { after } : {}) });
        if (!step.touched.includes(file.stem)) step.touched.push(file.stem);
      });
      for (const note of file.notes) pb.notes.push({ text: note.text, file: file.stem });
    }
  }
  for (const [file, list] of outcomes) {
    file.edits.forEach((edit, i) => {
      const { applied, fails, clash } = list[i];
      if (clash) file.problems.push({ line: edit.line, message: `replaces words that ${clash.other} also replaces in ${clash.pb.name} step ${clash.pb.steps.indexOf(clash.step) + 1}; make one file extend the other` });
      if (applied || fails.length === 0) return;
      const worst = fails.reduce((a, b) => (FAILURES[b.fail].rank > FAILURES[a.fail].rank ? b : a));
      file.problems.push({ line: edit.line, message: failure(worst, edit.quote) });
    });
  }
  return { playbooks, roots, ancestors };
}

const kebab = (title) => title.toLowerCase().replace(/[^a-z0-9\s-]/g, '').trim().replace(/\s+/g, '-');

/**
 * Resolves a written name to a playbook stem by stem or by title, the way poteto-mode turns a title into a file name.
 * `ignored` names a poteto-mode section or skill, which a bold word after "per" often means instead.
 */
function playbookIndex(pstackDir, playbooks, roots) {
  const stems = new Map();
  for (const pb of playbooks.values()) {
    stems.set(pb.name, pb.name);
    if (pb.title) stems.set(kebab(pb.title), pb.name);
  }
  for (const stem of roots.keys()) stems.set(stem, stem);
  const skillsDir = join(pstackDir, 'skills');
  const skills = new Set(listDir(skillsDir));
  const guide = join(skillsDir, 'poteto-mode', 'SKILL.md');
  const headings = isFile(guide) ? normalize(readFileSync(guide, 'utf8')).split('\n').map((l) => HEADING.exec(l)?.[1]) : [];
  const sections = new Set(headings.filter(Boolean).map(kebab));
  return {
    resolve: (name) => stems.get(kebab(name)) ?? null,
    names: [...stems.keys()],
    root: (stem) => roots.get(stem)?.[0] ?? null,
    ignored: (name) => [kebab(name), `principle-${kebab(name)}`].some((k) => sections.has(k) || skills.has(k)),
  };
}

const HANDOFF_PATH = /playbooks\/([a-z0-9-]+)\.md/g;
const HANDOFF_VERB = /\b(?:(run|per)\s+|(?:route[sd]?|routing|hand(?:s|ed|ing)?)\b[^.!?\n]{0,60}?\bto\s+)/gi;
const HANDOFF_ITEM = /^(?:\*\*([^*]+)\*\*|([a-z0-9]+(?:-[a-z0-9]+)+)(?![\w-])|([A-Z][\w'&-]*(?:[ \t]+[\w'&-]+){0,6}))/;
const HANDOFF_JOIN = /^(?:,\s*(?:and\s+|or\s+)?|\s+(?:and|or)\s+)/;
// A kebab word that ends its clause names a thing; one followed by a noun ("run read-only checks") modifies it.
const CLAUSE_END = /^(?:$|[.,;:!?)]|\s+(?:and|or|for|to|on|with|when|once|after|before|then|first|again|if|in|per|as)\b)/;

/** The one handoff `rest` starts with: { length, ref }, where ref is null when the words name no playbook. */
function handoffItem(rest, index, toward) {
  const m = HANDOFF_ITEM.exec(rest);
  if (!m) return null;
  const [whole, bold, slug, plain] = m;
  const ref = (name, looks) => {
    const stem = index.resolve(name);
    return stem || looks ? { name, stem } : null;
  };
  if (bold) return { length: whole.length, ref: ref(bold, !index.ignored(bold)) };
  if (slug) return { length: whole.length, ref: ref(slug, !index.ignored(slug) && CLAUSE_END.test(rest.slice(whole.length))) };
  const words = [...plain.matchAll(/[\w'&-]+/g)];
  for (let k = words.length; k > 0; k--) {
    const end = words[k - 1].index + words[k - 1][0].length;
    if (index.resolve(plain.slice(0, end))) return { length: end, ref: ref(plain.slice(0, end), true) };
  }
  // A capitalized word after "route ... to" or "hand ... to" is a playbook title; after "run" or "per" it is often not ("per PR").
  const first = words[0][0];
  return { length: first.length, ref: ref(first, toward && /^[A-Z][a-z]/.test(first) && !index.ignored(first)) };
}

/** Every playbook reference in text, in order: { name, stem }, where stem is null when nothing defines it. */
function handoffRefs(text, index) {
  const found = [...text.matchAll(HANDOFF_PATH)].map((m) => ({ at: m.index, name: m[1], stem: index.resolve(m[1]) }));
  for (const m of text.matchAll(HANDOFF_VERB)) {
    let at = m.index + m[0].length;
    for (;;) {
      const item = handoffItem(text.slice(at), index, !m[1]);
      if (!item?.ref) break;
      found.push({ at, ...item.ref });
      at += item.length;
      const join = HANDOFF_JOIN.exec(text.slice(at));
      if (!join) break;
      at += join[0].length;
    }
  }
  return found.sort((a, b) => a.at - b.at);
}

const escapeRegex = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const nameAlternatives = (index) => [...index.names].sort((a, b) => b.length - a.length).map((name) => escapeRegex(name).replaceAll('-', '[ -]')).join('|');

/** A known playbook named after a run-like word that handoffRefs did not register. It is often plain prose ("one PR per feature"), so it only informs. */
function nearMisses(text, index) {
  if (index.names.length === 0) return [];
  const registered = handoffRefs(text, index);
  const re = new RegExp(`\\b(?:runs?|running|ran|per)\\s+(?:\\*\\*|\`)?(${nameAlternatives(index)})(?![\\w-])`, 'gi');
  return [...text.matchAll(re)]
    .filter((m) => !registered.some((r) => r.at >= m.index && r.at <= m.index + m[0].length))
    .map((m) => ({ phrase: m[0].replace(/\*\*|`/g, ''), stem: index.resolve(m[1]) }));
}

/** Each `<playbook> step N`, `steps N, M` or `steps N-M` that names a step the merged playbook lacks. */
function badStepRefs(text, index, playbooks) {
  // A step number counts against the family's computed steps, whichever member the text names.
  if (index.names.length === 0) return [];
  const re = new RegExp(`(?<![\\w-])(${nameAlternatives(index)})(?:\\.md)?(?:\\*\\*|\`)?\\s+steps?\\s+(\\d+(?:(?:\\s*(?:,|and|or|to|&)\\s*|[-–])\\d+)*)(?![\\w-])`, 'gi');
  return [...text.matchAll(re)].flatMap((m) => {
    const stem = index.resolve(m[1]);
    const count = playbooks.get(index.root(stem))?.steps.length;
    if (count === undefined) return [];
    return m[2].match(/\d+/g).map(Number).filter((n) => n < 1 || n > count).map((n) => ({ stem, n, count }));
  });
}

/** Each other family the steps, then the notes, hand off to, named by its root, in order of first mention. */
function handoffs(pb, index) {
  const found = new Map();
  const mention = (text, step) => {
    for (const ref of handoffRefs(text, index)) {
      const stem = ref.stem && index.root(ref.stem);
      if (!stem || stem === pb.name) continue;
      if (!found.has(stem)) found.set(stem, { playbook: stem, steps: [], inNotes: false });
      const entry = found.get(stem);
      if (!step) entry.inNotes = true;
      else if (!entry.steps.includes(step)) entry.steps.push(step);
    }
  };
  pb.steps.forEach((s, i) => mention(effective(s), i + 1));
  for (const note of pb.notes) mention(note.text, null);
  return [...found.values()];
}

function computed(pb, index) {
  return {
    family: pb.family,
    steps: pb.steps.map((s) => ({ text: effective(s), origin: s.origin, kind: s.kind, touched: s.touched, display: display(s), tags: tags(s) })),
    handoffs: handoffs(pb, index),
    notes: pb.notes,
    overrides: pb.steps.flatMap((s, i) => s.overrides.map((o) => ({ step: i + 1, ...o }))),
  };
}

const lexists = (path) => lstatSync(path, { throwIfNoEntry: false }) !== undefined;
const isDir = (path) => statSync(path, { throwIfNoEntry: false })?.isDirectory() ?? false;
const isFile = (path) => statSync(path, { throwIfNoEntry: false })?.isFile() ?? false;
const listDir = (dir) => {
  try {
    return readdirSync(dir).sort();
  } catch {
    return [];
  }
};
const mdFiles = (dir) => (dir ? listDir(dir).filter((f) => f.endsWith('.md') && isFile(join(dir, f))) : []);

function readSettings(configDir) {
  const path = join(configDir, 'config.json');
  if (!isFile(path)) {
    if (isFile(join(configDir, 'layers.json'))) throw new UsageError(`${join(configDir, 'layers.json')}: rename it to config.json`);
    return null;
  }
  let raw;
  try {
    raw = JSON.parse(readFileSync(path, 'utf8'));
  } catch (e) {
    throw new UsageError(`${path}: ${e.message}`);
  }
  const bad = (what) => new UsageError(`${path}: ${what}`);
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw bad('must be a JSON object');
  if (raw.pstack !== undefined && typeof raw.pstack !== 'string') throw bad('"pstack" must be a string');
  if (raw.telemetry !== undefined && typeof raw.telemetry !== 'boolean') throw bad('"telemetry" must be true or false');
  const orgs = raw.orgs ?? {};
  if (typeof orgs !== 'object' || Array.isArray(orgs)) throw bad('"orgs" must be an object');
  for (const [org, entry] of Object.entries(orgs)) {
    if (!Array.isArray(entry?.owners) || !entry.owners.every((o) => typeof o === 'string')) throw bad(`orgs.${org}.owners must be an array of strings`);
  }
  const repos = raw.repos ?? {};
  if (typeof repos !== 'object' || Array.isArray(repos)) throw bad('"repos" must be an object');
  for (const [repo, entry] of Object.entries(repos)) {
    if (entry?.checkout !== undefined && typeof entry.checkout !== 'string') throw bad(`repos.${repo}.checkout must be a path`);
  }
  return { path, raw, pstack: raw.pstack ?? null, telemetry: raw.telemetry ?? false, orgs, repos };
}

const gitOut = (cwd, args) => {
  const r = spawnSync('git', args, { cwd, encoding: 'utf8' });
  return r.status === 0 ? r.stdout.trim() : null;
};

/** Parses scp-style, https and ssh:// remotes into owner/name. */
function parseRemote(url) {
  const scp = /^[^/:@]+@[^/:]+:(.+)$/.exec(url);
  let path = scp?.[1];
  if (!path) {
    try {
      path = new URL(url).pathname;
    } catch {
      path = url;
    }
  }
  const parts = path.replace(/\/+$/, '').replace(/\.git$/, '').split('/').filter(Boolean);
  if (parts.length === 0) return null;
  return { name: parts.at(-1), owner: parts.length > 1 ? parts.at(-2) : null };
}

function findCheckout(cwd) {
  const common = gitOut(cwd, ['rev-parse', '--path-format=absolute', '--git-common-dir']);
  if (!common) return null;
  const root = basename(common) === '.git' ? dirname(common) : gitOut(cwd, ['rev-parse', '--show-toplevel']);
  if (!root) return null;
  const url = gitOut(root, ['remote', 'get-url', 'origin']);
  const remote = url ? parseRemote(url) : null;
  return { root, name: remote?.name ?? basename(root), owner: remote?.owner ?? null };
}

/**
 * The repo of the current checkout, or of `--repo`. A `--repo` outside its checkout reads the checkout config.json
 * records, so its team files and org come out the same from any directory.
 */
function resolveRepo(opts, configDir, settings, checkout = findCheckout(process.cwd())) {
  let found = checkout && (!opts.repo || opts.repo === checkout.name) ? checkout : null;
  const recorded = opts.repo && !found ? settings?.repos?.[opts.repo]?.checkout : null;
  if (recorded && isDir(recorded)) found = findCheckout(recorded);
  const name = opts.repo ?? found?.name ?? null;
  const owner = found?.owner ?? null;
  const root = found?.root ?? null;
  const agentsDir = root && lexists(join(root, TEAM_DIR)) ? join(root, TEAM_DIR) : null;
  const org = owner ? (Object.entries(settings?.orgs ?? {}).find(([, o]) => o.owners.includes(owner))?.[0] ?? null) : null;
  return { name, owner, org, root, agentsDir, teamDisplay: (file) => `.agents/playbooks/${file}` };
}

const PLAYBOOKS = join('skills', 'poteto-mode', 'playbooks');
const semver = (v) => v.split(/[.-]/).map((p) => Number.parseInt(p, 10) || 0);
const bySemverDesc = (a, b) => {
  const [x, y] = [semver(a.version), semver(b.version)];
  for (let i = 0; i < Math.max(x.length, y.length); i++) if ((x[i] ?? 0) !== (y[i] ?? 0)) return (y[i] ?? 0) - (x[i] ?? 0);
  return 0;
};

const SEMVER = /^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/;
const MANIFESTS = ['.claude-plugin/plugin.json', '.codex-plugin/plugin.json', '.muse-plugin/plugin.json', 'package.json'];

const readJson = (path) => {
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    return null;
  }
};

/**
 * A pstack's version comes from a manifest at the plugin root, else from a folder named like a version, as plugin
 * caches name them. With neither, `version` is null, so nothing records it, and `name` falls back to the path.
 */
function pstackAt(path) {
  const dir = resolve(path);
  const declared = MANIFESTS.map((m) => readJson(join(dir, m))?.version).find((v) => typeof v === 'string' && SEMVER.test(v));
  const version = declared ?? (SEMVER.test(basename(dir)) ? basename(dir) : null);
  return { dir, version, name: version ?? dir };
}

const pluginDirs = () => {
  const home = homedir();
  return listDir(home).filter((e) => e.startsWith('.')).map((dot) => join(home, dot, 'plugins'));
};

/**
 * The pstack a harness loads, per the install record next to its plugin cache. The cache keeps old versions
 * after an upgrade, so the newest cached one is not always the one running.
 */
function installedPstack() {
  const found = [];
  for (const plugins of pluginDirs()) {
    const record = readJson(join(plugins, 'installed_plugins.json'));
    for (const [key, installs] of Object.entries(record?.plugins ?? {})) {
      if (!key.startsWith('pstack@') || !Array.isArray(installs)) continue;
      for (const { installPath, projectPath } of installs) {
        if (typeof installPath === 'string' && !projectPath && isDir(join(installPath, PLAYBOOKS))) found.push(pstackAt(installPath));
      }
    }
  }
  return found.sort(bySemverDesc)[0] ?? null;
}

/** Every pstack under a dot-directory plugin cache in the home dir, highest version first. */
function discoverPstacks() {
  const found = [];
  for (const plugins of pluginDirs()) {
    const cache = join(plugins, 'cache');
    for (const market of listDir(cache)) {
      const base = join(cache, market, 'pstack');
      for (const version of listDir(base).filter((v) => /^\d+\.\d+/.test(v))) {
        if (isDir(join(base, version, PLAYBOOKS))) found.push({ dir: join(base, version), version, name: version });
      }
    }
  }
  return found.sort(bySemverDesc);
}

function resolvePstack(flag) {
  const envDir = envVar('PSTACK_DIR');
  const base = envDir ? pstackAt(envDir) : (installedPstack() ?? discoverPstacks()[0] ?? null);
  let pick = base;
  if (flag) {
    const sibling = base && join(dirname(base.dir), flag);
    if (existsSync(flag)) pick = pstackAt(flag);
    else if (sibling && existsSync(sibling)) pick = pstackAt(sibling);
    else pick = discoverPstacks().find((p) => p.version === flag) ?? null;
    if (!pick) throw new UsageError(`no pstack ${flag} found`);
  }
  if (!pick) throw new UsageError('no pstack found; set PLAYBOOKS_PSTACK_DIR to a pstack install (the folder holding skills/poteto-mode)');
  if (!isDir(join(pick.dir, PLAYBOOKS))) throw new UsageError(`${pick.dir} has no ${PLAYBOOKS}; set PLAYBOOKS_PSTACK_DIR to a pstack install`);
  return pick;
}

const envVar = (name) => process.env[`PLAYBOOKS_${name}`];

const configDirPath = () => {
  const env = envVar('CONFIG');
  return env ? resolve(env) : join(homedir(), '.jawsome-playbooks');
};
const usageLogPath = () => {
  const state = process.env.XDG_STATE_HOME || join(homedir(), '.local', 'state');
  return join(envVar('STATE') || join(state, 'jawsome-playbooks'), 'usage.jsonl');
};

/** With `telemetry` on, one JSON line per computed playbook. A failed write never fails the compute. */
function logRead(ctx, name) {
  if (!ctx.settings?.telemetry) return;
  const path = usageLogPath();
  const line = { ts: new Date().toISOString(), playbook: name, repo: ctx.repo.name, org: ctx.repo.org, pstack: ctx.pstack.version };
  try {
    mkdirSync(dirname(path), { recursive: true });
    appendFileSync(path, `${JSON.stringify(line)}\n`);
  } catch {}
}

function loadContext(opts) {
  const configDir = configDirPath();
  const settings = readSettings(configDir);
  const configProblems = [];
  if (settings?.raw.layers !== undefined) {
    configProblems.push({ path: settings.path, line: 1, message: '"layers" is retired: extends sets the order, so delete the key' });
  }
  for (const old of RETIRED_DIRS.filter((d) => isDir(join(configDir, d)))) {
    configProblems.push({
      path: join(configDir, old),
      line: 1,
      message: 'numbered layer folders are retired; move each file into playbooks/ (playbooks/orgs/<org>/ or playbooks/repos/<repo>/ to limit where it applies) under a unique name, as playbooks.md describes',
    });
  }
  const pstack = resolvePstack(opts.pstack);
  const repo = resolveRepo(opts, configDir, settings);
  return { configDir, settings, configProblems, pstack, repo, pinned: Boolean(opts.pstack) };
}

/** One playbook file, team or user. `scope` is where it is active: a repo's checkout, everywhere, or one org or repo. */
function readPlaybookFile(path, displayPath, kind, scope) {
  const parsed = parseLayerText(readFileSync(path, 'utf8'));
  const { front } = parsed;
  const problems = parsed.malformed.map((line) => ({ line, message: 'a change has no straight-quoted step text to anchor on' }));
  if (!front.when?.value) problems.push({ line: 1, message: 'missing when:' });
  if (front.layer) problems.push({ line: front.layer.line, message: 'layer: is retired, because extends sets the order; delete it' });
  return {
    path,
    display: displayPath,
    kind,
    scope,
    stem: basename(path, '.md'),
    extends: (front.extends?.value ?? '').split(',').map((s) => s.trim()).filter(Boolean),
    extendsLine: front.extends?.line ?? 1,
    front,
    edits: parsed.edits,
    notes: parsed.notes,
    prose: parsed.prose,
    body: parsed.body,
    problems,
    info: [],
  };
}

/** The user scope folders active in a context, as [scope label, folder]. */
const userDirs = (ctx) =>
  Object.entries(SCOPES)
    .map(([scope, s]) => [scope, s.dir(ctx)])
    .filter(([, dir]) => dir);

/** Team files from the checkout, then user files from each active scope folder. */
function collectFiles(ctx) {
  const team = mdFiles(ctx.repo.agentsDir).map((name) => readPlaybookFile(join(ctx.repo.agentsDir, name), ctx.repo.teamDisplay(name), 'team', ctx.repo.name));
  const user = userDirs(ctx).flatMap(([scope, dir]) => mdFiles(dir).map((name) => readPlaybookFile(join(dir, name), join(dir, name), 'user', scope)));
  return { team, user, all: [...team, ...user] };
}

/** Dangling symlinks in .agents/playbooks (top level) and anywhere under the config dir, each reported once. */
function brokenLinks(ctx) {
  const problems = [];
  const seen = new Set();
  const realDir = (dir) => realOr(dir) ?? dir;
  const dangling = (path) => lstatSync(path).isSymbolicLink() && !statSync(path, { throwIfNoEntry: false });
  let teamBroken = false;
  const agents = ctx.repo.agentsDir;
  if (agents) {
    if (dangling(agents)) {
      teamBroken = true;
      problems.push({ path: '.agents/playbooks', line: 1, message: `broken link -> ${readlinkSync(agents)}` });
    } else {
      for (const name of listDir(agents)) {
        const path = join(agents, name);
        seen.add(join(realDir(agents), name));
        if (!dangling(path)) continue;
        teamBroken = true;
        problems.push({ path: ctx.repo.teamDisplay(name), line: 1, message: `broken link -> ${readlinkSync(path)}` });
      }
    }
  }
  const walk = (dir) => {
    for (const name of listDir(dir)) {
      const path = join(dir, name);
      const stat = lstatSync(path);
      if (stat.isDirectory()) walk(path);
      else if (dangling(path) && !seen.has(join(realDir(dir), name))) {
        problems.push({ path, line: 1, message: `broken link -> ${readlinkSync(path)}` });
      }
    }
  };
  if (isDir(ctx.configDir)) walk(ctx.configDir);
  return { problems, teamBroken };
}

/** A .agents/playbooks that links into the config dir is the retired layout, where the team folders lived in the config. */
function linkedTeamDir(ctx) {
  const agents = ctx.repo.agentsDir;
  if (!agents || !lstatSync(agents).isSymbolicLink()) return [];
  const real = realOr(agents);
  const config = realOr(ctx.configDir);
  if (!real || !config || !real.startsWith(`${config}${sep}`)) return [];
  return [{ path: '.agents/playbooks', line: 1, message: 'links into the config dir; team playbooks are committed copies, so replace the link with them' }];
}

function runPstackCheck(ctx, teamBroken) {
  const skipped = (why) => ({ status: 'skipped', lines: [`not run: ${why}`] });
  if (!ctx.repo.agentsDir) return skipped('no .agents/playbooks');
  if (teamBroken) return skipped('broken link in .agents/playbooks');
  const script = join(ctx.pstack.dir, 'skills', 'poteto-mode', 'scripts', 'check-playbooks.mjs');
  if (!isFile(script)) return skipped(`pstack ${ctx.pstack.name} has no check-playbooks.mjs`);
  const r = spawnSync(process.execPath, [script, ctx.repo.root], { cwd: ctx.repo.root, encoding: 'utf8' });
  const lines = `${r.stdout ?? ''}\n${r.stderr ?? ''}`.split('\n').filter((l) => l.trim());
  return { status: r.status === 0 ? 'ok' : 'failed', lines };
}

/**
 * Every stem any context defines, with where: each user scope folder, and the team files of each checkout config.json
 * records. A stem defined only elsewhere makes a file dormant here instead of broken.
 */
function stemUniverse(ctx) {
  const stems = new Map();
  const add = (dir, where) => {
    for (const name of mdFiles(dir)) if (!stems.has(basename(name, '.md'))) stems.set(basename(name, '.md'), { where, path: join(dir, name) });
  };
  const base = join(ctx.configDir, USER_DIR);
  add(base, USER_DIR);
  for (const group of ['orgs', 'repos']) for (const name of listDir(join(base, group))) add(join(base, group, name), `${USER_DIR}/${group}/${name}`);
  const checkouts = [[ctx.repo.name, ctx.repo.root], ...Object.entries(ctx.settings?.repos ?? {}).map(([name, r]) => [name, r.checkout && isDir(r.checkout) ? findCheckout(r.checkout)?.root : null])];
  for (const [name, root] of checkouts) if (root) add(join(root, TEAM_DIR), name);
  return stems;
}

function readBundled(ctx) {
  const dir = join(ctx.pstack.dir, PLAYBOOKS);
  return new Map(mdFiles(dir).map((f) => [basename(f, '.md'), parsePlaybook(readFileSync(join(dir, f), 'utf8'))]));
}

/** Stems must be unique: never a bundled stem, and never one another file active here, or a file active everywhere, uses. */
function nameProblems(ctx, files, bundled, universe) {
  const handle = ctx.settings?.raw.handle;
  const hint = (stem, qualifier) => (qualifier ? `, such as ${stem}-${qualifier}.md` : '');
  const qualifier = (file) => (file.kind === 'team' ? ctx.repo.org ?? ctx.repo.name : file.scope === 'org' ? ctx.repo.org : file.scope === 'repo' ? ctx.repo.name : handle);
  const first = new Map();
  for (const file of files) {
    if (bundled.has(file.stem)) {
      file.problems.push({ line: 1, message: `${file.stem} is a bundled playbook's name; rename the file${hint(file.stem, qualifier(file))}` });
      continue;
    }
    const other = first.get(file.stem) ?? (file.scope === 'everywhere' && universe.get(file.stem)?.path !== file.path ? universe.get(file.stem) : null);
    if (other) file.problems.push({ line: 1, message: `${file.stem} is also ${other.display ?? other.path}; rename one${hint(file.stem, qualifier(file))}` });
    else first.set(file.stem, file);
  }
  const words = [ctx.repo.org, ctx.repo.name].filter(Boolean);
  for (const file of files.filter((f) => f.kind === 'team' && words.length && !words.some((w) => f.stem.split('-').includes(w)))) {
    file.info.push({ line: 1, message: `a team file name carries its scope word (${words.join(' or ')}), such as ${file.stem}-${words[0]}.md` });
  }
}

function analyze(ctx, { pstackCheck }) {
  const bundled = readBundled(ctx);
  const files = collectFiles(ctx);
  const universe = stemUniverse(ctx);
  nameProblems(ctx, files.all, bundled, universe);
  const usable = files.all.filter((f) => !f.problems.some((p) => p.line === 1 && / is (?:a bundled playbook's name|also )/.test(p.message)));
  const graph = buildGraph(bundled, usable, universe, ctx.pstack.name);
  const { playbooks, roots, ancestors } = applyFamilies(bundled, graph);
  const index = playbookIndex(ctx.pstack.dir, playbooks, roots);
  const dormant = new Set(graph.dormant.map((f) => f.stem));
  for (const file of files.all) {
    for (const { text, line } of file.prose) {
      for (const { phrase, stem } of nearMisses(text, index)) {
        file.info.push({ line, message: `"${phrase}" may name ${stem} but does not register as a handoff; if it is one, write playbooks/${stem}.md` });
      }
      for (const { stem, n, count } of badStepRefs(text, index, playbooks)) {
        file.problems.push({ line, message: `${stem} step ${n}, but ${stem} has ${count} ${count === 1 ? 'step' : 'steps'}` });
      }
      for (const ref of handoffRefs(text, index)) {
        if (ref.stem) continue;
        const stem = kebab(ref.name);
        const where = universe.get(stem);
        if (dormant.has(stem)) file.info.push({ line, message: `hands off to ${ref.name}, which is dormant here` });
        else if (where) file.info.push({ line, message: `hands off to ${ref.name}, which only ${where.where} defines` });
        else file.problems.push({ line, message: `hands off to ${ref.name}, which no playbook defines` });
      }
    }
  }
  const links = brokenLinks(ctx);
  links.problems.push(...linkedTeamDir(ctx));
  return { files, graph, playbooks, roots, ancestors, index, links, pstackCheck: pstackCheck ? runPstackCheck(ctx, links.teamBroken) : null };
}

const fileProblems = (files, key = 'problems') => files.flatMap((f) => [...f[key]].sort((a, b) => a.line - b.line).map(({ path, line, message }) => ({ path: f.display, line, message })));

const needsRecord = (ctx) => !ctx.pinned && ctx.settings && ctx.pstack.version && ctx.settings.pstack !== ctx.pstack.version;
// Swaps only the version text, so the user's own formatting of config.json survives.
function record(ctx) {
  const text = readFileSync(ctx.settings.path, 'utf8');
  const value = JSON.stringify(ctx.pstack.version);
  const swapped = text.replace(/("pstack"\s*:\s*)"[^"]*"/, (_, key) => key + value);
  writeFileSync(ctx.settings.path, swapped !== text || ctx.settings.raw.pstack === ctx.pstack.version ? swapped : `${JSON.stringify({ ...ctx.settings.raw, pstack: ctx.pstack.version }, null, 2)}\n`);
}

function checkReport(ctx, analysis) {
  const files = analysis.files.all;
  const problems = [...ctx.configProblems, ...analysis.links.problems, ...fileProblems(files)];
  const info = fileProblems(files, 'info');
  const passed = problems.length === 0 && analysis.pstackCheck.status !== 'failed';
  return { pstack: ctx.pstack.version, problems, info, pstackCheck: analysis.pstackCheck, passed };
}

const problemLine = (p) => `${p.path}:${p.line}: ${p.message}`;

function renderCheck(report, pstack) {
  const n = report.problems.length;
  return [
    ...(report.pstackCheck.status === 'skipped' ? [] : report.pstackCheck.lines),
    ...report.problems.map(problemLine),
    ...report.info.map((p) => `info: ${problemLine(p)}`),
    report.passed
      ? `check passed: pstack ${pstack}`
      : `check failed: ${n ? `${n} ${n === 1 ? 'problem' : 'problems'}` : "pstack's checker failed"} against pstack ${pstack}`,
  ].join('\n');
}

const checkJson = (report, recorded) => {
  const { passed, ...rest } = report;
  return { ...rest, recorded };
};

/** One report over every context, in check's shape. It records no version, because it reads several contexts' files. */
function everyRepoReport(ctx) {
  const reports = everyContext(ctx).map((c) => checkReport(c, analyze(c, { pstackCheck: true })));
  const once = (key) => [...new Map(reports.flatMap((r) => r[key]).map((p) => [JSON.stringify(p), p])).values()];
  const statuses = reports.map((r) => r.pstackCheck.status);
  const lines = [...new Set(reports.flatMap((r) => (r.pstackCheck.status === 'skipped' ? [] : r.pstackCheck.lines)))];
  const status = statuses.includes('failed') ? 'failed' : statuses.includes('ok') ? 'ok' : 'skipped';
  return { pstack: ctx.pstack.version, problems: once('problems'), info: once('info'), pstackCheck: { status, lines }, passed: reports.every((r) => r.passed) };
}

function runCheck(ctx, opts) {
  if (opts.everyRepo) {
    const report = everyRepoReport(ctx);
    return { out: opts.json ? checkJson(report, false) : renderCheck(report, ctx.pstack.name), status: report.passed ? 0 : 1 };
  }
  const report = checkReport(ctx, analyze(ctx, { pstackCheck: true }));
  const recorded = report.passed && needsRecord(ctx);
  if (recorded) record(ctx);
  return { out: opts.json ? checkJson(report, recorded) : renderCheck(report, ctx.pstack.name), status: report.passed ? 0 : 1 };
}

const headerParts = (ctx) => [ctx.repo.name, ctx.repo.owner ?? ctx.repo.org, `pstack ${ctx.pstack.name}`].filter(Boolean);

function renderCompute(r) {
  const sections = [`# ${r.playbook} (${r.header.join(' · ')})`];
  if (r.asked !== r.playbook) sections.push(`${r.asked} is part of the ${r.playbook} family.`);
  if (r.withheld) {
    sections.push(`No steps: a file in the ${r.playbook} family has problems, so some of its edits would be lost. Fix the files below, then run \`playbook check\` until it passes.`);
  } else {
    if (r.partial) sections.push('These steps may be incomplete: a file has an extends that names no playbook, so it edits nothing, and its edits may belong in these steps. It is listed under Problems.');
    sections.push(
      r.steps
        .map((s, i) => {
          const [first, ...rest] = s.display.split('\n');
          return [`${i + 1}. ${first}   ${s.tags}`, ...rest].join('\n');
        })
        .join('\n'),
    );
    if (r.family.length > 1) sections.push(`Family: ${r.family.map((m) => `${m.stem} (${m.kind})`).join(', ')}`);
  }
  if (r.handoffs.length) {
    const where = (h) => [...(h.steps.length ? [`${h.steps.length > 1 ? 'steps' : 'step'} ${andList(h.steps)}`] : []), ...(h.inNotes ? ['notes'] : [])].join(', ');
    sections.push(['Hands off to:', ...r.handoffs.map((h) => `- ${h.playbook} (${where(h)})`)].join('\n'));
  }
  if (r.notes.length) sections.push(['Notes:', ...r.notes.map((n) => `- ${n.text}   [${n.file}]`)].join('\n'));
  if (r.overrides.length) {
    const line = (o) => `- step ${o.step}: ${o.file} ${o.verb === 'Replace' ? 'replaced' : 'added to'} "${o.quote}" (${o.origin}${o.after ? `, after ${o.after.join(', ')}` : ''})`;
    sections.push(['Overrides:', ...r.overrides.map(line)].join('\n'));
  }
  if (r.problems.length) sections.push(['Problems:', ...r.problems.map(problemLine)].join('\n'));
  const check = r.pstackCheck;
  sections.push(['pstack check-playbooks:', ...(check.status === 'ok' ? ['ok'] : check.lines)].join('\n'));
  return sections.join('\n\n');
}

/** The root whose family `name` belongs to, by stem or title. A patch of several roots, or a dormant one, is a usage error. */
function familyOf(analysis, name) {
  const stem = analysis.index.resolve(name) ?? name;
  const roots = analysis.roots.get(stem);
  if (roots?.length === 1) return { root: roots[0], stem };
  if (roots) throw new UsageError(`${stem} edits ${andList(roots)}; show one of those`);
  const dormant = analysis.graph.dormant.find((f) => f.stem === stem);
  if (dormant) throw new UsageError(`${stem} is dormant here: it extends ${andList(dormant.extends)}, which this context does not define`);
  throw new UsageError(`no playbook named ${name}`);
}

function runCompute(ctx, opts, name) {
  const analysis = analyze(ctx, { pstackCheck: true });
  const { root, stem } = familyOf(analysis, name);
  const pb = analysis.playbooks.get(root);
  logRead(ctx, root);
  if (needsRecord(ctx)) {
    const report = checkReport(ctx, analysis);
    if (!report.passed) return { out: opts.json ? checkJson(report, false) : renderCheck(report, ctx.pstack.name), status: 1 };
    record(ctx);
  }
  const members = new Set(pb.family.map((m) => m.stem));
  const touching = analysis.files.all.filter((f) => members.has(f.stem) || (f.extends.some((s) => members.has(s)) && f.problems.length));
  const fileFound = fileProblems(touching);
  // Its edits reach no playbook, and any playbook may be the one it meant, so every show reports it.
  const unresolved = analysis.files.all.filter((f) => f.unresolved && !touching.includes(f));
  const problems = [...ctx.configProblems, ...analysis.links.problems, ...fileFound, ...fileProblems(unresolved)];
  const withheld = fileFound.length > 0;
  const empty = { family: pb.family, steps: [], notes: [], overrides: [], handoffs: [] };
  const result = { playbook: root, asked: stem, ...(withheld ? empty : computed(pb, analysis.index)), problems, pstackCheck: analysis.pstackCheck, withheld };
  const status = problems.length || analysis.pstackCheck.status === 'failed' ? 1 : 0;
  if (!opts.json) return { out: renderCompute({ ...result, partial: unresolved.length > 0, header: headerParts(ctx) }), status };
  const { repo } = ctx;
  return {
    out: {
      playbook: root,
      asked: stem,
      repo: repo.name,
      owner: repo.owner,
      org: repo.org,
      pstack: ctx.pstack.version,
      family: result.family,
      steps: result.steps.map(({ text, origin, kind, touched }) => ({ text, origin, kind, touched })),
      notes: result.notes,
      overrides: result.overrides,
      handoffs: result.handoffs,
      problems,
      pstackCheck: analysis.pstackCheck,
    },
    status,
  };
}

/**
 * Where an edit to words `writers` wrote goes. A user file's own words change in that file. Anything else gets a user
 * file that extends the writers, named <writer>-<handle>, since a file's quotes see only what its ancestors wrote.
 */
function editTarget(ctx, analysis, writers) {
  const file = analysis.files.all.find((f) => f.stem === writers[0]);
  if (writers.length === 1 && file?.kind === 'user') return { path: file.display, exists: true, own: true, extends: null };
  const handle = ctx.settings?.raw.handle;
  const name = handle ? `${writers[0]}-${handle}` : `${writers[0]}-mine`;
  const existing = analysis.files.all.find((f) => f.stem === name && f.kind === 'user');
  const path = existing?.display ?? join(SCOPES.everywhere.dir(ctx), `${name}.md`);
  return { path, exists: Boolean(existing), own: false, extends: writers };
}

function runLocate(ctx, opts, name, quote) {
  const analysis = analyze(ctx, { pstackCheck: false });
  const { root, stem } = familyOf(analysis, name);
  const pb = analysis.playbooks.get(root);
  const found = locate(pb, quote, new Set(pb.family.map((m) => m.stem)), false);
  if (!found.step) return { out: failure(found, quote), status: 1 };
  const { step } = found;
  const written = writersOf(step, quoteRegex(quote));
  // A writer that another writer descends from is already visible to a file extending the descendant.
  const writers = written.filter((w) => !written.some((o) => o !== w && analysis.ancestors(o).has(w)));
  const edit = editTarget(ctx, analysis, writers);
  const n = pb.steps.indexOf(step) + 1;
  if (opts.json) {
    const { repo } = ctx;
    const head = { playbook: root, asked: stem, repo: repo.name, owner: repo.owner, org: repo.org, pstack: ctx.pstack.version };
    return { out: { ...head, step: n, text: effective(step), origin: step.origin, kind: step.kind, touched: step.touched, writers, edit }, status: 0 };
  }
  const where = edit.own ? `${edit.path} (exists; it wrote these words, so change its text there)` : `${edit.path} (${edit.exists ? 'exists' : 'new'}), extending ${andList(edit.extends)}`;
  return {
    out: [`# ${root} step ${n} (${headerParts(ctx).join(' · ')})`, `${display(step)}   ${tags(step)}`, `${andList(writers)} wrote the quoted words. Write the edit in:\n- ${where}`].join('\n\n'),
    status: 0,
  };
}

const WRITE_FLAGS = ['with', 'withFile', 'when', 'fromFile', 'scope'];

const readStdin = () => {
  try {
    return readFileSync(0, 'utf8');
  } catch {
    return '';
  }
};
const readSource = (source, flag) => {
  if (source === '-') return readStdin();
  try {
    return readFileSync(resolve(source), 'utf8');
  } catch {
    throw new UsageError(`${flag}: cannot read ${source}`);
  }
};
const oneLine = (text) => text.trim().replace(/\s*\n\s*/g, ' ');

/** The user scope folder a write lands in. Never a team folder, which changes only through a pull request. */
function writeDir(ctx, opts) {
  const scope = opts.scope ?? 'everywhere';
  if (!SCOPES[scope]) throw new UsageError(`--scope ${scope}: use everywhere, org or repo`);
  if (!isDir(ctx.configDir)) throw new UsageError(`no config dir at ${ctx.configDir}; run the setup skill first`);
  const dir = SCOPES[scope].dir(ctx);
  if (!dir) throw new UsageError(`no ${scope} for this checkout; run from a checkout of the ${scope}, or pass --repo`);
  const real = realOr(dir) ?? dir;
  if (real.split(sep).includes('.agents')) throw new UsageError(`${dir} resolves into a team folder; team changes go through a pull request`);
  return dir;
}

/** The current context, the one with no repo, and each repo config.json records, read from its checkout when it has one. */
function everyContext(ctx) {
  const at = (name) => {
    const recorded = name && ctx.settings.repos[name].checkout;
    const checkout = recorded && isDir(recorded) ? findCheckout(recorded) : null;
    return { ...ctx, repo: resolveRepo({ repo: name }, ctx.configDir, ctx.settings, checkout) };
  };
  const all = [ctx, at(null), ...Object.keys(ctx.settings?.repos ?? {}).map(at)];
  const key = ({ repo }) => JSON.stringify([repo.name, repo.org, repo.agentsDir]);
  return all.filter((c, i) => all.findIndex((o) => key(o) === key(c)) === i);
}

const reportLines = (report) => [...report.problems.map(problemLine), ...(report.pstackCheck.status === 'failed' ? report.pstackCheck.lines : [])];

const contextLines = (contexts, ctx, analysis) => contexts.flatMap((c) => {
  const report = checkReport(c, c === ctx && analysis ? analysis : analyze(c, { pstackCheck: true }));
  return report.passed ? [] : reportLines(report).map((line) => `in ${c.repo.name ?? 'no repo'}: ${line}`);
});

/** A stale step reference names the live step count, which the write itself can change. */
const sameProblem = (line) => line.replace(/ has \d+ steps?$/, ' has N steps');

/**
 * Writes `next`, then runs check in every context, since a user file can change what another file quotes or collide
 * with a name in any repo. Only a problem the write added refuses it, so a problem already on disk never blocks an
 * unrelated edit or its own repair. A refusal puts the prior bytes back and exits 1. `prior` is a Buffer, so a file that
 * is not UTF-8 comes back whole.
 */
function commitWrite(ctx, path, prior, next) {
  const contexts = everyContext(ctx);
  const before = new Set(contextLines(contexts).map(sameProblem));
  let made = null;
  for (let d = dirname(path); !lexists(d); d = dirname(d)) made = d;
  mkdirSync(dirname(path), { recursive: true });
  let committed = false;
  try {
    writeFileSync(path, next);
    const analysis = analyze(ctx, { pstackCheck: true });
    const after = contextLines(contexts, ctx, analysis);
    const added = after.filter((line) => !before.has(sameProblem(line)));
    if (added.length) throw Object.assign(new UsageError(`refused: this edit adds check problems, so nothing was written\n${added.join('\n')}`), { status: 1 });
    committed = true;
    return { analysis, remaining: after };
  } finally {
    if (!committed) {
      if (prior === null) rmSync(made ?? path, { recursive: true, force: true });
      else writeFileSync(path, prior);
    }
  }
}

const remainingNote = (remaining) => (remaining.length ? ['', 'this edit added no problems, but check still reports:', ...remaining] : []);

function runExtend(ctx, opts, args) {
  const [parent, ...rest] = args;
  if (rest.length === 2 && !ctx.settings?.raw.handle) throw new UsageError('give a file name, or set handle in config.json');
  const [fileName, verbWord, rawQuote] = rest.length === 2 ? [`${parent}-${ctx.settings.raw.handle}`, ...rest] : rest;
  const verb = ['After', 'Before', 'Replace', 'In'].find((v) => v.toLowerCase() === verbWord.toLowerCase());
  if (!verb) throw new UsageError(`${verbWord}: use after, before, replace or in`);
  const quote = rawQuote.trim();
  if (!quote || quote.includes('"')) throw new UsageError('the quote must be non-empty and hold no double quote');
  if (!/^[\w][\w.-]*$/.test(fileName) || fileName.endsWith('.md')) throw new UsageError(`${fileName}: give the file name without .md, letters, digits, dots and dashes only`);
  if ((opts.with === null) === (opts.withFile === null)) throw new UsageError('give exactly one of --with and --with-file');
  const text = oneLine(opts.with === null ? readSource(opts.withFile, '--with-file') : opts.with === '-' ? readStdin() : opts.with);
  if (!text) throw new UsageError('the change text is empty');
  const dir = writeDir(ctx, opts);
  const analysis = analyze(ctx, { pstackCheck: false });
  const roots = analysis.roots.get(analysis.index.resolve(parent) ?? parent);
  if (!roots || analysis.index.resolve(parent) !== parent) throw new UsageError(`no playbook named ${parent} is active here; run from a checkout where it is, or pass --repo`);
  // The new file sees its parent and the parent's ancestors, the same text its quotes will match once written.
  const seen = new Set([parent, ...analysis.ancestors(parent)]);
  let found;
  let pb;
  for (const root of roots) {
    pb = analysis.playbooks.get(root);
    found = locate(pb, quote, seen, false);
    if (found.step) break;
  }
  if (!found.step) {
    const hits = found.steps?.map((n) => `${n}. ${effective(pb.steps[n - 1]).slice(0, 70).trimEnd()}...`);
    throw Object.assign(new UsageError(`refused: ${failure(found, quote)}${hits ? `\n${hits.join('\n')}` : ''}`), { status: 1 });
  }
  const path = join(dir, `${fileName}.md`);
  const edit = `- **${verb}** "${quote}" ${text}`;
  const exists = lexists(path);
  let next;
  let prior = null;
  if (exists) {
    if (lstatSync(path).isSymbolicLink() || !isFile(path)) throw new UsageError(`${path} is not a plain file`);
    prior = readFileSync(path);
    const { front, hasFront } = parseLayerText(prior.toString('utf8'));
    if (!hasFront || !front.extends) throw new UsageError(`${path} has no extends: line; add one by hand or pick another file name`);
    const stems = front.extends.value.split(',').map((x) => x.trim()).filter(Boolean);
    if (stems.length === 0) throw new UsageError(`${path} defines a standalone playbook; pick another file name`);
    // latin1 maps each byte to one character, so bytes that are not UTF-8 pass through the line edit unchanged.
    const asBytes = (value) => Buffer.from(value).toString('latin1');
    const lines = prior.toString('latin1').replaceAll('\r\n', '\n').split('\n');
    if (!stems.includes(parent)) lines[front.extends.line - 1] = asBytes(`extends: ${[...stems, parent].join(', ')}`);
    next = Buffer.from(`${lines.join('\n').replace(/\n*$/, '')}\n${asBytes(edit)}\n`, 'latin1');
  } else {
    if (opts.when === null || !oneLine(opts.when)) throw new UsageError('a new file needs --when "<one sentence naming the requests it serves>"');
    next = `---\nextends: ${parent}\nwhen: ${oneLine(opts.when)}\n---\n\n${edit}\n`;
  }
  const { analysis: after, remaining } = commitWrite(ctx, path, prior, next);
  const out = [`${exists ? 'appended to' : 'created'} ${path}`];
  const flat = (value) => value.replace(/\s+/g, ' ');
  for (const root of after.roots.get(fileName) ?? []) {
    const shown = after.playbooks.get(root);
    const i = shown.steps.findIndex((s) => flat(effective(s)).includes(flat(text)) && (s.origin === fileName || s.touched.includes(fileName)));
    if (i >= 0) out.push('', `# ${root} step ${i + 1} (${headerParts(ctx).join(' · ')})`, `${display(shown.steps[i])}   ${tags(shown.steps[i])}`);
  }
  return { out: [...out, ...remainingNote(remaining)].join('\n'), status: 0 };
}

function runNew(ctx, opts, [name]) {
  if (!/^[a-z0-9][a-z0-9-]*$/.test(name)) throw new UsageError(`${name}: a playbook name is lowercase letters, digits and dashes`);
  if (opts.fromFile === null) throw new UsageError('give the steps with --from-file <path|->');
  if (opts.with !== null || opts.withFile !== null) throw new UsageError('--with and --with-file belong to extend');
  const when = opts.when === null ? '' : oneLine(opts.when);
  if (!when) throw new UsageError('give --when "<one sentence naming the requests it serves>"');
  const dir = writeDir(ctx, opts);
  const analysis = analyze(ctx, { pstackCheck: false });
  const path = join(dir, `${name}.md`);
  const taken = analysis.playbooks.has(name) || analysis.roots.has(name) || stemUniverse(ctx).has(name) || lexists(path);
  if (taken) throw Object.assign(new UsageError(`refused: ${name} already exists; pick a unique name`), { status: 1 });
  const body = normalize(readSource(opts.fromFile, '--from-file')).trim();
  if (body.split('\n').some((l) => CHANGE_VERB.test(l))) throw Object.assign(new UsageError('refused: a standalone playbook cannot carry edit lines'), { status: 1 });
  if (body.startsWith('---')) throw new UsageError('give the steps only; new writes the front matter');
  if (parsePlaybook(body).steps.length === 0) throw Object.assign(new UsageError('refused: the body has no numbered steps (a line "1. " at column 0 starts one)'), { status: 1 });
  const { analysis: after, remaining } = commitWrite(ctx, path, null, `---\nextends:\nwhen: ${when}\n---\n\n${body}\n`);
  const pb = after.playbooks.get(name);
  return { out: `created ${path}\n\n# ${name} (${headerParts(ctx).join(' · ')})\n${pb.steps.map((s, i) => `${i + 1}. ${display(s)}   ${tags(s)}`).join('\n')}${remainingNote(remaining).join('\n')}`, status: 0 };
}

function runList(ctx, opts) {
  const { playbooks } = analyze(ctx, { pstackCheck: false });
  const rows = [...playbooks.values()]
    .sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))
    .map((pb) => ({ name: pb.name, kind: pb.kind, family: pb.family.slice(1).map((m) => m.stem) }));
  if (opts.json) {
    const { repo } = ctx;
    return { out: { repo: repo.name, owner: repo.owner, org: repo.org, pstack: ctx.pstack.version, playbooks: rows }, status: 0 };
  }
  const nameWidth = Math.max('playbook'.length, ...rows.map((r) => r.name.length)) + 2;
  const kindWidth = 'pstack'.length + 2;
  const [repoName, ...rest] = headerParts(ctx);
  const header = ctx.repo.name ? `${repoName} (${rest.join(' · ')})` : `(${repoName})`;
  const lines = [header, `${'playbook'.padEnd(nameWidth)}${'kind'.padEnd(kindWidth)}family`, ...rows.map((r) => `${r.name.padEnd(nameWidth)}${r.kind.padEnd(kindWidth)}${r.family.join(', ')}`)];
  return { out: lines.map((l) => l.trimEnd()).join('\n'), status: 0 };
}

const SCRIPT = fileURLToPath(import.meta.url);
const README = fileURLToPath(new URL('../../../README.md', import.meta.url));
const SELF_BIN = fileURLToPath(new URL('../../../bin/playbook', import.meta.url));
const MARKS = { ok: '✓', fail: '✗', info: '-' };
const PLUGIN = 'jawsome-playbooks';

const shellQuote = (s) => (/^[\w@%+=:,./-]+$/.test(s) ? s : `'${s.replaceAll("'", "'\\''")}'`);
const sh = (...words) => words.map(shellQuote).join(' ');
const finding = (id, status, message, { details = [], fixes = [] } = {}) => ({ id, status, message, details, fixes });
const runFix = (command) => ({ command, run: true });
const showFix = (command) => ({ command, run: false });
const realOr = (path) => {
  try {
    return realpathSync(path);
  } catch {
    return null;
  }
};

function onPath(name) {
  for (const dir of (process.env.PATH ?? '').split(delimiter).filter(Boolean)) {
    const path = join(dir, name);
    try {
      accessSync(path, constants.X_OK);
      if (isFile(path)) return path;
    } catch {}
  }
  return null;
}

/** True when the command at `path` resolves to a bin/ script of a jawsome-playbooks checkout or install. */
const isOurs = (path) => {
  const real = realOr(path);
  return Boolean(real) && isFile(join(dirname(real), '..', 'skills', 'playbook', 'scripts', 'playbook.mjs'));
};

/** The `| Harness |` table rows of README install step `step`, as { harness, cell } with the Commands cell. */
function readmeRows(step) {
  let text;
  try {
    text = readFileSync(README, 'utf8');
  } catch {
    return null;
  }
  const lines = (text.split(/^### /m).find((s) => s.startsWith(`${step}.`)) ?? '').split('\n');
  const header = lines.findIndex((line) => /^\|\s*Harness\s*\|/.test(line));
  if (header === -1) return null;
  const rows = [];
  for (const line of lines.slice(header + 2)) {
    if (!line.startsWith('|')) break;
    const [, harness, cell] = line.split('|').map((c) => c.trim());
    rows.push({ harness, cell });
  }
  return rows;
}

/**
 * The operator's harness, as far as doctor can drive it. With `claude` on PATH, fixes are Claude Code's own
 * commands; every other harness gets each README row printed, because playbook cannot run its installer.
 */
function harnessOf(home) {
  const claude = onPath('claude');
  const claudeJson = (args) => {
    const r = spawnSync(claude, args, { encoding: 'utf8' });
    try {
      return r.status === 0 ? JSON.parse(r.stdout) : null;
    } catch {
      return null;
    }
  };
  let marketplaces;
  const knownMarketplaces = () => (marketplaces ??= new Set((claudeJson(['plugin', 'marketplace', 'list', '--json']) ?? []).map((m) => m.name)));
  const fixes = (step, { run }) => {
    const rows = readmeRows(step);
    if (!rows) return [showFix('see https://github.com/JawsomeJason/jawsome-playbooks#install-and-set-up-jawsome-playbooks')];
    if (!claude) return rows.map((r) => showFix(`${r.harness}: ${r.cell.replaceAll('`', '')}`));
    const commands = [...(rows.find((r) => r.harness === 'Claude Code')?.cell ?? '').matchAll(/`([^`]+)`/g)].map((m) => m[1]);
    const market = commands.map((c) => /^claude plugin install \S+@(\S+)/.exec(c)?.[1]).find(Boolean);
    const added = run && market && knownMarketplaces().has(market);
    return commands.filter((c) => !(added && c.startsWith('claude plugin marketplace add '))).map((command) => ({ command, run }));
  };
  return { home, claude, claudeJson, fixes };
}

function checkPstack(h) {
  try {
    const { dir, version } = resolvePstack(null);
    return { dir, finding: finding('pstack', 'ok', `pstack-claude ${version}: ${dir}`) };
  } catch (e) {
    if (!(e instanceof UsageError)) throw e;
    const env = envVar('PSTACK_DIR');
    if (env) return { finding: finding('pstack', 'fail', `PLAYBOOKS_PSTACK_DIR=${env} holds no pstack`, { fixes: [showFix('unset PLAYBOOKS_PSTACK_DIR, or set it to the folder that holds skills/poteto-mode')] }) };
    return { finding: finding('pstack', 'fail', 'pstack-claude not found', { fixes: h.fixes(1, { run: true }) }) };
  }
}

function checkPlugin(h) {
  if (h.claude) {
    const plugins = h.claudeJson(['plugin', 'list', '--json']);
    if (!Array.isArray(plugins)) return finding('plugin', 'fail', 'claude plugin list --json failed', { fixes: [showFix('claude plugin list --json')] });
    const ours = plugins.find((p) => typeof p.id === 'string' && p.id.startsWith(`${PLUGIN}@`));
    if (ours) return finding('plugin', 'ok', `${PLUGIN} ${ours.version} installed in Claude Code (${ours.scope} scope)`);
    return finding('plugin', 'fail', `${PLUGIN} is not installed in Claude Code`, { fixes: h.fixes(2, { run: true }) });
  }
  for (const plugins of pluginDirs()) {
    const path = join(plugins, 'installed_plugins.json');
    let record;
    try {
      record = JSON.parse(readFileSync(path, 'utf8'));
    } catch {
      continue;
    }
    const [, installs] = Object.entries(record?.plugins ?? {}).find(([key]) => key.startsWith(`${PLUGIN}@`)) ?? [];
    if (Array.isArray(installs) && installs.length) return finding('plugin', 'ok', `${PLUGIN} ${installs[0].version} in ${path}`);
  }
  return finding('plugin', 'fail', `${PLUGIN} is not installed in any harness install record`, { fixes: h.fixes(2, { run: false }) });
}

function checkCommands(h) {
  const binDir = join(h.home, '.local', 'bin');
  const out = [];
  for (const name of ['playbook']) {
    const clone = join(h.home, '.claude', 'plugins', 'marketplaces', PLUGIN, 'bin', name);
    const source = h.claude && isFile(clone) ? clone : join(dirname(SELF_BIN), name);
    const dest = join(binDir, name);
    const link = sh('ln', '-s', source, dest);
    const found = onPath(name);
    if (!found) {
      const fixes = lexists(dest)
        ? []
        : [...(isDir(binDir) ? [] : [runFix(sh('mkdir', '-p', binDir))]), runFix(link)];
      if (!(process.env.PATH ?? '').split(delimiter).includes(binDir)) fixes.push(showFix(`add ${binDir} to PATH`));
      out.push(finding('cli', 'fail', `${name} is not on PATH`, { fixes }));
    } else if (!isOurs(found)) {
      out.push(finding('cli', 'fail', `${name} on PATH is ${found}, which is not jawsome-playbooks'`, { fixes: [showFix(`move ${found} aside, then: ${link}`)] }));
    } else {
      const real = realOr(found);
      out.push(finding('cli', 'ok', `${name}: ${found}${real === found ? '' : ` -> ${real}`}`));
    }
  }
  return out;
}

function checkConfig(h, configDir) {
  const setup = () => ({ fixes: h.fixes(5, { run: false }) });
  if (!isDir(configDir)) return { finding: finding('config', 'fail', `no config dir at ${configDir}`, setup()) };
  let settings;
  try {
    settings = readSettings(configDir);
  } catch (e) {
    if (!(e instanceof UsageError)) throw e;
    return { finding: finding('config', 'fail', e.message, setup()) };
  }
  if (!settings) return { finding: finding('config', 'fail', `${join(configDir, 'config.json')} is missing`, setup()) };
  const { handle } = settings.raw;
  if (typeof handle !== 'string' || !handle) return { settings, finding: finding('config', 'fail', `${settings.path} has no handle`, setup()) };
  return { settings, handle, finding: finding('config', 'ok', `config ${configDir}: config.json parses, handle ${handle}`) };
}

function checkMode(h, configDir, handle) {
  const name = `${handle}-mode`;
  const modeDir = join(configDir, 'mode', name);
  if (!isFile(join(modeDir, 'SKILL.md'))) return finding('mode', 'fail', `${modeDir}/SKILL.md is missing`, { fixes: h.fixes(5, { run: false }) });
  const skillDirs = listDir(h.home).filter((e) => e.startsWith('.')).map((dot) => join(h.home, dot, 'skills')).filter(isDir);
  const linked = skillDirs.filter((dir) => realOr(join(dir, name)) === realOr(modeDir));
  if (linked.length) return finding('mode', 'ok', `mode skill ${modeDir} is linked into ${linked.join(', ')}`);
  const message = `mode skill ${modeDir} is not linked into any skills folder`;
  if (!h.claude) return finding('mode', 'fail', message, { fixes: [showFix(`ln -s ${shellQuote(modeDir)} <skills folder your harness loads>/${name}`)] });
  const dir = join(h.home, '.claude', 'skills');
  const dest = join(dir, name);
  const link = sh('ln', '-s', modeDir, dest);
  const fixes = lexists(dest) ? [showFix(`move ${dest} aside, then: ${link}`)] : [...(isDir(dir) ? [] : [runFix(sh('mkdir', '-p', dir))]), runFix(link)];
  return finding('mode', 'fail', message, { fixes });
}

/**
 * One repo's team playbooks, in the checkout config.json records or else the current one. They are committed copies;
 * a link into the config dir is the retired layout, and an untracked folder reaches only the operator.
 */
function checkRepo(h, configDir, settings, name, here) {
  const id = `repo:${name}`;
  const recorded = settings.repos[name]?.checkout;
  const path = recorded ?? (here?.name === name ? here.root : null);
  if (!path) return { finding: finding(id, 'info', `${name}: no checkout known; set repos.${name}.checkout in config.json, or run doctor from the checkout`) };
  const checkout = isDir(path) ? findCheckout(path) : null;
  if (!checkout) return { finding: finding(id, 'fail', `${name}: ${path} is not a git checkout`, { fixes: h.fixes(5, { run: false }) }) };
  const { root } = checkout;
  const dir = join(root, TEAM_DIR);
  if (!lexists(dir)) return { root, finding: finding(id, 'info', `${name}: ${root} has no .agents/playbooks, so it has no team playbooks`) };
  const config = realOr(configDir);
  const real = realOr(dir);
  if (lstatSync(dir).isSymbolicLink() && config && real?.startsWith(`${config}${sep}`)) {
    return { root, finding: finding(id, 'fail', `${name}: ${dir} links into the config dir; team playbooks are committed copies, so replace the link with them`, { fixes: [showFix(sh('rm', dir))] }) };
  }
  const count = mdFiles(dir).length;
  const held = `${name}: ${dir} holds ${count} team ${count === 1 ? 'playbook' : 'playbooks'}`;
  const tracked = gitOut(root, ['ls-files', '--', TEAM_DIR]);
  if (!tracked) return { root, finding: finding(id, 'info', `${held}, but git does not track them, so teammates do not see them`) };
  return { root, finding: finding(id, 'ok', held) };
}

/** Runs `playbook check` pinned to the resolved pstack, so it reads the same files and records nothing. */
function checkRun(repo, cwd, pstackDir) {
  const label = repo ? `playbook check --repo ${repo}` : 'playbook check';
  const id = repo ? `check:${repo}` : 'check';
  const args = [SCRIPT, 'check', '--json', ...(repo ? ['--repo', repo] : []), ...(pstackDir ? ['--pstack', pstackDir] : [])];
  const r = spawnSync(process.execPath, args, { cwd, encoding: 'utf8' });
  if (r.status === 0) return finding(id, 'ok', `${label} passed`);
  if (r.status !== 1) return finding(id, 'fail', `${label} could not run`, { details: r.stderr.split('\n').filter(Boolean) });
  const report = JSON.parse(r.stdout);
  const details = [...report.problems.map(problemLine), ...(report.pstackCheck.status === 'failed' ? report.pstackCheck.lines : [])];
  return finding(id, 'fail', `${label} failed`, { details, fixes: [showFix(`fix each line above, then run ${label}`)] });
}

function diagnose() {
  const h = harnessOf(homedir());
  const cwd = process.cwd();
  const configDir = configDirPath();
  const pstack = checkPstack(h);
  const findings = [pstack.finding, checkPlugin(h), ...checkCommands(h)];
  const config = checkConfig(h, configDir);
  findings.push(config.finding);
  if (config.handle) findings.push(checkMode(h, configDir, config.handle));
  const repos = Object.keys(config.settings?.repos ?? {});
  const here = findCheckout(cwd);
  const runs = [];
  for (const name of repos) {
    const repo = checkRepo(h, configDir, config.settings, name, here);
    findings.push(repo.finding);
    runs.push(checkRun(name, repo.root ?? cwd, pstack.dir));
  }
  if (repos.length === 0) runs.push(checkRun(null, cwd, pstack.dir));
  return [...findings, ...runs];
}

function renderDoctor(findings) {
  const failed = findings.filter((f) => f.status === 'fail').length;
  return [
    ...findings.flatMap((f) => [`${MARKS[f.status]} ${f.message}`, ...[...f.details, ...f.fixes.map((x) => x.command)].map((l) => `    ${l}`)]),
    failed ? `doctor failed: ${failed} ${failed === 1 ? 'problem' : 'problems'}` : 'doctor passed',
  ].join('\n');
}

function ask(question) {
  process.stdout.write(question);
  const byte = Buffer.alloc(1);
  let line = '';
  for (;;) {
    let n;
    try {
      n = readSync(0, byte, 0, 1, null);
    } catch (e) {
      if (e.code === 'EAGAIN') continue;
      throw e;
    }
    if (n === 0 || byte[0] === 0x0a) return line.trim();
    line += String.fromCharCode(byte[0]);
  }
}

function applyFixes(findings) {
  for (const f of findings.filter((x) => x.fixes.some((fix) => fix.run))) {
    const commands = f.fixes.filter((fix) => fix.run).map((fix) => fix.command);
    process.stdout.write(`\n${f.message}\n${commands.map((c) => `  ${c}\n`).join('')}`);
    if (!/^y(es)?$/i.test(ask('run these? [y/N] '))) continue;
    for (const command of commands) {
      if (spawnSync('sh', ['-c', command], { stdio: 'inherit' }).status === 0) continue;
      process.stdout.write(`failed: ${command}\n`);
      break;
    }
  }
}

function runDoctor(opts) {
  const findings = diagnose();
  const status = (list) => (list.some((f) => f.status === 'fail') ? 1 : 0);
  if (opts.json) return { out: { passed: status(findings) === 0, findings }, status: status(findings) };
  const report = renderDoctor(findings);
  const fixable = findings.some((f) => f.fixes.some((fix) => fix.run));
  if (!opts.fix || !fixable) return { out: report, status: status(findings) };
  if (!process.stdin.isTTY) return { out: `${report}\nfixes not run: no terminal to ask on`, status: status(findings) };
  process.stdout.write(`${report}\n`);
  applyFixes(findings);
  const after = diagnose();
  return { out: `\nafter fixes:\n${renderDoctor(after)}`, status: status(after) };
}

const COMMANDS = {
  'playbook list': { arity: 0, run: (opts) => runList(loadContext(opts), opts) },
  'playbook show': { arity: 1, run: (opts, [name]) => runCompute(loadContext(opts), opts, name) },
  'playbook locate': { arity: 2, run: (opts, [name, quote]) => runLocate(loadContext(opts), opts, name, quote) },
  'playbook extend': { arity: [3, 4], writes: true, run: (opts, args) => runExtend(loadContext(opts), opts, args) },
  'playbook new': { arity: 1, writes: true, run: (opts, args) => runNew(loadContext(opts), opts, args) },
  check: { arity: 0, run: (opts) => runCheck(loadContext(opts), opts) },
  doctor: { arity: 0, run: (opts) => runDoctor(opts) },
};

const WRITE_OPTIONS = {
  '--with': { key: 'with', dashText: true },
  '--when': { key: 'when', dashText: true },
  '--with-file': { key: 'withFile' },
  '--from-file': { key: 'fromFile' },
  '--scope': { key: 'scope' },
};
const GROUP_VERBS = new Set(['list', 'show', 'compute', 'locate', 'extend', 'new']);
const VERB_ALIASES = { compute: 'show' };

function parseArgs(argv) {
  const opts = { json: false, fix: false, help: false, everyRepo: false, repo: null, pstack: null, with: null, withFile: null, when: null, fromFile: null, scope: null };
  const words = [];
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--json') opts.json = true;
    else if (arg === '--fix') opts.fix = true;
    else if (arg === '--every-repo') opts.everyRepo = true;
    else if (arg === '--help' || arg === '-h') opts.help = true;
    else if (arg === '--repo' || arg === '--pstack') {
      const value = argv[++i];
      if (!value || value.startsWith('-')) throw new UsageError(`${arg} needs a value`, { usage: true });
      opts[arg.slice(2)] = value;
    } else if (WRITE_OPTIONS[arg]) {
      const value = argv[++i];
      if (value === undefined || (value.startsWith('-') && value !== '-' && !WRITE_OPTIONS[arg].dashText)) throw new UsageError(`${arg} needs a value`, { usage: true });
      opts[WRITE_OPTIONS[arg].key] = value;
    } else if (arg.startsWith('-')) throw new UsageError(`unknown option ${arg}`, { usage: true });
    else words.push(arg);
  }
  if (opts.help) return { opts };
  const [head, ...rest] = words;
  const command = COMMANDS[GROUP_VERBS.has(head) ? `playbook ${VERB_ALIASES[head] ?? head}` : head];
  const args = rest;
  if (!command || ![command.arity].flat().includes(args.length)) throw new UsageError('', { usage: true });
  if (!command.writes && WRITE_FLAGS.some((f) => opts[f] !== null)) throw new UsageError('', { usage: true });
  if (opts.everyRepo && (command !== COMMANDS.check || opts.repo)) throw new UsageError('', { usage: true });
  if (command.writes && (opts.json || opts.fix)) throw new UsageError('', { usage: true });
  if (command === COMMANDS.doctor ? opts.repo || opts.pstack || (opts.fix && opts.json) : opts.fix) throw new UsageError('', { usage: true });
  return { opts, command, args };
}

function main(argv) {
  try {
    const { opts, command, args } = parseArgs(argv);
    if (opts.help) {
      process.stdout.write(`${USAGE}\n`);
      return 0;
    }
    const { out, status } = command.run(opts, args);
    process.stdout.write(typeof out === 'string' ? `${out}\n` : `${JSON.stringify(out, null, 2)}\n`);
    return status;
  } catch (e) {
    if (!(e instanceof UsageError)) throw e;
    process.stderr.write(`${e.message}\n`);
    return e.status ?? 2;
  }
}

process.exitCode = main(process.argv.slice(2));
