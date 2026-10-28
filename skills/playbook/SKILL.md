---
name: playbook
description: Lists, computes and validates layered poteto-mode playbooks with the jstack CLI. compute prints one playbook with personal, org and repo layers applied over pstack's bundled steps in cascade order, each step tagged with the layer that wrote it and every override named; check validates every layer file against the installed pstack. Use when running a poteto-mode playbook through jstack, when a mode skill asks for `jstack playbook compute`, when writing or editing a layer playbook file, or after a pstack upgrade.
argument-hint: "<list|compute|check> [playbook] [--repo <repo>]"
compatibility: Requires Node and the pstack plugin's poteto-mode skill.
license: MIT
---

# Playbook

jstack layers a user's personal and team playbooks over pstack's bundled poteto-mode playbooks, in a fixed order where later layers win. This skill runs its CLI and shows the result, so the agent copies one computed step list instead of merging layers by hand, which drops or misplaces edits.

## Run it

1. Use `jstack` when it is on `PATH`. Otherwise run `node scripts/jstack.mjs` from this skill's folder. Both are the same script, and the `PATH` copy is how the user runs it in a terminal.
2. Map the argument to a command:

   | Argument | Command |
   | --- | --- |
   | `list` | `jstack playbook list` |
   | `compute <playbook>` | `jstack playbook compute <playbook>` |
   | `check` | `jstack check` |

3. Pass `--repo <repo>` through when given. Without it, jstack reads the repo from the current directory's checkout.
4. Print the output as it is. The tags, struck text and override list are what the user reads to see which layer changed a step, so rewording them hides that.

Exit code 1 means a validator problem. Report each problem line to the user and do not guess where an unanchored edit belongs, because a wrong guess applies a rule to the wrong step. Exit code 2 is a usage or setup error. The message names the fix, such as setting `JSTACK_PSTACK_DIR`. Commands, flags, environment and exit codes: [references/cli.md](references/cli.md).

## Running a computed playbook

- Copy `compute`'s numbered steps into the todolist once, as poteto-mode's copy-and-apply step. Recomputing mid-task can change the list under the work.
- When the run reaches a playbook listed under `Hands off to:`, compute that playbook with jstack and run its computed steps. Its own layers change its steps, so the bundled text alone would drop them.
- Name every line under `Overrides:` in the reply. An override changes the bundled behavior the user expects, so it must be visible.
- When `pstack check-playbooks:` shows lines other than `ok`, report them as poteto-mode asks.

## Writing a layer file

- Put the file in its layer's folder and keep pstack's grammar: `extends`, `when`, and edit lines `- **After|Before|Replace|In** "quote" change`. pstack's own checker reads team files, so a new verb or key there breaks pstack. Layout and cascade rules: [references/layers.md](references/layers.md).
- Quote a short, distinctive phrase from one step, such as its bold title. pstack rewrites step text between releases, and a long quote breaks on the first rewrite.
- Team files quote pstack's text only, and carry `layer:` and `source:`. pstack's checker sees team files without the other layers, so a quote from a lower layer fails there.
- Run `jstack check` after every edit and after every pstack upgrade. It catches a quote that matches nothing, matches two steps or sits outside the steps, before an agent runs the playbook.

## Output schemas

`--json` output follows [jstack.compute](references/schemas/jstack.compute.schema.json), [jstack.list](references/schemas/jstack.list.schema.json) and [jstack.check](references/schemas/jstack.check.schema.json). When the script cannot run, produce the same shape by hand from [references/layers.md](references/layers.md), so a mode skill that reads it keeps working.
