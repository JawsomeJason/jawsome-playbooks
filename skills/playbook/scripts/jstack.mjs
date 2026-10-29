#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { accessSync, constants, existsSync, lstatSync, readdirSync, readFileSync, readlinkSync, readSync, realpathSync, statSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { basename, delimiter, dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const USAGE = `usage: jstack-cli playbook list [--repo <repo>] [--json] [--pstack <dir-or-version>]
       jstack-cli playbook compute <name> [--repo <repo>] [--json] [--pstack <dir-or-version>]
       jstack-cli playbook locate <name> <quote> [--repo <repo>] [--json] [--pstack <dir-or-version>]
       jstack-cli check [--repo <repo>] [--json] [--pstack <dir-or-version>]
       jstack-cli doctor [--fix | --json]`;

class UsageError extends Error {
  constructor(message, { usage = false } = {}) {
    super(usage ? `${message ? `${message}\n` : ''}${USAGE}` : message);
  }
}

// `anywhere` is where a layer's files sit in the config dir for any org or repo, `*` standing for the org or repo.
const LAYERS = {
  user: { label: 'user', team: false, anywhere: 'user', dir: (c) => join(c.configDir, 'user') },
  'org.standard': { label: 'org.std', team: true, anywhere: 'orgs/*/standard' },
  'org.overrides': { label: 'org.ovr', team: false, anywhere: 'orgs/*/overrides', dir: (c) => c.repo.org && join(c.configDir, 'orgs', c.repo.org, 'overrides') },
  'repo.standard': { label: 'repo.std', team: true, anywhere: 'repos/*/team' },
  'repo.overrides': { label: 'repo.ovr', team: false, anywhere: 'repos/*/overrides', dir: (c) => c.repo.name && join(c.configDir, 'repos', c.repo.name, 'overrides') },
};
const DEFAULT_ORDER = Object.keys(LAYERS);
const label = (layer) => LAYERS[layer]?.label ?? layer;

const CHANGE = /^\s*(?:[-*]|\d+\.)\s+\*\*(After|Before|Replace|In)\*\*\s+"([^"]+)"[ \t]*(.*)$/;
const CHANGE_VERB = /^\s*(?:[-*]|\d+\.)\s+\*\*(?:After|Before|Replace|In)\*\*/;
const LIST_ITEM = /^\s*(?:[-*]|\d+\.)\s+(.*)$/;
const NUMBERED_STEP = /^\d+\.\s(.*)$/;
const HEADING = /^#{1,6}\s+(.+)$/;

const FAILURES = {
  ambiguous: { rank: 4, message: (quote, steps) => `quote matches steps ${andList(steps)}; make it longer` },
  teamOnly: { rank: 3, message: () => 'team files may quote pstack only' },
  outside: { rank: 2, message: () => 'quote is outside a numbered step' },
  missing: { rank: 1, message: (quote) => `quote not found: "${quote}"` },
};

const CELLS = { defines: '●', edits: '+', none: '·' };

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

let groups = 0;
const segment = (text, layer, extra = {}) => ({ text, layer, struck: false, base: false, group: ++groups, replaces: new Set(), ...extra });
const newStep = (text, origin) => ({ origin, touched: [], overrides: [], segments: [segment(text, origin, { base: true })] });
const effective = (step) => step.segments.filter((s) => !s.struck).map((s) => s.text).join('');
const original = (step) => step.segments.filter((s) => s.base).map((s) => s.text).join('');
const display = (step) => step.segments.map((s) => (s.struck ? `~~${s.text}~~ ` : s.text)).join('');

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

/**
 * Strikes the quoted span and inserts the change after it. A team Replace whose words a lower layer already
 * replaced matches the step's original text instead, and strikes that lower replacement too.
 */
function replaceSpan(step, edit, layer) {
  const re = quoteRegex(edit.quote);
  const live = re.exec(effective(step));
  const m = live ?? re.exec(original(step));
  const taken = takeSpan(step, live ? (s) => !s.struck : (s) => s.base, m.index, m.index + m[0].length);
  const hit = new Set(taken.filter((s) => s.struck).map((s) => s.group));
  const superseded = [];
  for (let grew = true; grew; ) {
    grew = false;
    for (const s of step.segments) {
      if (s.struck || ![...s.replaces].some((g) => hit.has(g))) continue;
      s.struck = true;
      hit.add(s.group);
      superseded.push(s);
      grew = true;
    }
  }
  for (const s of taken) s.struck = true;
  const last = Math.max(...[...taken, ...superseded].map((s) => step.segments.indexOf(s)));
  step.segments.splice(last + 1, 0, segment(edit.text, layer, { replaces: new Set(taken.map((s) => s.group)) }));
  return superseded.length ? { over: superseded.at(-1).layer } : {};
}

const VERBS = {
  After: { edits: false, apply: (pb, step, edit, layer) => pb.steps.splice(pb.steps.indexOf(step) + 1, 0, newStep(edit.text, layer)) },
  Before: { edits: false, apply: (pb, step, edit, layer) => pb.steps.splice(pb.steps.indexOf(step), 0, newStep(edit.text, layer)) },
  In: {
    edits: true,
    apply: (pb, step, edit, layer) => {
      step.segments.push(segment(` ${edit.text}`, layer));
      return {};
    },
  },
  Replace: { edits: true, apply: (pb, step, edit, layer) => replaceSpan(step, edit, layer) },
};

const makePlaybook = (name, origin, parsed) => {
  const steps = parsed.steps.map((t) => newStep(t, origin));
  return { name, origin, title: parsed.title, intro: parsed.intro, steps, bundled: origin === 'pstack' ? [...steps] : [], notes: [], definedBy: null };
};

/** Finds the one step a quote names, or the reason it names none. Team files search bundled text only. */
function locate(pb, quote, team) {
  if (team && pb.bundled.length === 0) return { fail: 'teamOnly' };
  const re = quoteRegex(quote);
  const pool = team ? pb.bundled.map((s) => [s, original(s)]) : pb.steps.map((s) => [s, effective(s)]);
  const hits = pool.flatMap(([, text], i) => (re.test(text) ? [i + 1] : []));
  if (hits.length === 1) return { step: pool[hits[0] - 1][0] };
  if (hits.length > 1) return { fail: 'ambiguous', steps: hits };
  if (team && pb.steps.some((s) => re.test(effective(s)))) return { fail: 'teamOnly' };
  if (re.test(pb.intro)) return { fail: 'outside' };
  return { fail: 'missing' };
}

/**
 * Runs every layer file, in cascade order, over every playbook. Each file targets its `extends` stems plus its own
 * stem when that names a playbook known below its layer; a file with no target defines a standalone playbook.
 */
function cascade(bundled, files, order) {
  const rank = (layer) => order.indexOf(layer);
  const playbooks = new Map([...bundled].map(([name, parsed]) => [name, makePlaybook(name, 'pstack', parsed)]));
  for (const layer of order) {
    const known = new Set(playbooks.keys());
    for (const file of files.filter((f) => f.layer === layer)) {
      const valid = (stem) => (file.team ? bundled.has(stem) : known.has(stem));
      for (const stem of file.extends) {
        if (!valid(stem)) file.problems.push({ line: file.extendsLine, message: `extends ${stem}, which pstack ${file.pstackName} has no playbook for` });
      }
      file.targets = [...new Set([...file.extends.filter(valid), ...(known.has(file.stem) ? [file.stem] : [])])];
      if (file.targets.length === 0 && file.extends.length === 0) {
        const pb = makePlaybook(file.stem, layer, parsePlaybook(file.body));
        pb.definedBy = file;
        playbooks.set(file.stem, pb);
        for (const edit of file.edits) file.problems.push({ line: edit.line, message: 'standalone playbook cannot carry edits' });
        continue;
      }
      const fails = file.edits.map(() => []);
      const applied = new Set();
      for (const target of file.targets) {
        const pb = playbooks.get(target);
        file.edits.forEach((edit, i) => {
          const found = locate(pb, edit.quote, file.team);
          if (!found.step) return fails[i].push(found);
          const verb = VERBS[edit.verb];
          const result = verb.apply(pb, found.step, edit, layer);
          applied.add(i);
          if (!verb.edits) return;
          const step = found.step;
          if (layer !== step.origin && !step.touched.includes(layer)) step.touched.push(layer);
          if (rank(layer) > rank(step.origin)) {
            step.overrides.push({ layer, verb: edit.verb, quote: edit.quote, origin: step.origin, ...result });
          }
        });
        for (const note of file.notes) pb.notes.push({ text: note.text, layer });
      }
      file.edits.forEach((edit, i) => {
        if (applied.has(i) || fails[i].length === 0) return;
        const worst = fails[i].reduce((a, b) => (FAILURES[b.fail].rank > FAILURES[a.fail].rank ? b : a));
        file.problems.push({ line: edit.line, message: FAILURES[worst.fail].message(edit.quote, worst.steps) });
      });
    }
  }
  return playbooks;
}

const kebab = (title) => title.toLowerCase().replace(/[^a-z0-9\s-]/g, '').trim().replace(/\s+/g, '-');

/**
 * Resolves a written name to a playbook stem by stem or by title, the way poteto-mode turns a title into a file name.
 * `ignored` names a poteto-mode section or skill, which a bold word after "per" often means instead.
 */
function playbookIndex(pstackDir, playbooks, files) {
  const stems = new Map();
  for (const pb of playbooks.values()) {
    stems.set(pb.name, pb.name);
    if (pb.title) stems.set(kebab(pb.title), pb.name);
  }
  for (const file of files) stems.set(file.stem, file.stem);
  const skillsDir = join(pstackDir, 'skills');
  const skills = new Set(listDir(skillsDir));
  const guide = join(skillsDir, 'poteto-mode', 'SKILL.md');
  const headings = isFile(guide) ? normalize(readFileSync(guide, 'utf8')).split('\n').map((l) => HEADING.exec(l)?.[1]) : [];
  const sections = new Set(headings.filter(Boolean).map(kebab));
  return {
    resolve: (name) => stems.get(kebab(name)) ?? null,
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
  return found.sort((a, b) => a.at - b.at).map(({ name, stem }) => ({ name, stem }));
}

/** Each other playbook the steps, then the notes, hand off to, in order of first mention. */
function handoffs(pb, index) {
  const found = new Map();
  const mention = (text, step) => {
    for (const { stem } of handoffRefs(text, index)) {
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

const touches = (file, name) => file.targets?.includes(name) || (file.targets?.length === 0 && file.extends.length === 0 && file.stem === name);

function computed(pb, order, index) {
  const rank = (layer) => order.indexOf(layer);
  return {
    steps: pb.steps.map((s) => ({ text: effective(s), origin: s.origin, touched: s.touched, display: display(s) })),
    handoffs: handoffs(pb, index),
    notes: pb.notes,
    overrides: pb.steps
      .flatMap((s, i) => s.overrides.map((o) => ({ step: i + 1, ...o })))
      .sort((a, b) => a.step - b.step || rank(a.layer) - rank(b.layer)),
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
  const path = join(configDir, 'layers.json');
  if (!isFile(path)) return null;
  let raw;
  try {
    raw = JSON.parse(readFileSync(path, 'utf8'));
  } catch (e) {
    throw new UsageError(`${path}: ${e.message}`);
  }
  const bad = (what) => new UsageError(`${path}: ${what}`);
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw bad('must be a JSON object');
  if (raw.pstack !== undefined && typeof raw.pstack !== 'string') throw bad('"pstack" must be a string');
  if (raw.layers !== undefined && !(Array.isArray(raw.layers) && raw.layers.every((l) => typeof l === 'string'))) {
    throw bad('"layers" must be an array of layer names');
  }
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
  return { path, raw, pstack: raw.pstack ?? null, layers: raw.layers ?? DEFAULT_ORDER, orgs, repos };
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

function orgFromLinks(teamDir, configDir) {
  let configReal;
  let teamReal;
  try {
    configReal = realpathSync(configDir);
    teamReal = realpathSync(teamDir);
  } catch {
    return null;
  }
  for (const name of listDir(teamDir)) {
    const path = join(teamDir, name);
    if (!lstatSync(path).isSymbolicLink()) continue;
    const rel = relative(configReal, resolve(teamReal, readlinkSync(path))).split(sep).join('/');
    const m = /^orgs\/([^/]+)\/standard\//.exec(rel);
    if (m) return m[1];
  }
  return null;
}

function resolveRepo(opts, configDir, settings) {
  const checkout = findCheckout(process.cwd());
  const useCheckout = checkout && (!opts.repo || opts.repo === checkout.name);
  const name = opts.repo ?? checkout?.name ?? null;
  const owner = useCheckout ? checkout.owner : null;
  const root = useCheckout ? checkout.root : null;
  const agentsDir = root && lexists(join(root, '.agents', 'playbooks')) ? join(root, '.agents', 'playbooks') : null;
  const teamDir = agentsDir ?? (name ? join(configDir, 'repos', name, 'team') : null);
  const teamDisplay = agentsDir ? (file) => `.agents/playbooks/${file}` : (file) => join(teamDir, file);
  const orgs = Object.entries(settings?.orgs ?? {});
  let org = owner ? (orgs.find(([, o]) => o.owners.includes(owner))?.[0] ?? null) : null;
  if (!org && !agentsDir && teamDir && isDir(teamDir)) org = orgFromLinks(teamDir, configDir);
  return { name, owner, org, root, agentsDir, teamDir, teamDisplay };
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
  const envDir = process.env.JSTACK_PSTACK_DIR;
  const base = envDir ? pstackAt(envDir) : (installedPstack() ?? discoverPstacks()[0] ?? null);
  let pick = base;
  if (flag) {
    const sibling = base && join(dirname(base.dir), flag);
    if (existsSync(flag)) pick = pstackAt(flag);
    else if (sibling && existsSync(sibling)) pick = pstackAt(sibling);
    else pick = discoverPstacks().find((p) => p.version === flag) ?? null;
    if (!pick) throw new UsageError(`no pstack ${flag} found`);
  }
  if (!pick) throw new UsageError('no pstack found; set JSTACK_PSTACK_DIR to a pstack install (the folder holding skills/poteto-mode)');
  if (!isDir(join(pick.dir, PLAYBOOKS))) throw new UsageError(`${pick.dir} has no ${PLAYBOOKS}; set JSTACK_PSTACK_DIR to a pstack install`);
  return pick;
}

const configDirPath = () => resolve(process.env.JSTACK_CONFIG || join(homedir(), '.jstack'));

function loadContext(opts) {
  const configDir = configDirPath();
  const settings = readSettings(configDir);
  const configProblems = [];
  for (const layer of settings?.layers ?? []) {
    if (!LAYERS[layer]) configProblems.push({ path: settings.path, line: 1, message: `unknown layer ${layer}` });
  }
  const order = isDir(configDir) ? (settings?.layers ?? DEFAULT_ORDER).filter((l) => LAYERS[l]) : [];
  const pstack = resolvePstack(opts.pstack);
  const repo = resolveRepo(opts, configDir, settings);
  return { configDir, settings, order, configProblems, pstack, repo, pinned: Boolean(opts.pstack) };
}

function readLayerFile(path, displayPath, layer, team, pstackName) {
  const parsed = parseLayerText(readFileSync(path, 'utf8'));
  const { front } = parsed;
  const problems = parsed.malformed.map((line) => ({ line, message: 'a change has no straight-quoted step text to anchor on' }));
  if (!front.when?.value) problems.push({ line: 1, message: 'missing when:' });
  return {
    path,
    display: displayPath,
    layer,
    stem: basename(path, '.md'),
    team,
    extends: (front.extends?.value ?? '').split(',').map((s) => s.trim()).filter(Boolean),
    extendsLine: front.extends?.line ?? 1,
    source: front.source ?? null,
    front,
    edits: parsed.edits,
    notes: parsed.notes,
    prose: parsed.prose,
    body: parsed.body,
    problems,
    info: [],
    pstackName,
  };
}

/** Layer files in cascade order, plus team files that sit in no active layer (still checked). */
function collectFiles(ctx) {
  const active = [];
  const inactive = [];
  const team = mdFiles(ctx.repo.teamDir).map((name) => {
    const file = readLayerFile(join(ctx.repo.teamDir, name), ctx.repo.teamDisplay(name), null, true, ctx.pstack.name);
    const layer = file.front.layer?.value;
    if (!LAYERS[layer]?.team || !file.source?.value) file.problems.push({ line: 1, message: 'team file needs layer: and source:' });
    if (LAYERS[layer]?.team) {
      file.layer = layer;
      if (!ctx.order.includes(layer)) file.problems.push({ line: file.front.layer.line, message: `unknown layer ${layer}` });
    }
    return file;
  });
  for (const layer of ctx.order) {
    if (LAYERS[layer].team) {
      active.push(...team.filter((f) => f.layer === layer));
      continue;
    }
    const dir = LAYERS[layer].dir(ctx);
    for (const name of mdFiles(dir)) active.push(readLayerFile(join(dir, name), join(dir, name), layer, false, ctx.pstack.name));
  }
  inactive.push(...team.filter((f) => !ctx.order.includes(f.layer)));
  return { active, inactive, team };
}

/** Dangling symlinks in .agents/playbooks (top level) and anywhere under the config dir, each reported once. */
function brokenLinks(ctx) {
  const problems = [];
  const seen = new Set();
  const realDir = (dir) => {
    try {
      return realpathSync(dir);
    } catch {
      return dir;
    }
  };
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

/** Each playbook stem that some layer folder in the config holds for any org or repo, with the first such folder. */
function configStems(ctx) {
  const stems = new Map();
  for (const layer of ctx.order) {
    const [top, star, leaf] = LAYERS[layer].anywhere.split('/');
    const dirs = star ? listDir(join(ctx.configDir, top)).map((name) => join(top, name, leaf)) : [top];
    for (const dir of dirs) {
      for (const stem of mdFiles(join(ctx.configDir, dir)).map((name) => basename(name, '.md'))) if (!stems.has(stem)) stems.set(stem, dir);
    }
  }
  return stems;
}

function readBundled(ctx) {
  const dir = join(ctx.pstack.dir, PLAYBOOKS);
  return new Map(mdFiles(dir).map((f) => [basename(f, '.md'), parsePlaybook(readFileSync(join(dir, f), 'utf8'))]));
}

function analyze(ctx, { pstackCheck }) {
  const bundled = readBundled(ctx);
  const files = collectFiles(ctx);
  const playbooks = cascade(bundled, files.active, ctx.order);
  const layerFiles = [...files.active, ...files.inactive];
  const index = playbookIndex(ctx.pstack.dir, playbooks, layerFiles);
  const elsewhere = configStems(ctx);
  for (const file of layerFiles) {
    for (const { text, line } of file.prose) {
      for (const ref of handoffRefs(text, index)) {
        if (ref.stem) continue;
        const where = elsewhere.get(kebab(ref.name));
        if (where) file.info.push({ line, message: `hands off to ${ref.name}, which only ${where} defines` });
        else file.problems.push({ line, message: `hands off to ${ref.name}, which no layer or pstack defines` });
      }
    }
  }
  const links = brokenLinks(ctx);
  return { files, playbooks, index, links, pstackCheck: pstackCheck ? runPstackCheck(ctx, links.teamBroken) : null };
}

const fileProblems = (files, key = 'problems') => files.flatMap((f) => [...f[key]].sort((a, b) => a.line - b.line).map((p) => ({ path: f.display, ...p })));

const needsRecord = (ctx) => !ctx.pinned && ctx.settings && ctx.pstack.version && ctx.settings.pstack !== ctx.pstack.version;
// Swaps only the version text, so the user's own formatting of layers.json survives.
function record(ctx) {
  const text = readFileSync(ctx.settings.path, 'utf8');
  const value = JSON.stringify(ctx.pstack.version);
  const swapped = text.replace(/("pstack"\s*:\s*)"[^"]*"/, (_, key) => key + value);
  writeFileSync(ctx.settings.path, swapped !== text || ctx.settings.raw.pstack === ctx.pstack.version ? swapped : `${JSON.stringify({ ...ctx.settings.raw, pstack: ctx.pstack.version }, null, 2)}\n`);
}

function checkReport(ctx, analysis) {
  const layerFiles = [...analysis.files.active, ...analysis.files.inactive];
  const problems = [...ctx.configProblems, ...analysis.links.problems, ...fileProblems(layerFiles)];
  const info = fileProblems(layerFiles, 'info');
  const proposed = analysis.files.team.filter((f) => f.source?.value === 'proposed').map((f) => ({ path: f.display, line: f.source.line }));
  const passed = problems.length === 0 && analysis.pstackCheck.status !== 'failed';
  return { pstack: ctx.pstack.version, problems, info, proposed, pstackCheck: analysis.pstackCheck, passed };
}

const problemLine = (p) => `${p.path}:${p.line}: ${p.message}`;

function renderCheck(report, pstack) {
  const n = report.problems.length;
  return [
    ...(report.pstackCheck.status === 'skipped' ? [] : report.pstackCheck.lines),
    ...report.problems.map(problemLine),
    ...report.info.map((p) => `info: ${problemLine(p)}`),
    ...report.proposed.map((p) => `proposed: ${p.path}:${p.line}`),
    report.passed
      ? `check passed: pstack ${pstack}`
      : `check failed: ${n ? `${n} ${n === 1 ? 'problem' : 'problems'}` : "pstack's checker failed"} against pstack ${pstack}`,
  ].join('\n');
}

const checkJson = (report, recorded) => {
  const { passed, ...rest } = report;
  return { ...rest, recorded };
};

function runCheck(ctx, opts) {
  const report = checkReport(ctx, analyze(ctx, { pstackCheck: true }));
  const recorded = report.passed && needsRecord(ctx);
  if (recorded) record(ctx);
  return { out: opts.json ? checkJson(report, recorded) : renderCheck(report, ctx.pstack.name), status: report.passed ? 0 : 1 };
}

const headerParts = (ctx) => [ctx.repo.name, ctx.repo.owner ?? ctx.repo.org, `pstack ${ctx.pstack.name}`].filter(Boolean);

function renderCompute(r) {
  const sections = [`# ${r.playbook} (${r.header.join(' · ')})`];
  sections.push(
    r.steps
      .map((s, i) => {
        const [first, ...rest] = s.display.split('\n');
        return [`${i + 1}. ${first}   [${[s.origin, ...s.touched].join(' ~ ')}]`, ...rest].join('\n');
      })
      .join('\n'),
  );
  if (r.handoffs.length) {
    const where = (h) => [...(h.steps.length ? [`${h.steps.length > 1 ? 'steps' : 'step'} ${andList(h.steps)}`] : []), ...(h.inNotes ? ['notes'] : [])].join(', ');
    sections.push(['Hands off to:', ...r.handoffs.map((h) => `- ${h.playbook} (${where(h)})`)].join('\n'));
  }
  if (r.notes.length) sections.push(['Notes:', ...r.notes.map((n) => `- ${n.text}   [${n.layer}]`)].join('\n'));
  if (r.overrides.length) {
    const line = (o) => `- step ${o.step}: ${o.layer} ${o.verb === 'Replace' ? 'replaced' : 'added to'} "${o.quote}" (${o.origin}${o.over ? `, over ${o.over}` : ''})`;
    sections.push(['Overrides:', ...r.overrides.map(line)].join('\n'));
  }
  if (r.problems.length) sections.push(['Problems:', ...r.problems.map(problemLine)].join('\n'));
  const check = r.pstackCheck;
  sections.push(['pstack check-playbooks:', ...(check.status === 'ok' ? ['ok'] : check.lines)].join('\n'));
  return sections.join('\n\n');
}

