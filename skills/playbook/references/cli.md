# playbook reference

```sh
playbook list [--repo <repo>] [--json] [--pstack <dir-or-version>]
playbook show <playbook> [--repo <repo>] [--json] [--pstack <dir-or-version>]
playbook locate <playbook> <quote> [--repo <repo>] [--json] [--pstack <dir-or-version>]
playbook extend <parent> [<file-name>] after|before|replace|in "<quote>" (--with <text|-> | --with-file <path>) [--when <sentence>] [--scope everywhere|org|repo] [--repo <repo>] [--pstack <dir-or-version>]
playbook new <name> --when <sentence> --from-file <path|-> [--scope everywhere|org|repo] [--repo <repo>] [--pstack <dir-or-version>]
playbook check [--repo <repo> | --every-repo] [--json] [--pstack <dir-or-version>]
playbook doctor [--fix | --json]
playbook --help
```

playbook is `scripts/playbook.mjs` in this skill. It needs Node and nothing else. The plugin's `bin/playbook` imports the script, so one symlink puts the command on `PATH`. `show` is the main name of the command that prints a playbook, and `compute` stays as an alias of it. `bin/jstack-cli` is a deprecated alias of `playbook`, kept for 0.8.x and removed in 0.9.0: it takes the same flags, and spells the playbook commands `jstack-cli playbook list|show|compute|locate|extend|new`, with `jstack-cli check` and `jstack-cli doctor` unchanged.

`--help` and `-h` print the usage and exit 0. Any other word in place of a command, such as `help`, prints the usage and exits 2.

## Options

