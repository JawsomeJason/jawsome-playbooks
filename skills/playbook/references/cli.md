# jstack CLI

```sh
jstack playbook list [--repo <repo>] [--json] [--pstack <dir-or-version>]
jstack playbook compute <playbook> [--repo <repo>] [--json] [--pstack <dir-or-version>]
jstack check [--repo <repo>] [--json] [--pstack <dir-or-version>]
```

The script is `scripts/jstack.mjs` in this skill. It needs Node and nothing else. The plugin's `bin/jstack` links to it, so a user can put the command on `PATH` with one symlink.

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

Without `JSTACK_PSTACK_DIR`, jstack looks in every dot-folder of the home directory for `plugins/cache/*/pstack/<version>/` and takes the highest version by semver. That layout is how plugin caches store versioned plugins, so the search finds pstack without naming any one harness. Set the variable when pstack lives anywhere else.

`--pstack` takes a folder, or a version installed next to the one in use. It never writes `layers.json`, so you can preview an upgrade.

## compute

Prints the playbook with every layer applied, as Markdown:

```
# babysit (web · acme-eng · pstack 1.2.3)

1. Check the team's merge calendar.   [org.standard]
2. **Stop at the human's line.** ~~Never merge~~ Merge once green.   [pstack ~ user]
```

Each step ends with its origin layer, then `~` and each layer that edited it. Struck text is what a `Replace` removed. `Notes:`, `Overrides:` and `Problems:` follow when they have entries, and `pstack check-playbooks:` comes last with pstack's own checker result. `--json` prints the same data, shaped by [schemas/jstack.compute.schema.json](schemas/jstack.compute.schema.json).

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

It also prints `proposed: <path>:<line>` for each team file whose `source` is `proposed`. `--json` follows [schemas/jstack.check.schema.json](schemas/jstack.check.schema.json). Without `--pstack`, a pass records the checked version in `layers.json`.