function runCompute(ctx, opts, name) {
  const analysis = analyze(ctx, { pstackCheck: true });
  const pb = analysis.playbooks.get(name);
  if (!pb) throw new UsageError(`no playbook named ${name}`);
  if (needsRecord(ctx)) {
    const report = checkReport(ctx, analysis);
    if (!report.passed) return { out: opts.json ? checkJson(report, false) : renderCheck(report, ctx.pstack.name), status: 1 };
    record(ctx);
  }
  const touching = analysis.files.active.filter((f) => touches(f, name));
  const problems = [...ctx.configProblems, ...analysis.links.problems, ...fileProblems(touching)];
  const result = { playbook: name, ...computed(pb, ctx.order, analysis.index), problems, pstackCheck: analysis.pstackCheck };
  const status = problems.length || analysis.pstackCheck.status === 'failed' ? 1 : 0;
  if (!opts.json) return { out: renderCompute({ ...result, header: headerParts(ctx) }), status };
  const { repo } = ctx;
  return {
    out: {
      playbook: name,
      repo: repo.name,
      owner: repo.owner,
      org: repo.org,
      pstack: ctx.pstack.version,
      steps: result.steps.map(({ text, origin, touched }) => ({ text, origin, touched })),
      notes: result.notes,
      overrides: result.overrides,
      handoffs: result.handoffs,
      problems,
      pstackCheck: analysis.pstackCheck,
    },
    status,
  };
}