| Option | Effect |
| --- | --- |
| `--repo <repo>` | Sets the repo key. When it differs from the current checkout's key, playbook reads the team files of the checkout `config.json` records for that repo, or none when it records no checkout. |
| `--every-repo` | `check` only. Checks with no repo and in each repo `config.json` records, and prints one report in the same shape. It never records a version, because it reads several contexts' files. |
| `--json` | Prints JSON that follows the command's schema in [schemas/](schemas/). |
| `--scope everywhere\|org\|repo` | `extend` and `new` only. Where the new file is active. `everywhere` (the default) writes to `<config>/playbooks/`, `org` to `<config>/playbooks/orgs/<org>/`, and `repo` to `<config>/playbooks/repos/<repo>/`, for the org or repo of the current checkout. |
| `--with <text\|->`, `--with-file <path>` | `extend` only. The change text, from the argument, from stdin when it is `-`, or from a file. Give one. |
| `--when <sentence>` | `extend` when it creates a file, and `new`. The `when:` sentence. |
| `--from-file <path\|->` | `new` only. The numbered steps, from a file or stdin. |
| `--fix` | `doctor` only. Asks before each fix, then runs it. See [doctor](#doctor). |
| `--pstack <dir-or-version>` | Uses that pstack instead of the one playbook finds. It takes a folder, or a version next to the one in use or in any plugin cache. With this flag, playbook never writes `config.json`, so you can preview an upgrade. |

## Exit codes

| Code | Meaning |
| --- | --- |
| 0 | Clean. |
| 1 | A validator problem, a `locate` quote that names no step or more than one, pstack's own checker failed, or a `doctor` check failed. `compute` still prints the playbook, except when the `check` it runs after a pstack change fails. Then it prints the `check` result. |
| 2 | Bad usage, such as `--repo` or `--pstack` with `doctor`, or `--fix` with `--json` or with another command. No pstack found, an unknown `--pstack` version, a `config.json` that is not valid JSON or has the wrong shape, or an unknown playbook. The message goes to stderr. |

## Environment

| Variable | Value | Default |
| --- | --- | --- |
| `PLAYBOOKS_CONFIG` | The config dir. | `.jawsome-playbooks` in the home directory. |
| `PLAYBOOKS_PSTACK_DIR` | The pstack plugin folder, the one that holds `skills/poteto-mode/`. | The search order below. |
| `PLAYBOOKS_STATE` | The folder that holds `usage.jsonl`, the read log that `telemetry` turns on. | `jawsome-playbooks` in `$XDG_STATE_HOME`, else in `.local/state` in the home directory. |

Until 0.9.0, each variable's `JSTACK_` name from before 0.8.0 still works, and a `PLAYBOOKS_` name that is set wins. Likewise, when `PLAYBOOKS_CONFIG` is unset and `.jawsome-playbooks` does not exist, playbook reads `.jstack` in the home directory, and `check` prints an info line saying to move it. The state folder falls back to `jstack` the same way.

playbook picks the pstack folder in this order, and uses the first one that holds poteto-mode's playbooks:

1. `PLAYBOOKS_PSTACK_DIR`.
2. The install record. playbook reads `plugins/installed_plugins.json` in every dot-folder of the home directory and takes the `installPath` of each `pstack@<marketplace>` entry that has no `projectPath`. When several qualify, the highest version by semver wins. A harness loads the version its record names, and its cache keeps older and newer versions next to it, so the record is what keeps jstack-cli on the pstack the session runs.
3. The cache. playbook looks in every dot-folder of the home directory for `plugins/cache/*/pstack/<version>/` and takes the highest version by semver. Codex has no install record and needs none. It keeps one version of each plugin in its cache and replaces it on each install, upgrade, or downgrade, so the cache names the version Codex runs.

Both searches use the layout that plugin harnesses share, so they find pstack without naming any one harness. A pstack in any other place needs `PLAYBOOKS_PSTACK_DIR`.

playbook reads the version from the first of `.claude-plugin/plugin.json`, `.codex-plugin/plugin.json`, `.muse-plugin/plugin.json`, and `package.json` in the pstack folder that has a semver `version`. Without one, it uses the folder name when that is a semver, as plugin caches name their folders. When neither gives a version, output names pstack by its path and `--json` gives `null`. jstack-cli then records nothing in `config.json`, because that field holds a version.

## compute

`compute` prints one playbook family with every member applied, as Markdown:

```
# babysit (web · acme-eng · pstack 1.2.3)

1. Check the team's merge calendar.   [babysitting-an-acme-pr]
2. **Stop at the human's line.** ~~Never merge~~ Merge once green.   [babysit ~ babysit-sam]

Family: babysit (pstack), babysitting-an-acme-pr (team), babysit-sam (user)
```

The heading names the root, the repo, the forge owner or else the org, and the pstack version. When the name given is a member of the family, a line after the heading says so: any member's name prints its root's family. Each step ends with the stem of the file that wrote it, then `~` and each stem that edited it. Struck text is what a `Replace` removed. `Family:` lists the root and each active member in apply order, with its kind, when the family has more than the root.

These sections follow the steps, each only when it has entries, in this order:

- `Hands off to:` lists each other family that the steps or notes send the work to, by its root. Each line gives the root and where it appears, such as `- opening-a-pr (step 8)` or `- shipping (notes)`.
- `Notes:` lists each note with the stem of its file.
- `Overrides:` lists each `In` or `Replace` on a step a different file wrote, such as `- step 6: babysit-sam replaced "Never merge" (babysit, after babysitting-an-acme-pr)`. The parentheses name the step's writer, then the files that edited the step earlier.
- `Problems:` lists each problem in `config.json`, in a symlink, in a file of this family or one that extends a member, or in a file with an `extends` that names no playbook.

When a file in the family has a problem, `compute` withholds the playbook: it prints no steps, only a line that says so and points to `playbook check`, then `Problems:` and the pstack result, and exits 1. With `--json`, `steps`, `notes`, `overrides`, and `handoffs` are empty. A problem in `config.json` or a symlink alone, or a pstack checker failure alone, still prints the steps and exits 1.

A file with an `extends` stem that no context defines edits nothing, and any playbook may be the one it meant. So `compute` of every playbook lists that file's problems and exits 1. It still prints the steps of a playbook the file does not touch, under a line that says they may be incomplete. With `--json`, the steps stay and `problems` carries the file's problems.

`pstack check-playbooks:` comes last, with pstack's own checker result, or `ok`. `--json` prints the same data, shaped by [schemas/playbook.compute.schema.json](schemas/playbook.compute.schema.json).

When the installed pstack differs from the `pstack` in `config.json`, `compute` runs `check` first. A pass records the new version. A failure stops with exit 1, because an upgrade that moved the quoted text would otherwise apply edits in the wrong place.

With `"telemetry": true` in `config.json`, `compute` appends one JSON line per playbook it finds to `usage.jsonl` in `PLAYBOOKS_STATE`: `ts`, `playbook`, `repo`, `org`, and `pstack`. The log stays on the machine, and a tool such as a usage counter reads it to tell which playbooks agents run. A failed write never fails the compute, because a read log must not block the work it records.

## locate

`locate` finds the one step of the computed family that a quote names, the files that wrote the quoted words, and the user file an edit to them belongs in. The `learn` skill uses it to place a lesson, so the agent does not merge files by hand to find where a quote anchors.

```
# babysit step 3 (web · acme-eng · pstack 1.2.3)

**Work the merge frontier.** The lowest open PR matters first.   [babysit]

babysit wrote the quoted words. Write the edit in:
- /home/sam/.jawsome-playbooks/playbooks/babysit-sam.md (exists), extending babysit
```

A file's quotes see only what its ancestors wrote, so the new edit must extend the file that wrote the words. When several files wrote them, `locate` drops any that another writer descends from, and the file extends the rest. The suggested file is `<writer>-<handle>` in `playbooks/`. When one user file wrote the words, the line names that file with `exists; it wrote these words, so change its text there`, because an edit line cannot anchor on its own file's text.

A quote that names no step or more than one prints the same message `check` prints and exits 1. `--json` follows [schemas/playbook.locate.schema.json](schemas/playbook.locate.schema.json).

## extend

`extend` writes one edit line into a user file, and refuses an edit that would break `check`. It is the way to change a playbook from a terminal or an agent, because it accepts only the grammar that [the playbooks page](playbooks.md#file-format) defines and adds no verb to the files.

```sh
playbook extend babysit babysit-sam replace "Never require Graphite" --with - --when "Babysitting a PR" <<'TEXT'
Use `gh pr view --json "state"` first.
TEXT
```

- The file is `<file-name>.md` in the folder `--scope` picks. Without a file name it is `<parent>-<handle>`, with the handle from `config.json`. The parent may be a bundled playbook, an active team file, or an active user file. When the file is missing, `extend` creates it with `extends: <parent>` and the `--when` sentence, which is then required. When it exists, `extend` appends the edit line and adds the parent to `extends` if it is missing. A file that has no `extends:` line, or an empty one, is refused, because it is a standalone playbook.
- The verb is `after`, `before`, `replace`, or `in`. The quote holds no double quote. The text may hold backticks and quotes, and line breaks in it fold to spaces.
- Before writing, the quote must match exactly one step in the text the parent and its ancestors wrote, the text the new file's quotes will see. On none or several, `extend` names the problem and the matching steps, writes nothing, and exits 1. When another file wrote the words, the message names it, so it can become a second parent.
- After writing, `extend` runs the same validation as `check` in every context: no repo, plus every repo in `config.json`'s `repos`. A user file can change the text another file quotes, or take a name another repo uses, so a write that passes where it runs can still break another repo. A recorded repo is read from its checkout when the checkout exists. If the write added a problem, it puts the prior bytes back, or removes the file it created, prints the new problems, and exits 1. A problem that was already there never refuses a write, so it cannot block an unrelated edit or its own repair. `extend` prints it after the changed step instead.
- On success it prints the path and the changed step with its stem tags.
- Writes follow `PLAYBOOKS_CONFIG`. `extend` and `new` never write under `.agents/`, because team changes go through a pull request.

## new

`new <name> --when "<sentence>" --from-file <path|->` writes a standalone playbook: a file with an empty `extends:`, the `when:` sentence, and the body you pass. `new` refuses, with exit 1, a name that pstack, a team file, or a user file in any scope already uses, a body with no numbered steps, and a body with edit lines. It takes `--scope` and runs the same validation and rollback as `extend`.

## list

`list` prints each root active in the context, with its kind (`pstack`, `team` or `user`) and the active members of its family in apply order. `--json` follows [schemas/playbook.list.schema.json](schemas/playbook.list.schema.json).

## check

`check` runs pstack's `check-playbooks.mjs` from the repo root when the repo has `.agents/playbooks`, and passes its lines through. Then it checks every team file and every user file active in the context, and prints `<path>:<line>: <message>`. [playbooks.md](playbooks.md#check) says which rules come from pstack-claude.

| Rule | Message |
| --- | --- |
| frontmatter has `when` | `missing when:` |
| no `layer:` key | `layer: is retired, because extends sets the order; delete it` |
| no numbered or unnumbered layer folder at the config root | `numbered layer folders are retired; move each file into playbooks/ ...` |
| each `extends` stem is defined in some context | `extends <x>, which no playbook defines` |
| a team file extends only bundled stems | `team files extend only bundled playbooks, and pstack <ver> bundles no <x>` |
| no cycle among user files | `extends a cycle: <a> -> <b> -> <a>` |
| a stem is not bundled | `<x> is a bundled playbook's name; rename the file, such as <x>-<qualifier>.md` |
| a stem is unique among active files and files active everywhere | `<x> is also <path>; rename one, such as <x>-<qualifier>.md` |
| an edit line's quote is in straight double quotes | `a change has no straight-quoted step text to anchor on` |
| quote matches a step its ancestors wrote | `quote not found: "<q>"`, or `quote not found in what its parents leave: "<q>"; <file> wrote it, so add <file> to extends` |
| quote matches only 1 step | `quote matches steps <a> and <b>; make it longer` |
| quote is in a numbered step, not intro text | `quote is outside a numbered step` |
| team file quote is pstack's text | `team files may quote pstack only` |
| two siblings do not Replace the same words | `replaces words that <x> also replaces in <playbook> step <N>; make one file extend the other` |
| a standalone playbook has no edit lines | `standalone playbook cannot carry edits` |
| no symlink in the config dir or `.agents/playbooks` is dangling | `broken link -> <target>` |
| `.agents/playbooks` does not link into the config dir | `links into the config dir; team playbooks are committed copies, so replace the link with them` |
| each handoff names a playbook some file or pstack defines | `hands off to <x>, which no playbook defines` |
| `<playbook> step N`, `steps N, M` or `steps N-M` names a step the family has | `<x> step <N>, but <x> has <K> steps` |

A handoff is a `playbooks/<stem>.md` path, or a playbook named right after `run`, `per`, `route ... to`, or `hand ... to`, as a bold title, a capitalized title, or a kebab-case stem. A title resolves to a stem the way poteto-mode resolves it: kebab case, hyphens kept, other punctuation dropped. A bold name that is a poteto-mode section or skill, such as **Comments**, is not a handoff. `check` reads only text a playbook file wrote, never the pstack words an edit quotes, because pstack owns its own text.

A known playbook after `run`, `runs`, `running`, `ran` or `per`, in a form the handoff parser skips, such as lowercase `run babysit` or `runs reviewing-code`, prints `info: <path>:<line>: "<phrase>" may name <x> but does not register as a handoff; if it is one, write playbooks/<x>.md`. It does not fail the check or withhold a playbook, because the same words are often plain prose, such as `one PR per feature`.

A step reference resolves `N` against the playbook's merged steps, so a reference that went stale when steps shifted fails, and `compute` withholds the playbook as it does for any other problem. A reference needs the whole playbook name, so `pre-shipping step 99` is not one, and it may be written `playbooks/<x>.md step N`. Both rules read only text a playbook file wrote.

These print `info:` lines and do not fail the check:

- A file whose parent only another context defines: `extends <x>, which only <where> defines, so this file is dormant here`, where `<where>` is a repo key or a scope folder. Its child gets `extends <x>, which is dormant here, so this file is too`.
- A handoff to a playbook only another context defines, `hands off to <x>, which only <where> defines`, or to a dormant file, `hands off to <x>, which is dormant here`. A user file in `playbooks/` applies in every repo, so it can hand off to a playbook that exists in some repos only.
- A team file whose name lacks its scope word: `a team file name carries its scope word (<org> or <repo>), such as <x>-<org>.md`.

`check` reads team stems from every checkout in `config.json` `repos`, so missing and dormant results are the same from any directory.

`check` ends with `check passed: pstack <ver>` or `check failed: ...`. `--json` follows [schemas/playbook.check.schema.json](schemas/playbook.check.schema.json). Without `--pstack`, a pass records the checked version in `config.json` when that file exists.

## doctor

`doctor` checks the whole install and prints one line per check: `✓` for a pass, `✗` for a failure, and `-` for information. Under a `✗` or `-` line it prints the commands that fix it, and only `✗` fails doctor. The checks run in this order:

| Check | Passes when |
| --- | --- |
| pstack-claude | playbook finds a pstack, by the search order under [Environment](#environment). The line names the version and folder. |
| jawsome-playbooks plugin | `claude plugin list --json` lists a `jawsome-playbooks@` plugin. Without `claude` on `PATH`, an `installed_plugins.json` in a dot-folder of the home directory lists one. |
| cli | `playbook` on `PATH`, and its deprecated alias `jstack-cli`, resolve to a jawsome-playbooks `bin/` script. Each is one line. A missing `playbook` link fails. A missing `jstack-cli` link prints a `-` line with its `ln -s` command, because the alias is removed in 0.9.0. |
| config | The config dir exists, and `config.json` parses and has a `handle`. |
| mode skill | `<config>/mode/<handle>-mode/SKILL.md` exists, and a `skills` folder in a dot-folder of the home directory links to it. |
| each repo | For each repo in `config.json` `repos`, the checkout's `.agents/playbooks` is a folder that git tracks. An untracked folder prints a `-` line, because only the operator sees it. A missing folder prints a `-` line. A link into the config dir, the retired layout, fails with an `rm` command shown as advice. |
| check | `playbook check --repo <repo>` passes for each repo, or `playbook check` passes when the config has no repos. |

doctor finds a repo's checkout at `repos.<repo>.checkout` in `config.json`, which the `setup` skill records. Without that key, it uses the current directory's checkout when its key matches. A repo with neither gets a `-` line, and doctor skips its team check.

doctor writes nothing without `--fix`. It runs `check` with `--pstack` set to the pstack it found, so `check` does not record a version in `config.json`.

The fixes depend on the harness:

- With `claude` on `PATH`, a missing plugin gets Claude Code's install commands from the README's tables. doctor leaves out `claude plugin marketplace add` when `claude plugin marketplace list --json` already lists that marketplace.
- Without `claude`, doctor prints the row of every harness from the README's table for that install step. jawsome-playbooks cannot run another harness's installer.
- A missing command link gets an `ln -s` command.
- A fix that would replace a file prints as advice, such as `move <path> aside, then: ln -s ...`, because the file in the way may be the operator's own work.

`--fix` prints the report, then asks `run these? [y/N]` for each `✗` or `-` line that has a command to run, and runs that check's commands on `y`. It runs only `claude plugin` commands, `mkdir -p`, and `ln -s` to a path that does not exist. A fix never copies files into a plugin cache, because a harness loads only the version its install record names. When stdin is not a terminal, `--fix` prints `fixes not run: no terminal to ask on` and runs nothing. After the fixes, doctor runs every check again and prints the new report under `after fixes:`.

`--json` prints the findings, shaped by [schemas/playbook.doctor.schema.json](schemas/playbook.doctor.schema.json).
