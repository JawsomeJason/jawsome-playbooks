---
name: playbook
description: Lists, computes, and checks poteto-mode playbooks extended by team and personal files, with the playbook command (jstack-cli is its deprecated alias). show, also spelled compute, prints one playbook family with every file that extends it applied over pstack's bundled steps in extends order, tags each step with the file that wrote it, and names every override. locate names the step a quote finds and the file an edit to it belongs in. check validates every playbook file against the installed pstack. Use when running a poteto-mode playbook through jawsome-playbooks, when a mode skill asks for `playbook show`, when writing or editing a playbook file, or after a pstack upgrade.
argument-hint: "<list|show|compute|locate|extend|new|check|doctor> [playbook] [--repo <repo>]"
compatibility: Requires Node and the pstack plugin's poteto-mode skill.
license: MIT
---

# Playbook

jawsome-playbooks applies the operator's personal and team playbook files over pstack's bundled poteto-mode playbooks, in the order their `extends` chains give: parents first, team files before personal ones. This skill runs playbook and shows the result, so the agent copies one computed step list instead of merging files by hand, which drops or misplaces edits.

## Run it

1. When `playbook` is on `PATH`, use it. `jstack-cli` is a deprecated alias, removed in 0.9.0, that takes the same commands, and `compute` is an alias of `show`. Otherwise run `node scripts/playbook.mjs` from this skill's folder. Both run the same script, and the `PATH` copy is how the operator runs it in a terminal.
2. Map the argument to a command:

   | Argument | Command |
   | --- | --- |
   | `list` | `playbook list` |
   | `show <playbook>` (alias `compute`) | `playbook show <playbook>` |
   | `locate <playbook> <quote>` | `playbook locate <playbook> "<quote>"` |
   | `extend <parent> [<file-name>] <verb> <quote>` | `playbook extend <parent> [<file-name>] <verb> "<quote>" --with -` |
   | `new <name>` | `playbook new <name> --when "<sentence>" --from-file -` |
   | `check` | `playbook check` |
   | `doctor` | `playbook doctor` |

3. When the argument includes `--repo <repo>`, pass it through. Without it, playbook reads the repo from the current directory's checkout.
4. Print the output as it is. The operator reads the tags, the struck text, and the override list to see which file changed a step, so rewording them hides that.

Exit code 1 means a validator problem. Report each problem line to the operator. Do not guess where an edit with a broken quote belongs, because a wrong guess applies a rule to the wrong step. Exit code 2 is a usage or setup error, and the message names the fix, such as setting `PLAYBOOKS_PSTACK_DIR`. [references/cli.md](references/cli.md) lists the commands, flags, environment variables, and exit codes.

## Run a computed playbook

- Copy `show`'s numbered steps into the todolist once, as poteto-mode's copy-and-apply step. Recomputing mid-task can change the list under the work.
- When the run reaches a playbook listed under `Hands off to:`, show that playbook with playbook and run its computed steps. Its own family changes its steps, so the bundled text alone would drop them.
- Name every line under `Overrides:` in the reply. An override changes the bundled behavior the operator expects, so it must be visible.
- When `pstack check-playbooks:` shows lines other than `ok`, report them as poteto-mode asks.

## Write a playbook file

- Write user files with `playbook extend <parent> [<file-name>] after|before|replace|in "<quote>" --with -` (text on stdin) and `playbook new <name> --when "<sentence>" --from-file -`, not by editing the file. They refuse a quote that names no step or several, and undo a write that adds a `check` problem. Without a file name, `extend` writes `<parent>-<handle>`. `--scope org` or `--scope repo` limits where the file is active. [references/cli.md](references/cli.md#extend) describes them. Team files go through a pull request.
- Pick the parent with `playbook locate`: it names the file that wrote the quoted words, which is the parent the new edit must extend, because a file's quotes see only what its ancestors wrote.
- Keep pstack's grammar: `extends`, `when`, and edit lines `- **After|Before|Replace|In** "quote" change`. pstack's own checker reads team files, so a new verb or key there breaks pstack. [references/playbooks.md](references/playbooks.md) gives where files live, names, the apply order, and what `check` validates, each rule tagged with the project that provides it.
- Quote a short, distinctive phrase from one step, such as its bold title. pstack rewrites step text between releases, and a long quote breaks on the first rewrite.
- A team file extends only bundled stems and quotes only pstack's text, and carries the org or repo word in its name. pstack's checker sees team files without personal files, so anything else fails there.
- Run `playbook check` after every edit and after every pstack upgrade. It catches a quote that matches nothing, matches two steps, or sits outside the steps, before an agent runs the playbook.

## Keep the JSON shape

`--json` output follows [playbook.compute](references/schemas/playbook.compute.schema.json), [playbook.list](references/schemas/playbook.list.schema.json), [playbook.locate](references/schemas/playbook.locate.schema.json), [playbook.check](references/schemas/playbook.check.schema.json), and [playbook.doctor](references/schemas/playbook.doctor.schema.json). When playbook cannot run, produce the same shape by hand from [references/playbooks.md](references/playbooks.md), so a mode skill that reads it keeps working.