/** The file in `layer` that holds edits to `name`, or the path a new one takes. */
function editTarget(ctx, files, layer, name) {
  const existing = files.find((f) => f.layer === layer && touches(f, name));
  if (existing) return { path: existing.display, exists: true };
  const { repo } = ctx;
  if (layer === 'repo.standard') {
    if (!repo.teamDir) return { path: null, exists: false };
    const file = lexists(join(repo.teamDir, `${name}.md`)) ? `${repo.name}-${name}.md` : `${name}.md`;
    return { path: repo.teamDisplay(file), exists: false };
  }
  const dir = layer === 'org.standard' ? repo.org && join(ctx.configDir, 'orgs', repo.org, 'standard') : LAYERS[layer].dir(ctx);
  return { path: dir ? join(dir, `${name}.md`) : null, exists: false };
}

/** Why an edit in `layer` cannot anchor on `quote`, judged against the step as the layers below it leave it. */
function anchorProblem(ctx, bundled, layer, name, quote, origin) {
  if (layer === origin) return 'this layer wrote the step; change its text there';
  const below = ctx.order.slice(0, ctx.order.indexOf(layer));
  const pb = cascade(bundled, collectFiles(ctx).active.filter((f) => below.includes(f.layer)), below).get(name);
  if (!pb) return 'no layer below this one defines the playbook';
  const found = locate(pb, quote, LAYERS[layer].team);
  return found.step ? null : FAILURES[found.fail].message(quote, found.steps);
}

