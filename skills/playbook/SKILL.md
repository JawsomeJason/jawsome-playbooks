---
name: playbook
description: Lists, computes, and checks layered poteto-mode playbooks with jstack-cli. compute prints one playbook with the personal, org, and repo layers applied over pstack's bundled steps in cascade order, tags each step with the layer that wrote it, and names every override. check validates every layer file against the installed pstack. Use when running a poteto-mode playbook through jstack, when a mode skill asks for `jstack-cli playbook compute`, when writing or editing a layer file, or after a pstack upgrade.
argument-hint: "<list|compute|check|doctor> [playbook] [--repo <repo>]"
compatibility: Requires Node and the pstack plugin's poteto-mode skill.
license: MIT
---

# Playbook

jstack layers the operator's personal and team playbooks over pstack's bundled poteto-mode playbooks, in a fixed order where later layers win. This skill runs jstack-cli and shows the result, so the agent copies one computed step list instead of merging layers by hand, which drops or misplaces edits.

## Run it

1. When `jstack-cli` is on `PATH`, use it. Otherwise run `node scripts/jstack.mjs` from this skill's folder. Both run the same script, and the `PATH` copy is how the operator runs it in a terminal.
2. Map the argument to a command:

   | Argument | Command |
   | --- | --- |
   | `list` | `jstack-cli playbook list` |
   | `compute <playbook>` | `jstack-cli playbook compute <playbook>` |
   | `check` | `jstack-cli check` |
   | `doctor` | `jstack-cli doctor` |

3. When the argument includes `--repo <repo>`, pass it through. Without it, jstack-cli reads the repo from the current directory's checkout.
4. Print the output as it is. The operator reads the tags, the struck text, and the override list to see which layer changed a step, so rewording them hides that.

Exit code 1 means a validator problem. Report each problem line to the operator. Do not guess where an edit with a broken quote belongs, because a wrong guess applies a rule to the wrong step. Exit code 2 is a usage or setup error, and the message names the fix, such as setting `JSTACK_PSTACK_DIR`. [references/cli.md](references/cli.md) lists the commands, flags, environment variables, and exit codes.

## Run a computed playbook

- Copy `compute`'s numbered steps into the todolist once, as poteto-mode's copy-and-apply step. Recomputing mid-task can change the list under the work.
- When the run reaches a playbook listed under `Hands off to:`, compute that playbook with jstack-cli and run its computed steps. Its own layers change its steps, so the bundled text alone would drop them.
- Name every line under `Overrides:` in the reply. An override changes the bundled behavior the operator expects, so it must be visible.
- When `pstack check-playbooks:` shows lines other than `ok`, report them as poteto-mode asks.

## Write a layer file

- Put the file in its layer's folder and keep pstack's grammar: `extends`, `when`, and edit lines `- **After|Before|Replace|In** "quote" change`. pstack's own checker reads team files, so a new verb or key there breaks pstack. [references/layers.md](references/layers.md) gives the layout and the cascade rules.
- Quote a short, distinctive phrase from one step, such as its bold title. pstack rewrites step text between releases, and a long quote breaks on the first rewrite.
- In team files, quote only pstack's text, and add `layer:` and `source:`. pstack's checker sees team files without the other layers, so a quote from a lower layer fails there.
- Run `jstack-cli check` after every edit and after every pstack upgrade. It catches a quote that matches nothing, matches two steps, or sits outside the steps, before an agent runs the playbook.

## Keep the JSON shape

`--json` output follows [jstack.compute](references/schemas/jstack.compute.schema.json), [jstack.list](references/schemas/jstack.list.schema.json), [jstack.check](references/schemas/jstack.check.schema.json), and [jstack.doctor](references/schemas/jstack.doctor.schema.json). When jstack-cli cannot run, produce the same shape by hand from [references/layers.md](references/layers.md), so a mode skill that reads it keeps working.
