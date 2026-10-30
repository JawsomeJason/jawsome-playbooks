# playbook reference

```sh
playbook list [--repo <repo>] [--json] [--pstack <dir-or-version>]
playbook show <playbook> [--repo <repo>] [--json] [--pstack <dir-or-version>]
playbook locate <playbook> <quote> [--repo <repo>] [--json] [--pstack <dir-or-version>]
playbook extend <parent> <file-name> after|before|replace|in "<quote>" (--with <text|-> | --with-file <path>) [--when <sentence>] [--layer user|org|repo] [--repo <repo>] [--pstack <dir-or-version>]
playbook new <name> --when <sentence> --from-file <path|-> [--layer user|org|repo] [--repo <repo>] [--pstack <dir-or-version>]
playbook check [--repo <repo>] [--json] [--pstack <dir-or-version>]
playbook doctor [--fix | --json]
playbook --help
```

playbook is `scripts/jstack.mjs` in this skill. It needs Node and nothing else. The plugin's `bin/playbook` and `bin/jstack-cli` import the script, so one symlink each puts the commands on `PATH`. `show` is the main name of the command that prints a playbook, and `compute` stays as an alias of it. `jstack-cli` is a compatibility alias of `playbook`: it takes the same flags, and spells the playbook commands `jstack-cli playbook list|show|compute|locate|extend|new`, with `jstack-cli check` and `jstack-cli doctor` unchanged. The command is `playbook`, not `jstack`, because Java development kits install a `jstack` of their own that can shadow it on `PATH`.

`--help` and `-h` print the usage and exit 0. Any other word in place of a command, such as `help`, prints the usage and exits 2.

## Options