function runLocate(ctx, opts, name, quote) {
  const bundled = readBundled(ctx);
  const files = collectFiles(ctx).active;
  const pb = cascade(bundled, files, ctx.order).get(name);
  if (!pb) throw new UsageError(`no playbook named ${name}`);
  const found = locate(pb, quote, false);
  if (!found.step) return { out: FAILURES[found.fail].message(quote, found.steps), status: 1 };
  const { step } = found;
  const layers = ctx.order.map((layer) => {
    const target = editTarget(ctx, files, layer, name);
    const problem = target.path ? anchorProblem(ctx, bundled, layer, name, quote, step.origin) : `no ${layer.split('.')[0]} for this checkout`;
    return { layer, ...target, problem };
  });
  const n = pb.steps.indexOf(step) + 1;
  if (opts.json) {
    const { repo } = ctx;
    const head = { playbook: name, repo: repo.name, owner: repo.owner, org: repo.org, pstack: ctx.pstack.version };
    return { out: { ...head, step: n, text: effective(step), origin: step.origin, touched: step.touched, layers }, status: 0 };
  }
  const line = (l) => `- ${l.layer}: ${l.path ?? '(none)'} (${[l.exists ? 'exists' : 'new', l.problem].filter(Boolean).join('; ')})`;
  return {
    out: [
      `# ${name} step ${n} (${headerParts(ctx).join(' · ')})`,
      `${display(step)}   [${[step.origin, ...step.touched].join(' ~ ')}]`,
      ['Write the edit in:', ...layers.map(line)].join('\n'),
    ].join('\n\n'),
    status: 0,
  };
}

