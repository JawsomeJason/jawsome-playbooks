# Layers, files and the cascade

## Config dir

The config dir is `$JSTACK_CONFIG`, or `.jstack` in the home directory. It is private to one user, so it can hold company rules that a public repo cannot.

```
<config>/
├── layers.json
├── user/*.md                      layer user
├── orgs/<org>/standard/*.md       team files with layer org.standard
├── orgs/<org>/overrides/*.md      layer org.overrides
└── repos/<repo>/
    ├── team/*.md                  what the repo's .agents/playbooks shows: per-file links
    │                                to ../../../orgs/<org>/standard/<f>.md, plus real
    │                                files with layer repo.standard
    └── overrides/*.md             layer repo.overrides
```

Org standard files exist once, and each repo's `team/` folder links to them, so two repos cannot drift apart on an org rule.

## layers.json

```json
{
  "handle": "sam",
  "modeTrigger": "manual",
  "pstack": "1.2.3",
  "layers": ["user", "org.standard", "org.overrides", "repo.standard", "repo.overrides"],
  "orgs": { "acme": { "owners": ["acme-eng"] } }
}
```

- `layers` is the cascade order, lowest first. A later layer wins, as in CSS cascade layers, so a personal override of a team rule sits above it.
- `orgs` maps an org name to the forge owners whose repos belong to it. A repo whose owner is in no list gets no org layers.
- `pstack` is the version the layers last passed `check` against. jstack records it and never pins it.
- `handle` and `modeTrigger` are the setup skill's answers, kept so a rerun offers them as defaults.

## Playbook file format

pstack's project-playbook format, plus two keys pstack ignores:

```markdown
---
extends: babysit
when: one sentence naming the requests it serves
layer: org.standard
source: proposed
---

- **After** "Work the merge frontier" Read the default branch's ruleset first.
- A list item with no verb is a note for the playbook.
```

- `extends`: bundled pstack playbook stems, comma-separated. Empty makes a standalone playbook whose numbered steps are its body.
- `when`: required, because poteto-mode matches a standalone playbook only by this sentence.
- `layer`: required in team files, `org.standard` or `repo.standard`. Every other file takes its layer from its folder.
- `source`: required in team files. `proposed`, or a citation of the rule's origin, so a teammate can trace each team rule. `check` lists every `proposed` one.
- An edit line is a list item (`-`, `*` or `N.`), then `**After**`, `**Before**`, `**Replace**` or `**In**`, then a straight-double-quoted anchor, then the change text. It is the same grammar pstack's `check-playbooks.mjs` reads, so team files stay valid for pstack alone.

## Repo and org resolution

- The repo is the main checkout of the current directory, found through `git rev-parse --git-common-dir`, so a worktree resolves to the checkout that holds `.agents/playbooks`.
- Its key is the name part of `git remote get-url origin`, and its owner the part before it. `--repo <name>` overrides the key.
- Team files come from `<main checkout>/.agents/playbooks/*.md` when it exists, top level only as pstack reads it, else from `<config>/repos/<repo>/team/`. Outside a checkout the org comes from where the team folder's links point.

## Cascade

1. The bundled playbook splits into steps. A line `N. ` at column 0 starts a step, and the lines after it belong to it until the next step or a blank line followed by a non-indented line. A playbook with no numbered steps takes each paragraph that opens with a bold lead sentence as a step. Other text is intro, which no edit may anchor on.
2. Each layer, in `layers` order, applies its files in name order, and each file's edits in line order. A file applies to a playbook when the playbook is in its `extends`, or when its stem names a playbook that pstack or a lower layer defines.
3. Anchors match with whitespace collapsed, against the steps as the lower layers left them. Team files match only pstack's own text, because pstack's checker reads them without the other layers.
4. `After` and `Before` insert a new step. `Replace` swaps the anchor's words inside the step. `In` appends the change text to the step. A line with no verb becomes a note.
5. Each step records its origin layer and every layer that edited it. An `In` or `Replace` from a layer above the step's origin is an override, and `compute` lists it so the agent can name it in its reply.
