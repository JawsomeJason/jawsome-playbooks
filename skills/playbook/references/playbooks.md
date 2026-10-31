# Playbook files, families, and order

Each rule is tagged **[pstack-claude]** when pstack-claude provides it, so a teammate without jawsome-playbooks gets it too, or **[jawsome-playbooks]** when only jawsome-playbooks does. An agent reading a team file assumes only the [pstack-claude] rules apply. [ADR-0001](../../../docs/adr/0001-extends-chains-replace-layers.md) records why.

## Where files are found

- **Team files** are `<main checkout>/.agents/playbooks/*.md`, top level only. A pull request changes them. [pstack-claude] The repo is the main checkout of the current directory, so a worktree reads its main checkout's team files, and `--repo <repo>` reads the checkout `config.json` records. [jawsome-playbooks]
- **User files** sit in the config dir, `$PLAYBOOKS_CONFIG` or `.jawsome-playbooks` in the home directory. [jawsome-playbooks]

  ```
  <config>/
  ├── config.json
  ├── playbooks/*.md                 active in every context
  ├── playbooks/orgs/<org>/*.md      active in a checkout whose owner config.json maps to <org>
  └── playbooks/repos/<repo>/*.md    active in the checkout whose repo key is <repo>
  ```

  A scope folder says where a file is active, never its order. A file whose parent exists only in some contexts needs none: elsewhere it is dormant.
- The repo key is the name part of `git remote get-url origin`, and the owner is the part before it. A repo with no `origin` uses its folder name. [jawsome-playbooks]

## config.json

```json
{ "handle": "sam", "modeTrigger": "manual", "pstack": "1.2.3", "telemetry": false,
  "orgs": { "acme": { "owners": ["acme-eng"] } }, "repos": { "web": { "checkout": "/home/sam/code/web" } } }
```

`orgs` maps an org to its forge owners and selects `playbooks/orgs/<org>/`. `repos` records each main checkout, so `check` and `doctor` find team files from any directory. `pstack` is the version the files last passed `check` against; jawsome-playbooks records it and never pins it. `telemetry` turns on the [read log](cli.md#compute). `handle` names the mode skill and is the default file-name qualifier. [jawsome-playbooks]

## File format

```markdown
---
extends: babysit
when: one sentence naming the requests it serves
---

- **After** "Work the merge frontier" Read the default branch's ruleset first.
- A list item with no verb is a note.
```

- `extends` names parents by stem, separated by commas, and patches them in place. [pstack-claude] An empty `extends` with numbered steps is a standalone playbook. [pstack-claude]
- `when` is required. poteto-mode finds a standalone playbook only by it. [pstack-claude]
- An edit line is a list item, a bold verb (`After`, `Before`, `Replace`, `In`), a quote in straight double quotes, then the change text. [pstack-claude] `After` and `Before` insert a step, `Replace` strikes the quoted words and adds the change after them, and `In` appends to the step. [pstack-claude]
- A team file extends only bundled stems, and quotes only bundled text. [pstack-claude] A user file may extend any bundled playbook, any active team file, or any active user file, so only user files form chains. [jawsome-playbooks]
- `layer:` and the numbered folders (`01-user/`, `02-orgs/`, `03-repos/`) are retired, and `check` fails them. `source:` is a team review convention that jawsome-playbooks ignores. [jawsome-playbooks]

## Names

1. Every stem is unique: no file takes a bundled stem, and no two files active in one context share one. [jawsome-playbooks]
2. A team file carries its scope word, the org name or repo key, as one hyphen-separated word, such as `opening-a-roobet-pr`. `check` reports a missing one as info. [jawsome-playbooks]
3. A user file that derives from a parent is `<parent>-<qualifier>`: the handle, the org or repo key, or a word for a variant. A standalone playbook is named for the work. [jawsome-playbooks]

## Resolution

1. A **root** is a bundled playbook or a standalone playbook. A file with an `extends` is a **patch**, and never becomes its own step list. [pstack-claude]
2. A root's **family** is the root and every active file that reaches it through `extends`. A file with several parents belongs to each one's family. [pstack-claude] for team files, [jawsome-playbooks] across chains.
3. A file is active only where every parent it names is active. A parent defined only in another context makes the file **dormant**, which `check` reports as info. [jawsome-playbooks]
4. Any member's name resolves to its root: `playbook show opening-a-roobet-pr` prints the `opening-a-pr` family. [jawsome-playbooks]
5. The bundled playbook splits into steps. A line `N. ` at column 0 starts a step, which runs until the next step or a blank line followed by an unindented line. A playbook with no numbered steps takes each paragraph with a bold lead as a step. Other text is intro, and no quote may match there. [jawsome-playbooks]
6. Members apply in topological order, parents first. Ties break team files before user files, then by stem. [jawsome-playbooks] Each file applies its edits in line order. [jawsome-playbooks]
7. A quote matches, whitespace collapsed, only the text the file's ancestors wrote, never a sibling's. [jawsome-playbooks], generalizing pstack-claude's rule that team quotes match only bundled text. The result does not depend on the order siblings are read in.
8. **Siblings** share a parent and neither descends from the other. Both apply. [pstack-claude] for team files, [jawsome-playbooks] for the rest. Their `In` and `After` text lands in apply order. Two siblings that `Replace` the same words fail `check`; make one extend the other. [jawsome-playbooks]
9. Every step records the stem that wrote it and each stem that edited it. An `In` or `Replace` on a step a different file wrote is an override, which `show` lists for the agent to name. [jawsome-playbooks]
10. A handoff names a playbook by stem or title and resolves to its root's family. [jawsome-playbooks]

## Check

| Check | Result | Provenance |
|---|---|---|
| `check-playbooks.mjs` passes on `.agents/playbooks` | fail | [pstack-claude] |
| Team file extends a non-bundled stem, or quotes text no bundled parent has | fail | [pstack-claude] |
| Missing `when` | fail | [pstack-claude] |
| An `extends` stem that no context defines | fail | [jawsome-playbooks] |
| An `extends` stem defined only in another context | info: dormant here | [jawsome-playbooks] |
| A cycle among user files, self-extension included | fail, naming the cycle | [jawsome-playbooks] |
| A stem that is bundled, or that another active file uses | fail, with a rename hint | [jawsome-playbooks] |
| A quote that matches no step, or several, in what its ancestors leave | fail, naming the file that wrote it when that file is no ancestor | [jawsome-playbooks] |
| Sibling `Replace` edits on the same words | fail | [jawsome-playbooks] |
| A handoff or `<playbook> step N` that resolves to nothing | fail; a dormant target is info | [jawsome-playbooks] |
| A team file name without its scope word | info | [jawsome-playbooks] |
| `layer:` key, or a numbered config folder | fail | [jawsome-playbooks] |
| A standalone playbook with edit lines | fail | [jawsome-playbooks] |

[cli.md](cli.md#check) gives each message.

## Writing files

`playbook extend` and `playbook new` write user files only, in the folder `--scope` picks, and undo a write that adds a `check` problem. [jawsome-playbooks] Team files change through a pull request. [cli.md](cli.md#extend) and the README's hook section give the details.
