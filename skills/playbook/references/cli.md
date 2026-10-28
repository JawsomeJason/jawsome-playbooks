# jstack-cli reference

```sh
jstack-cli playbook list [--repo <repo>] [--json] [--pstack <dir-or-version>]
jstack-cli playbook compute <playbook> [--repo <repo>] [--json] [--pstack <dir-or-version>]
jstack-cli check [--repo <repo>] [--json] [--pstack <dir-or-version>]
jstack-cli --help
```

jstack-cli is `scripts/jstack.mjs` in this skill. It needs Node and nothing else. The plugin's `bin/jstack-cli` imports the script, so one symlink puts the command on `PATH`. The command is `jstack-cli`, not `jstack`, because Java development kits install a `jstack` of their own that can shadow it on `PATH`.

`--help` and `-h` print the usage and exit 0. Any other word in place of a command, such as `help`, prints the usage and exits 2.

## Options

| Option | Effect |
| --- | --- |
| `--repo <repo>` | Sets the repo key. When it differs from the current checkout's key, jstack-cli ignores the checkout and reads team files from `<config>/repos/<repo>/team/`. |
| `--json` | Prints JSON that follows the command's schema in [schemas/](schemas/). |
| `--pstack <dir-or-version>` | Uses that pstack instead of the one jstack-cli finds. It takes a folder, or a version next to the one in use or in any plugin cache. With this flag, jstack-cli never writes `layers.json`, so you can preview an upgrade. |

## Exit codes

| Code | Meaning |
| --- | --- |
| 0 | Clean. |
| 1 | A validator problem, or pstack's own checker failed. `compute` still prints the cascade, except when the `check` it runs after a pstack change fails. Then it prints the `check` result. |
| 2 | Bad usage, no pstack found, an unknown `--pstack` version, a `layers.json` that is not valid JSON or has the wrong shape, or an unknown playbook. The message goes to stderr. |

## Environment

| Variable | Value | Default |
| --- | --- | --- |
| `JSTACK_CONFIG` | The config dir. | `.jstack` in the home directory. |
| `JSTACK_PSTACK_DIR` | The pstack plugin folder, the one that holds `skills/poteto-mode/`. | The search order below. |

jstack-cli picks the pstack folder in this order, and uses the first one that holds poteto-mode's playbooks:

1. `JSTACK_PSTACK_DIR`.
2. The install record. jstack-cli reads `plugins/installed_plugins.json` in every dot-folder of the home directory and takes the `installPath` of each `pstack@<marketplace>` entry that has no `projectPath`. When several qualify, the highest version by semver wins. A harness loads the version its record names, and its cache keeps older and newer versions next to it, so the record is what keeps jstack-cli on the pstack the session runs.
3. The cache. jstack-cli looks in every dot-folder of the home directory for `plugins/cache/*/pstack/<version>/` and takes the highest version by semver.

Both searches use the layout that plugin harnesses share, so they find pstack without naming any one harness. A pstack in any other place needs `JSTACK_PSTACK_DIR`.

## compute

`compute` prints the playbook with every layer applied, as Markdown:

```
# babysit (web · acme-eng · pstack 1.2.3)

1. Check the team's merge calendar.   [org.standard]
2. **Stop at the human's line.** ~~Never merge~~ Merge once green.   [pstack ~ user]
```

The heading names the repo, the forge owner or else the org, and the pstack version. Each step ends with its origin layer, then `~` and each layer that edited it. Struck text is what a `Replace` removed.

These sections follow the steps, each only when it has entries, in this order:

- `Hands off to:` lists each other playbook that the steps or notes send the work to. Each line gives the playbook stem and where it appears, such as `- opening-a-pr (step 8)` or `- shipping (notes)`.
- `Notes:` lists each note with its layer.
- `Overrides:` lists each override, such as `- step 6: user replaced "Never merge" (pstack)`.
- `Problems:` lists each problem in `layers.json`, in a symlink, or in a layer file that touches this playbook.

`pstack check-playbooks:` comes last, with pstack's own checker result, or `ok`. `--json` prints the same data, shaped by [schemas/jstack.compute.schema.json](schemas/jstack.compute.schema.json).

When the installed pstack differs from the `pstack` in `layers.json`, `compute` runs `check` first. A pass records the new version. A failure stops with exit 1, because an upgrade that moved the quoted text would otherwise apply edits in the wrong place.

## list

`list` prints a table of every bundled and standalone playbook, with the layer that defines it and one column per active layer. In a layer column, `●` means the layer defines the playbook, `+` means it edits it, and `·` means it leaves it alone. `--json` follows [schemas/jstack.list.schema.json](schemas/jstack.list.schema.json).

## check

`check` runs pstack's `check-playbooks.mjs` from the repo root when the repo has `.agents/playbooks`, and passes its lines through. Then it checks every layer file and prints `<path>:<line>: <message>`:

| Rule | Message |
| --- | --- |
| frontmatter has `when` | `missing when:` |
| each `extends` stem is a pstack playbook | `extends <x>, which pstack <ver> has no playbook for` |
| team file has `layer` in {org.standard, repo.standard} and `source` | `team file needs layer: and source:` |
| each layer is a known layer and listed in `layers.json` | `unknown layer <x>` |
| an edit line's quote is in straight double quotes | `a change has no straight-quoted step text to anchor on` |
| quote matches a step | `quote not found: "<q>"` |
| quote matches only 1 step | `quote matches steps <a> and <b>; make it longer` |
| quote is in a numbered step, not intro text | `quote is outside a numbered step` |
| team file quote is pstack's text | `team files may quote pstack only` |
| the file defining a standalone playbook has no edit lines | `standalone playbook cannot carry edits` |
| no symlink in the config dir or `.agents/playbooks` is dangling | `broken link -> <target>` |
| each handoff names a playbook that a layer or pstack defines | `hands off to <x>, which no layer or pstack defines` |

A handoff is a `playbooks/<stem>.md` path, or a playbook named right after `run`, `per`, `route ... to`, or `hand ... to`, as a bold title, a capitalized title, or a kebab-case stem. A title resolves to a stem the way poteto-mode resolves it: kebab case, hyphens kept, other punctuation dropped. A bold name that is a poteto-mode section or skill, such as **Comments**, is not a handoff. `check` reads only text that a layer file wrote, never the pstack words an edit quotes, because pstack owns its own text.

`check` also prints `proposed: <path>:<line>` for each team file whose `source` is `proposed`, then `check passed: pstack <ver>` or `check failed: ...`. `--json` follows [schemas/jstack.check.schema.json](schemas/jstack.check.schema.json). Without `--pstack`, a pass records the checked version in `layers.json` when that file exists.