function runList(ctx, opts) {
  const { files, playbooks } = analyze(ctx, { pstackCheck: false });
  const rows = [...playbooks.values()]
    .sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))
    .map((pb) => ({
      name: pb.name,
      source: pb.origin,
      layers: Object.fromEntries(
        ctx.order.map((layer) => {
          if (pb.definedBy?.layer === layer) return [layer, 'defines'];
          const edits = files.active.some((f) => f.layer === layer && f.targets?.includes(pb.name));
          return [layer, edits ? 'edits' : 'none'];
        }),
      ),
    }));
  if (opts.json) {
    const { repo } = ctx;
    return { out: { repo: repo.name, owner: repo.owner, org: repo.org, pstack: ctx.pstack.version, layers: ctx.order, playbooks: rows }, status: 0 };
  }
  const nameWidth = Math.max('playbook'.length, ...rows.map((r) => r.name.length)) + 2;
  const sourceWidth = Math.max('source'.length, ...rows.map((r) => label(r.source).length)) + 2;
  const labels = ctx.order.map(label);
  const cell = (text, width) => (' '.repeat(Math.floor((width - 1) / 2)) + text).padEnd(width);
  const [repoName, ...rest] = headerParts(ctx);
  const header = ctx.repo.name ? `${repoName} (${rest.join(' · ')})` : `(${repoName})`;
  const lines = [
    header,
    `${'playbook'.padEnd(nameWidth)}${'source'.padEnd(sourceWidth)}${labels.join('  ')}`,
    ...rows.map((r) => `${r.name.padEnd(nameWidth)}${label(r.source).padEnd(sourceWidth)}${ctx.order.map((l, i) => cell(CELLS[r.layers[l]], labels[i].length)).join('  ')}`),
    `${CELLS.defines} defines  ${CELLS.edits} edits  ${CELLS.none} untouched`,
  ];
  return { out: lines.map((l) => l.trimEnd()).join('\n'), status: 0 };
}