| Option | Effect |
| --- | --- |
| `--repo <repo>` | Sets the repo key. When it differs from the current checkout's key, jstack-cli ignores the checkout and reads team files from `<config>/03-repos/<repo>/01-team/`. |
| `--json` | Prints JSON that follows the command's schema in [schemas/](schemas/). |
| `--layer user\|org\|repo` | `extend` and `new` only. The layer to write in. It defaults to `user`. `org` and `repo` write to that scope's `02-overrides/`, for the org or repo of the current checkout. |
| `--with <text\|->`, `--with-file <path>` | `extend` only. The change text, from the argument, from stdin when it is `-`, or from a file. Give one. |
| `--when <sentence>` | `extend` when it creates a file, and `new`. The `when:` sentence. |
| `--from-file <path\|->` | `new` only. The numbered steps, from a file or stdin. |
| `--fix` | `doctor` only. Asks before each fix, then runs it. See [doctor](#doctor). |
| `--pstack <dir-or-version>` | Uses that pstack instead of the one jstack-cli finds. It takes a folder, or a version next to the one in use or in any plugin cache. With this flag, jstack-cli never writes `config.json`, so you can preview an upgrade. |

## Exit codes

| Code | Meaning |
| --- | --- |
| 0 | Clean. |
| 1 | A validator problem, a `locate` quote that names no step or more than one, pstack's own checker failed, or a `doctor` check failed. `compute` still prints the cascade, except when the `check` it runs after a pstack change fails. Then it prints the `check` result. |
| 2 | Bad usage, such as `--repo` or `--pstack` with `doctor`, or `--fix` with `--json` or with another command. No pstack found, an unknown `--pstack` version, a `config.json` that is not valid JSON or has the wrong shape, or an unknown playbook. The message goes to stderr. |

## Environment

| Variable | Value | Default |
| --- | --- | --- |
| `JSTACK_CONFIG` | The config dir. | `.jstack` in the home directory. |
| `JSTACK_PSTACK_DIR` | The pstack plugin folder, the one that holds `skills/poteto-mode/`. | The search order below. |
| `JSTACK_STATE` | The folder that holds `usage.jsonl`, the read log that `telemetry` turns on. | `jstack` in `$XDG_STATE_HOME`, else in `.local/state` in the home directory. |

jstack-cli picks the pstack folder in this order, and uses the first one that holds poteto-mode's playbooks:

1. `JSTACK_PSTACK_DIR`.
2. The install record. jstack-cli reads `plugins/installed_plugins.json` in every dot-folder of the home directory and takes the `installPath` of each `pstack@<marketplace>` entry that has no `projectPath`. When several qualify, the highest version by semver wins. A harness loads the version its record names, and its cache keeps older and newer versions next to it, so the record is what keeps jstack-cli on the pstack the session runs.
3. The cache. jstack-cli looks in every dot-folder of the home directory for `plugins/cache/*/pstack/<version>/` and takes the highest version by semver. Codex has no install record and needs none. It keeps one version of each plugin in its cache and replaces it on each install, upgrade, or downgrade, so the cache names the version Codex runs.

Both searches use the layout that plugin harnesses share, so they find pstack without naming any one harness. A pstack in any other place needs `JSTACK_PSTACK_DIR`.

jstack-cli reads the version from the first of `.claude-plugin/plugin.json`, `.codex-plugin/plugin.json`, `.muse-plugin/plugin.json`, and `package.json` in the pstack folder that has a semver `version`. Without one, it uses the folder name when that is a semver, as plugin caches name their folders. When neither gives a version, output names pstack by its path and `--json` gives `null`. jstack-cli then records nothing in `config.json`, because that field holds a version.

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
- `Problems:` lists each problem in `config.json`, in a symlink, or in a layer file that touches this playbook.

When a layer file that touches this playbook has a problem, `compute` withholds the playbook: it prints no steps, only a line that says so and points to `playbook check`, then `Problems:` and the pstack result, and exits 1. With `--json`, `steps`, `notes`, `overrides`, and `handoffs` are empty. A problem in `config.json` or a symlink alone, or a pstack checker failure alone, still prints the steps and exits 1.

`pstack check-playbooks:` comes last, with pstack's own checker result, or `ok`. `--json` prints the same data, shaped by [schemas/jstack.compute.schema.json](schemas/jstack.compute.schema.json).

When the installed pstack differs from the `pstack` in `config.json`, `compute` runs `check` first. A pass records the new version. A failure stops with exit 1, because an upgrade that moved the quoted text would otherwise apply edits in the wrong place.

With `"telemetry": true` in `config.json`, `compute` appends one JSON line per playbook it finds to `usage.jsonl` in `JSTACK_STATE`: `ts`, `playbook`, `repo`, `org`, and `pstack`. The log stays on the machine, and a tool such as a usage counter reads it to tell which playbooks agents run. A failed write never fails the compute, because a read log must not block the work it records.

## locate

`locate` finds the one step of the computed playbook that a quote names, and lists the file each active layer would hold an edit to it in. The `learn` skill uses it to place a lesson, so the agent does not merge layers by hand to find where a quote anchors.

```
# babysit step 3 (web · acme-eng · pstack 1.2.3)

**Work the merge frontier.** The lowest open PR matters first.   [pstack]

Write the edit in:
- user: /home/sam/.jstack/01-user/babysit.md (exists)
- org.standard: .agents/playbooks/babysit.md (exists)
- org.overrides: /home/sam/.jstack/02-orgs/acme/02-overrides/babysit.md (new)
- repo.standard: .agents/playbooks/web-babysit.md (new; team files may quote pstack only)
- repo.overrides: /home/sam/.jstack/03-repos/web/02-overrides/babysit.md (exists)
```

Each layer line gives the path, `exists` or `new`, and the reason an edit there cannot anchor on the quote, if one applies. jstack-cli judges the quote against the step as the layers below that layer leave it, because that is the text the edit matches when the cascade runs. A layer's existing file is the one that already edits the playbook. A new team file in `.agents/playbooks` takes `<repo>-<playbook>.md` when `<playbook>.md` is taken. The layer that wrote the step gets `this layer wrote the step; change its text there`, because an edit line cannot anchor on text its own layer adds.

A quote that names no step or more than one prints the same message `check` prints and exits 1. `--json` follows [schemas/jstack.locate.schema.json](schemas/jstack.locate.schema.json).

## extend

`extend` writes one edit line into a layer file, and refuses an edit that would break `check`. It is the way to change a playbook from a terminal or an agent, because it accepts only the grammar that [the layers page](layers.md#playbook-file-format) defines and adds no verb to the files.

```sh
playbook extend babysit my-babysit replace "Never require Graphite" --with - --when "Babysitting a PR" <<'TEXT'
Use `gh pr view --json "state"` first.
TEXT
```

- The file is `<file-name>.md` in the layer's folder. When it is missing, `extend` creates it with `extends: <parent>` and the `--when` sentence, which is then required. When it exists, `extend` appends the edit line and adds the parent to `extends` if it is missing. A file that has no `extends:` line, or an empty one, is refused, because it is a standalone playbook.
- The verb is `after`, `before`, `replace`, or `in`. The quote holds no double quote. The text may hold backticks and quotes, and line breaks in it fold to spaces.
- Before writing, the quote must match exactly one step of the parent as the layers below the chosen layer leave it, the same text that [`locate`](#locate) judges. On none or several, `extend` names the problem and the matching steps, writes nothing, and exits 1.
- After writing, `extend` runs the same validation as `check` over the whole config. If it fails, it puts the prior bytes back, or removes the file it created, prints the problems, and exits 1.
- On success it prints the path and the changed step with its layer tags.
- Writes follow `JSTACK_CONFIG`. `extend` and `new` never write under `.agents/playbooks` or a `01-standard/` or `01-team/` folder, because team changes go through a pull request.

## new

`new <name> --when "<sentence>" --from-file <path|->` writes a standalone playbook: a file with an empty `extends:`, the `when:` sentence, and the body you pass. `new` refuses, with exit 1, a name that pstack or a layer at or below the chosen layer already defines, a body with no numbered steps, and a body with edit lines. It runs the same validation and rollback as `extend`.

## list

`list` prints a table of every bundled and standalone playbook, with the layer that defines it and one column per active layer. In a layer column, `●` means the layer defines the playbook, `+` means it edits it, and `·` means it leaves it alone. `--json` follows [schemas/jstack.list.schema.json](schemas/jstack.list.schema.json).

## check

`check` runs pstack's `check-playbooks.mjs` from the repo root when the repo has `.agents/playbooks`, and passes its lines through. Then it checks every layer file and prints `<path>:<line>: <message>`:

| Rule | Message |
| --- | --- |
| frontmatter has `when` | `missing when:` |
| each `extends` stem is a pstack playbook | `extends <x>, which pstack <ver> has no playbook for` |
| an `extends` stem is not a playbook that a lower layer defines, and a same or higher layer defines it | `extends <x>, which the <layer> layer defines, and a layer extends only playbooks below it` |
| team file has `layer` in {org.standard, repo.standard} and `source` | `team file needs layer: and source:` |
| each layer is a known layer and listed in `config.json` | `unknown layer <x>` |
| an edit line's quote is in straight double quotes | `a change has no straight-quoted step text to anchor on` |
| quote matches a step | `quote not found: "<q>"` |
| quote matches only 1 step | `quote matches steps <a> and <b>; make it longer` |
| quote is in a numbered step, not intro text | `quote is outside a numbered step` |
| team file quote is pstack's text | `team files may quote pstack only` |
| the file defining a standalone playbook has no edit lines | `standalone playbook cannot carry edits` |
| no symlink in the config dir or `.agents/playbooks` is dangling | `broken link -> <target>` |
| each handoff names a playbook that a layer or pstack defines | `hands off to <x>, which no layer or pstack defines` |
| a known playbook after `run`, `runs`, `running`, `ran` or `per` registers as a handoff | `"<phrase>" names <x> but does not register as a handoff; write playbooks/<x>.md` |
| `<playbook> step N` or `steps N, M` names a step the merged playbook has | `<x> step <N>, but <x> has <K> steps` |

A handoff is a `playbooks/<stem>.md` path, or a playbook named right after `run`, `per`, `route ... to`, or `hand ... to`, as a bold title, a capitalized title, or a kebab-case stem. A title resolves to a stem the way poteto-mode resolves it: kebab case, hyphens kept, other punctuation dropped. A bold name that is a poteto-mode section or skill, such as **Comments**, is not a handoff. `check` reads only text that a layer file wrote, never the pstack words an edit quotes, because pstack owns its own text.

A near-miss is a known playbook, by stem or title, that follows one of those run-like words but is written in a form the handoff parser skips, such as lowercase `run babysit` or `runs reviewing-code`. A step reference resolves `N` against the playbook's merged steps, so a reference that went stale when steps shifted fails. Both rules read only text a layer file wrote, and both fail the check, so `compute` withholds the playbook as it does for any other problem.

A non-team file whose stem names a playbook, and whose `extends` does not list that stem, prints `info: <path>:<line>: targets <x> by its file name; add `extends: <x>` to say so` and does not fail the check. The file still applies to <x> by its name in this release, and a later one stops reading file names. Team files keep their rules.

A handoff to a playbook that this repo's layers lack, but that some layer folder in the config dir holds for another org or repo, prints `info: <path>:<line>: hands off to <x>, which only <folder> defines` and does not fail the check. A user-layer file applies in every repo, so it can hand off to a playbook that only one org defines, and that handoff is right in that org's repos.

`check` also prints `proposed: <path>:<line>` for each team file whose `source` is `proposed`, then `check passed: pstack <ver>` or `check failed: ...`. `--json` follows [schemas/jstack.check.schema.json](schemas/jstack.check.schema.json). Without `--pstack`, a pass records the checked version in `config.json` when that file exists.

## doctor

`doctor` checks the whole install and prints one line per check: `✓` for a pass, `✗` for a failure, and `-` for information. Under each `✗` it prints the commands that fix it. The checks run in this order:

| Check | Passes when |
| --- | --- |
| pstack-claude | jstack-cli finds a pstack, by the search order under [Environment](#environment). The line names the version and folder. |
| jstack plugin | `claude plugin list --json` lists a `jstack@` plugin. Without `claude` on `PATH`, an `installed_plugins.json` in a dot-folder of the home directory lists one. |
| cli | Both `jstack-cli` and `playbook` on `PATH` resolve to a jstack `bin/` script. Each is one line, and a missing `playbook` link fails until the `setup` skill or the printed `ln -s` command adds it. A `jstack` on `PATH` that is not jstack's, such as Java's, prints a `-` line. |
| config | The config dir exists, and `config.json` parses and has a `handle`. |
| mode skill | `<config>/mode/<handle>-mode/SKILL.md` exists, and a `skills` folder in a dot-folder of the home directory links to it. |
| each repo | For each folder in `<config>/03-repos/`, the checkout's `.agents/playbooks` resolves to `<config>/03-repos/<repo>/01-team/`, and the checkout's `info/exclude` has `/.agents/playbooks`. |
| check | `playbook check --repo <repo>` passes for each repo, or `playbook check` passes when the config has no repos. |

doctor finds a repo's checkout at `repos.<repo>.checkout` in `config.json`, which the `setup` skill records. Without that key, it uses the current directory's checkout when its key matches. A repo with neither gets a `-` line, and doctor skips its link check.

doctor writes nothing without `--fix`. It runs `check` with `--pstack` set to the pstack it found, so `check` does not record a version in `config.json`.

The fixes depend on the harness:

- With `claude` on `PATH`, a missing plugin gets Claude Code's install commands from the README's tables. doctor leaves out `claude plugin marketplace add` when `claude plugin marketplace list --json` already lists that marketplace.
- Without `claude`, doctor prints the row of every harness from the README's table for that install step. jstack cannot run another harness's installer.
- A missing link gets an `ln -s` command, and a missing exclude line gets an `echo ... >>` command.
- A fix that would replace a file prints as advice, such as `move <path> aside, then: ln -s ...`, because the file in the way may be the operator's own work.

`--fix` prints the report, then asks `run these? [y/N]` for each failing check that has a command to run, and runs that check's commands on `y`. It runs only `claude plugin` commands, `mkdir -p`, `ln -s` to a path that does not exist, and an append to `info/exclude`. A fix never copies files into a plugin cache, because a harness loads only the version its install record names. When stdin is not a terminal, `--fix` prints `fixes not run: no terminal to ask on` and runs nothing. After the fixes, doctor runs every check again and prints the new report under `after fixes:`.

`--json` prints the findings, shaped by [schemas/jstack.doctor.schema.json](schemas/jstack.doctor.schema.json).
