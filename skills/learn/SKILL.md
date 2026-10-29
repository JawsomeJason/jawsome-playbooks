---
name: learn
description: Turns what a session taught into proposed edits to the operator's jstack playbook layers. Collects the operator's corrections and repeated instructions, finds the playbook step each one changes, picks the layer and file with jstack-cli playbook locate, and shows each edit line for the operator to pick before anything is written. Use when the operator says "learn from this", "update my playbooks", "what should my playbooks learn", "remember this for next time" about how a playbook runs, or after a correction that should hold in every later run. Prefer it over pstack's reflect when a lesson changes a playbook step, because reflect edits skills.
argument-hint: "[what to focus on]"
compatibility: Requires Node, jstack-cli, and the pstack plugin's poteto-mode skill.
license: MIT
---

# Learn

A correction the operator gives in one session is gone in the next unless it lands in the playbook the agent runs. This skill finds each lesson, places it in the layer and step where it belongs, and writes it only after the operator picks it. A playbook edit changes every later run, so the operator decides every one.

## Rules

- Write nothing before the operator picks. An edit to a team layer reaches teammates, and an edit to any layer changes every later run.
- File no tickets and build no checks. A lesson that a lint or a hook could enforce goes in the report as a candidate, and the operator chooses whether to build it, because enforcement is heavier than a playbook line and not every rule deserves it.
- Place an edit with `jstack-cli playbook locate`, never by reading layer files by hand. The cascade decides what text each layer sees, and a hand match puts a quote where it does not anchor.
- Quote a short, distinctive phrase, such as a step's bold title. pstack rewrites step text between releases, and a short quote survives more rewrites.

## Steps

1. Collect lessons from the conversation, or from the focus the argument names. A lesson is an operator correction, an instruction the operator gave twice, or a step that ran in a way the operator undid. Write each one as one sentence with the operator's words as evidence. Drop one-offs and facts about one task, because a playbook line applies to every run.
2. Sort each lesson by where it belongs:
   - How a playbook runs: steps 3 to 5 place it.
   - How a skill behaves: name the skill and leave it to a skill-editing workflow, such as pstack's reflect.
   - A rule a tool could check: list it as an enforcement candidate.
   - A fact about a person, a project, or a preference outside any playbook: list it for the harness's memory.
3. Find the step. Run `jstack-cli playbook list` to pick the playbook, then `jstack-cli playbook compute <playbook>` to read its steps. When no step fits, the lesson defines a new standalone playbook in the user layer.
4. Run `jstack-cli playbook locate <playbook> "<quote>"`. It prints the step and, for each layer, the file an edit goes in, whether that file exists, and why the quote cannot anchor there. Pick the layer by who the rule is for:
   - `user` for the operator's habits in every repo.
   - `org.overrides` for the operator's rules in one org's repos.
   - `repo.overrides` for the operator's rules in one repo.
   - `org.standard` or `repo.standard` only for a rule the team holds, with `source: proposed` until the team agrees. pstack reads team files without the other layers, so they quote only pstack's text.

   Pick a layer with no problem listed. When the layer that fits has one, choose another quote or another layer.
5. Draft the edit line in pstack's grammar: `- **After|Before|Replace|In** "<quote>" <change>`. Use `In` to add to a step, `Replace` to change words in it, and `After` or `Before` to add a step. Write the change as a plain instruction with its reason, so the rule still makes sense when the tools around it change.
6. Show every proposal in one lettered list. Each entry gives the lesson, its evidence, the playbook and step, the layer and file, and the edit line. After it, list the lessons that went to a skill, an enforcement candidate, or memory. Wait for the operator's picks.
7. Write each picked edit. Append the line to an existing file. A new file gets frontmatter first: `extends: <playbook>` and a `when:` sentence, plus `layer:` and `source:` in a team file. A new `org.standard` file also needs a link from each repo's team folder, which the setup skill makes.
8. Run `jstack-cli check`. When it fails on a line this run wrote, remove that line and report the failure. Then run `jstack-cli playbook compute <playbook>` and show the changed step with its layer tags, so the operator sees the edit applied where they meant it.
9. Report what was written, where, and what went elsewhere.

When `jstack-cli` is not on `PATH`, run `node scripts/jstack.mjs` from the `playbook` skill's folder instead. [The jstack-cli reference](../playbook/references/cli.md#locate) describes `locate`, and [the layers page](../playbook/references/layers.md) gives the file format and the cascade.