const SCRIPT = fileURLToPath(import.meta.url);
const README = fileURLToPath(new URL('../../../README.md', import.meta.url));
const SELF_BIN = fileURLToPath(new URL('../../../bin/jstack-cli', import.meta.url));
const MARKS = { ok: '✓', fail: '✗', info: '-' };
const TEAM_EXCLUDE = '/.agents/playbooks';

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

/** True when the command at `path` resolves to the bin/jstack-cli of a jstack checkout or install. */
const isJstack = (path) => {
  const real = realOr(path);
  return Boolean(real) && isFile(join(dirname(real), '..', 'skills', 'playbook', 'scripts', 'jstack.mjs'));
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
 * commands; every other harness gets each README row printed, because jstack cannot run its installer.
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
    if (!rows) return [showFix('see https://github.com/JawsomeJason/jstack#install-and-set-up-jstack')];
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
    const env = process.env.JSTACK_PSTACK_DIR;
    if (env) return { finding: finding('pstack', 'fail', `JSTACK_PSTACK_DIR=${env} holds no pstack`, { fixes: [showFix('unset JSTACK_PSTACK_DIR, or set it to the folder that holds skills/poteto-mode')] }) };
    return { finding: finding('pstack', 'fail', 'pstack-claude not found', { fixes: h.fixes(1, { run: true }) }) };
  }
}

