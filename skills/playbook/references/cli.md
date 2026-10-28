# jstack CLI

```sh
jstack-cli playbook list [--repo <repo>] [--json] [--pstack <dir-or-version>]
jstack-cli playbook compute <playbook> [--repo <repo>] [--json] [--pstack <dir-or-version>]
jstack-cli check [--repo <repo>] [--json] [--pstack <dir-or-version>]
```

The script is `scripts/jstack.mjs` in this skill. It needs Node and nothing else. The plugin's `bin/jstack-cli` imports it, so a user can put the command on `PATH` with one symlink. The command is `jstack-cli`, not `jstack`, because Java development kits install a `jstack` of their own that can shadow it on `PATH`.

## Exit codes

| Code | Meaning |
| --- | --- |
| 0 | Clean. |
| 1 | A validator problem, or pstack's own checker failed. `compute` still prints the cascade. |
| 2 | Bad usage, no pstack found, an unreadable `layers.json`, or an unknown playbook. |

## Environment

| Variable | Use |
| --- | --- |
| `JSTACK_CONFIG` | Config dir. Default `.jstack` in the home directory. |
| `JSTACK_PSTACK_DIR` | The pstack plugin folder, the one that holds `skills/poteto-mode/`. |

jstack picks the pstack folder in this order, and uses the first one that holds poteto-mode's playbooks:

1. `JSTACK_PSTACK_DIR`.
2. The install record. jstack reads `plugins/installed_plugins.json` in every dot-folder of the home directory and takes the `installPath` of each `pstack@<marketplace>` entry that has no `projectPath`. When several qualify, the highest version by semver wins. A harness loads the version its record names, and its cache keeps older and newer versions next to it, so the record is what keeps jstack on the pstack the session runs.
3. The cache. jstack looks in every dot-folder of the home directory for `plugins/cache/*/pstack/<version>/` and takes the highest version by semver.

Both searches use the layout plugin harnesses share, so they find pstack without naming any one harness. Set the variable when pstack lives anywhere else.

`--pstack` takes a folder, or a version installed next to the one in use. It never writes `layers.json`, so you can preview an upgrade.

## compute

Prints the playbook with every layer applied, as Markdown:

```
# babysit (web · acme-eng · pstack 1.2.3)

1. Check the team's merge calendar.   [org.standard]
2. **Stop at the human's line.** ~~Never merge~~ Merge once green.   [pstack ~ user]
```

Each step ends with its origin layer, then `~` and each layer that edited it. Struck text is what a `Replace` removed. `Hands off to:` follows when the steps or notes send the work to another playbook, one line per playbook stem with the steps that name it, such as `- opening-a-pr (step 8)`. Compute each of those playbooks too, because their own layers change their steps. `Notes:`, `Overrides:` and `Problems:` follow when they have entries, and `pstack check-playbooks:` comes last with pstack's own checker result. `--json` prints the same data, shaped by [schemas/jstack.compute.schema.json](schemas/jstack.compute.schema.json).

When the installed pstack differs from `layers.json`'s `pstack`, `compute` runs `check` first. A pass records the new version, and a failure stops with exit 1, because an upgrade that moved the quoted text would otherwise apply edits in the wrong place.

## list

A table of every bundled and standalone playbook, with one column per layer: `●` defines it, `+` edits it, `·` leaves it alone. `--json` follows [schemas/jstack.list.schema.json](schemas/jstack.list.schema.json).

## check

Runs pstack's `check-playbooks.mjs` from the repo root when the repo has `.agents/playbooks`, and passes its lines through. Then it checks every active layer file and prints `<path>:<line>: <message>`:

| Rule | Message |
| --- | --- |
| frontmatter has `when` | `missing when:` |
| each `extends` stem is a pstack playbook | `extends <x>, which pstack <ver> has no playbook for` |
| team file has `layer` in {org.standard, repo.standard} and `source` | `team file needs layer: and source:` |
| layer is listed in layers.json | `unknown layer <x>` |
| anchor matches no step | `quote not found: "<q>"` |
| anchor matches 2 or more steps | `quote matches steps <a> and <b>; make it longer` |
| anchor is only in intro text | `quote is outside a numbered step` |
| team file anchor is not pstack's text | `team files may quote pstack only` |
| the file defining a standalone playbook has edit lines | `standalone playbook cannot carry edits` |
| a symlink in the config dir or `.agents/playbooks` is dangling | `broken link -> <target>` |
| a layer file hands off to a playbook that no layer or pstack defines | `hands off to <x>, which no layer or pstack defines` |

A handoff is a `playbooks/<stem>.md` path, or a playbook named right after `run`, `per`, `route ... to` or `hand ... to`, as a bold title, a capitalized title or a kebab-case stem. A title resolves to a stem the way poteto-mode resolves it: kebab case, hyphens kept, other punctuation dropped. A bold name that is a poteto-mode section or skill, such as **Comments**, is not a handoff. Only text a layer file wrote is checked, never the pstack words an edit quotes, because pstack owns its own text.

It also prints `proposed: <path>:<line>` for each team file whose `source` is `proposed`. `--json` follows [schemas/jstack.check.schema.json](schemas/jstack.check.schema.json). Without `--pstack`, a pass records the checked version in `layers.json`.
