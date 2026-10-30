# Layers, files, and the cascade

## Config dir

The config dir is `$JSTACK_CONFIG`, or `.jstack` in the home directory. It belongs to one operator. Org layers are optional. With no `orgs` entry, or in a repo that no org owns, the cascade is user, repo.standard, and repo.overrides. Without a config dir, jstack-cli applies no layers and prints pstack's playbooks as they are.

```
<config>/
├── 01-user/*.md                         layer user
├── 02-orgs/<org>/
│   ├── 01-standard/*.md                 team files with layer org.standard
│   └── 02-overrides/*.md                layer org.overrides
├── 03-repos/<repo>/
│   ├── 01-team/*.md                     what the repo's .agents/playbooks shows: per-file links
│   │                                      to ../../../02-orgs/<org>/01-standard/<f>.md, plus real
│   │                                      files with layer repo.standard
│   └── 02-overrides/*.md                layer repo.overrides
└── config.json
```

Each folder's number is its rank among its siblings, so the tree read top to bottom is the cascade order, lowest first. A later layer wins, as in CSS cascade layers, so the operator's `02-overrides/` files sit above the team files they change. The order is fixed. `check` reports a `layers` key in `config.json`, and a config folder that still uses the unnumbered names `user/`, `orgs/` or `repos/`, and names the rename. A config dir that still holds the older `layers.json` fails with the rename to `config.json`.

Each org standard file exists once, and each repo's `01-team/` folder links to it, so two repos cannot drift apart on an org rule.

## config.json

```json
{
  "handle": "sam",
  "modeTrigger": "manual",
  "pstack": "1.2.3",
  "orgs": { "acme": { "owners": ["acme-eng"] } },
  "repos": { "web": { "checkout": "/home/sam/code/web" } }
}
```

- `orgs` maps an org name to the forge owners whose repos belong to it. A repo whose owner is in no list gets no org layers.
- `pstack` is the version that the layers last passed `check` against. jstack-cli records it and never pins it.
- `repos` maps a repo key to its main checkout. The `setup` skill records it when it links the repo, and `playbook doctor` reads it to check the repo's link from any directory. The cascade does not read it.
- `telemetry` is `true` to log each playbook `compute` reads, as the [jstack-cli reference](cli.md#compute) describes. It is off when missing, because a log of what the operator works on is theirs to turn on.
- `handle` and `modeTrigger` are the `setup` skill's answers. They stay in the file so that a rerun of `setup` offers them as defaults.

## Playbook file format

A layer file uses pstack's project-playbook format, plus two keys that pstack ignores:

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

- `extends` lists bundled pstack playbook stems, separated by commas. An `extends` stem may also name a standalone playbook that a lower layer defines. A file with an empty `extends` and a stem that names no lower playbook defines a standalone playbook, whose numbered steps are its body.
- `when` is required, because poteto-mode matches a standalone playbook only by this sentence.
- `layer` is required in team files, and is `org.standard` or `repo.standard`. Every other file takes its layer from its folder.
- `source` is required in team files. It is `proposed`, or a citation of where the file's rules come from, so a teammate can trace each one. `check` lists every `proposed` one.
- An edit line is a list item (`-`, `*`, or `N.`), then `**After**`, `**Before**`, `**Replace**`, or `**In**`, then a quote in straight double quotes, then the change text. pstack's `check-playbooks.mjs` reads the same grammar, so team files stay valid for pstack alone.

## Repo and org resolution

- The repo is the main checkout of the current directory, which jstack-cli finds through `git rev-parse --git-common-dir`. A worktree therefore resolves to the checkout that holds `.agents/playbooks`.
- The repo key is the name part of `git remote get-url origin`, and the owner is the part before it. A repo with no `origin` remote uses the checkout folder's name as its key. `--repo <name>` overrides the key.
- Team files come from `<main checkout>/.agents/playbooks/*.md` when that folder exists, at the top level only, as pstack reads it. Otherwise they come from `<config>/03-repos/<repo>/01-team/`.
- The org is the `orgs` entry that lists the repo's owner. When no entry lists it and the team files come from the config dir, the org is the one whose `01-standard/` folder the team folder's links point into.

## Cascade

1. The bundled playbook splits into steps. A line `N. ` at column 0 starts a step. The lines after it belong to that step until the next step, or until a blank line followed by a line with no indent. A playbook with no numbered steps takes each paragraph that opens with a bold lead sentence as a step. Other text is intro, and no quote may match in it.
2. Each layer, in cascade order, applies its files in name order, and applies each file's edits in line order. A file applies to a playbook when the playbook is in its `extends`, or, deprecated, when the file's stem names a playbook that pstack or a lower layer defines. `check` prints an `info:` line for a file that relies on its stem alone; write the stem in `extends` instead, because a later release stops reading file names.
3. Quotes match with whitespace collapsed, against the steps as the lower layers left them. Team files match only pstack's own text, because pstack's checker reads them without the other layers.
4. `After` and `Before` insert a new step. `Replace` strikes the quoted words inside the step and adds the change text after them. `In` appends the change text to the step. A line with no verb becomes a note.
5. Each step records its origin layer and every layer that edited it. An `In` or `Replace` from a layer above the step's origin is an override, and `compute` lists it so the agent can name it in its reply.