function checkPlugin(h) {
  if (h.claude) {
    const plugins = h.claudeJson(['plugin', 'list', '--json']);
    if (!Array.isArray(plugins)) return finding('plugin', 'fail', 'claude plugin list --json failed', { fixes: [showFix('claude plugin list --json')] });
    const jstack = plugins.find((p) => typeof p.id === 'string' && p.id.startsWith('jstack@'));
    if (jstack) return finding('plugin', 'ok', `jstack ${jstack.version} installed in Claude Code (${jstack.scope} scope)`);
    return finding('plugin', 'fail', 'jstack is not installed in Claude Code', { fixes: h.fixes(2, { run: true }) });
  }
  for (const plugins of pluginDirs()) {
    const path = join(plugins, 'installed_plugins.json');
    let record;
    try {
      record = JSON.parse(readFileSync(path, 'utf8'));
    } catch {
      continue;
    }
    const [, installs] = Object.entries(record?.plugins ?? {}).find(([key]) => key.startsWith('jstack@')) ?? [];
    if (Array.isArray(installs) && installs.length) return finding('plugin', 'ok', `jstack ${installs[0].version} in ${path}`);
  }
  return finding('plugin', 'fail', 'jstack is not installed in any harness install record', { fixes: h.fixes(2, { run: false }) });
}

function checkCommands(h) {
  const clone = join(h.home, '.claude', 'plugins', 'marketplaces', 'jstack', 'bin', 'jstack-cli');
  const source = h.claude && isFile(clone) ? clone : SELF_BIN;
  const binDir = join(h.home, '.local', 'bin');
  const dest = join(binDir, 'jstack-cli');
  const link = sh('ln', '-s', source, dest);
  const out = [];
  const cli = onPath('jstack-cli');
  if (!cli) {
    const fixes = lexists(dest)
      ? []
      : [...(isDir(binDir) ? [] : [runFix(sh('mkdir', '-p', binDir))]), runFix(link)];
    if (!(process.env.PATH ?? '').split(delimiter).includes(binDir)) fixes.push(showFix(`add ${binDir} to PATH`));
    out.push(finding('cli', 'fail', 'jstack-cli is not on PATH', { fixes }));
  } else if (!isJstack(cli)) {
    out.push(finding('cli', 'fail', `jstack-cli on PATH is ${cli}, which is not jstack's`, { fixes: [showFix(`move ${cli} aside, then: ${link}`)] }));
  } else {
    const real = realOr(cli);
    out.push(finding('cli', 'ok', `jstack-cli: ${cli}${real === cli ? '' : ` -> ${real}`}`));
  }
  const java = onPath('jstack');
  if (java && !isJstack(java)) out.push(finding('jstack', 'info', `jstack on PATH is ${java}, not jstack-cli; type jstack-cli to run jstack`));
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
  if (!settings) return { finding: finding('config', 'fail', `${join(configDir, 'layers.json')} is missing`, setup()) };
  const { handle } = settings.raw;
  if (typeof handle !== 'string' || !handle) return { settings, finding: finding('config', 'fail', `${settings.path} has no handle`, setup()) };
  return { settings, handle, finding: finding('config', 'ok', `config ${configDir}: layers.json parses, handle ${handle}`) };
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

/** One repo's team link and exclude line, in the checkout layers.json records or else the current one. */
function checkRepo(h, configDir, settings, name, here) {
  const id = `repo:${name}`;
  const recorded = settings.repos[name]?.checkout;
  const path = recorded ?? (here?.name === name ? here.root : null);
  if (!path) return { finding: finding(id, 'info', `${name}: no checkout known; set repos.${name}.checkout in layers.json, or run doctor from the checkout`) };
  const checkout = isDir(path) ? findCheckout(path) : null;
  if (!checkout) return { finding: finding(id, 'fail', `${name}: ${path} is not a git checkout`, { fixes: h.fixes(5, { run: false }) }) };
  const { root } = checkout;
  const team = join(configDir, 'repos', name, 'team');
  const link = join(root, '.agents', 'playbooks');
  const exclude = join(gitOut(root, ['rev-parse', '--path-format=absolute', '--git-common-dir']), 'info', 'exclude');
  const problems = [];
  const fixes = [];
  if (!lexists(link)) {
    problems.push(`${link} is missing`);
    if (!isDir(dirname(link))) fixes.push(runFix(sh('mkdir', '-p', dirname(link))));
    fixes.push(runFix(sh('ln', '-s', team, link)));
  } else if (realOr(link) !== realOr(team)) {
    problems.push(`${link} does not link to ${team}`);
    fixes.push(showFix(`move ${link} aside, since it may hold the repo's own playbooks, then: ${sh('ln', '-s', team, link)}`));
  }
  const excluded = isFile(exclude) && readFileSync(exclude, 'utf8').split('\n').includes(TEAM_EXCLUDE);
  if (!excluded) {
    problems.push(`${exclude} does not hide ${TEAM_EXCLUDE}`);
    if (!isDir(dirname(exclude))) fixes.push(runFix(sh('mkdir', '-p', dirname(exclude))));
    fixes.push(runFix(`echo ${TEAM_EXCLUDE} >> ${shellQuote(exclude)}`));
  }
  if (problems.length) return { root, finding: finding(id, 'fail', `${name}: ${problems.join('; ')}`, { fixes }) };
  return { root, finding: finding(id, 'ok', `${name}: ${link} links to ${team}, and ${exclude} hides it`) };
}

/** Runs `jstack-cli check` pinned to the resolved pstack, so it reads the same files and records nothing. */
function checkRun(repo, cwd, pstackDir) {
  const label = repo ? `jstack-cli check --repo ${repo}` : 'jstack-cli check';
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
  const repos = config.settings ? listDir(join(configDir, 'repos')).filter((name) => isDir(join(configDir, 'repos', name))) : [];
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
  for (const f of findings.filter((x) => x.status === 'fail' && x.fixes.some((fix) => fix.run))) {
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
  const fixable = findings.some((f) => f.status === 'fail' && f.fixes.some((fix) => fix.run));
  if (!opts.fix || !fixable) return { out: report, status: status(findings) };
  if (!process.stdin.isTTY) return { out: `${report}\nfixes not run: no terminal to ask on`, status: status(findings) };
  process.stdout.write(`${report}\n`);
  applyFixes(findings);
  const after = diagnose();
  return { out: `\nafter fixes:\n${renderDoctor(after)}`, status: status(after) };
}

const COMMANDS = {
  'playbook list': { arity: 0, run: (opts) => runList(loadContext(opts), opts) },
  'playbook compute': { arity: 1, run: (opts, [name]) => runCompute(loadContext(opts), opts, name) },
  'playbook locate': { arity: 2, run: (opts, [name, quote]) => runLocate(loadContext(opts), opts, name, quote) },
  check: { arity: 0, run: (opts) => runCheck(loadContext(opts), opts) },
  doctor: { arity: 0, run: (opts) => runDoctor(opts) },
};

function parseArgs(argv) {
  const opts = { json: false, fix: false, help: false, repo: null, pstack: null };
  const words = [];
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--json') opts.json = true;
    else if (arg === '--fix') opts.fix = true;
    else if (arg === '--help' || arg === '-h') opts.help = true;
    else if (arg === '--repo' || arg === '--pstack') {
      const value = argv[++i];
      if (!value || value.startsWith('-')) throw new UsageError(`${arg} needs a value`, { usage: true });
      opts[arg.slice(2)] = value;
    } else if (arg.startsWith('-')) throw new UsageError(`unknown option ${arg}`, { usage: true });
    else words.push(arg);
  }
  if (opts.help) return { opts };
  const split = words[0] === 'playbook' ? 2 : 1;
  const command = COMMANDS[words.slice(0, split).join(' ')];
  const args = words.slice(split);
  if (!command || args.length !== command.arity) throw new UsageError('', { usage: true });
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
    return 2;
  }
}

process.exitCode = main(process.argv.slice(2));
