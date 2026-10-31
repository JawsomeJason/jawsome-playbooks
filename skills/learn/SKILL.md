---
name: learn
description: Turns what a session taught into proposed edits to the operator's jstack playbook files. Collects the operator's corrections and repeated instructions, finds the playbook step each one changes, picks the parent and file with playbook locate, and shows each edit line for the operator to pick before anything is written. Use when the operator says "learn from this", "update my playbooks", "what should my playbooks learn", "remember this for next time" about how a playbook runs, or after a correction that should hold in every later run. Prefer it over pstack's reflect when a lesson changes a playbook step, because reflect edits skills.
argument-hint: "[what to focus on]"
compatibility: Requires Node, playbook, and the pstack plugin's poteto-mode skill.
license: MIT
---

# Learn

A correction the operator gives in one session is gone in the next unless it lands in the playbook the agent runs. This skill finds each lesson, places it in the file and step where it belongs, and writes it only after the operator picks it. A playbook edit changes every later run, so the operator decides every one.

## Rules

- Write nothing before the operator picks. An edit to a team file reaches teammates, and an edit to any file changes every later run.
- File no tickets and build no checks. A lesson that a lint or a hook could enforce goes in the report as a candidate, and the operator chooses whether to build it, because enforcement is heavier than a playbook line and not every rule deserves it.
- Place an edit with `playbook locate`, never by reading playbook files by hand. A file's quotes see only what its ancestors wrote, and a hand match puts a quote where it does not anchor.
- Quote a short, distinctive phrase, such as the words of a step's bold title without the asterisks. pstack rewrites step text between releases, and a short quote survives more rewrites.

## Steps

1. Collect lessons from the conversation, or from the focus the argument names. A lesson is an operator correction, an instruction the operator gave twice, or a step that ran in a way the operator undid. Write each one as one sentence with the operator's words as evidence. Drop one-offs and facts about one task, because a playbook line applies to every run.
2. Sort each lesson by where it belongs:
   - How one playbook runs: steps 3 to 5 place it.
   - A rule for every run, whatever the playbook, such as how every posted message reads: list it for the operator's mode skill, because a playbook edit reaches only that playbook.
   - How a skill behaves: name the skill and leave it to a skill-editing workflow, such as pstack's reflect.
   - A rule a tool could check: list it as an enforcement candidate.
   - A fact about a person, a project, or a preference outside any playbook: list it for the harness's memory.
3. Find the step. Run `playbook list` to pick the playbook, then `playbook show <playbook>` to read its steps. A step fits when the lesson changes the job that step does. A step the lesson only sits near is no fit, because a rule in the wrong step runs at the wrong time. When no playbook fits, the lesson defines a new standalone playbook, named for the work, with an empty `extends:`, a `when:` sentence, and numbered steps. `locate` needs an existing step, so skip it for a new playbook, and steps 5 and 7 write the steps instead of an edit line.
4. Run `playbook locate <playbook> "<quote>"`. It prints the step, the file that wrote the quoted words, and the user file an edit goes in, extending that writer. Then pick the audience:
   - Personal, in every repo: the file `locate` names, in `playbooks/`.
   - Personal, in one org's or one repo's checkouts: the same parent, with `--scope org` or `--scope repo`, named `<parent>-<org>` or `<parent>-<repo>`. A parent that is a team file needs no scope, because the edit is dormant wherever that team file is missing.
   - The team: a team file in the repo's `.agents/playbooks`, or in the org's playbook source, through a pull request. A team file extends only bundled playbooks and quotes only pstack's text, because pstack reads it without personal files, and carries the org or repo word in its name.

   The operator's words decide between personal and team. "I want" or "my" is personal. "We require" or "the team" is a team rule, so propose the team file and offer the personal file as the other letter.
5. Draft the edit line in pstack's grammar: `- **After|Before|Replace|In** "<quote>" <change>`. Use `In` to add to a step, `Replace` to change words in it, and `After` or `Before` to add a step. Write the change as a plain instruction with its reason, so the rule still makes sense when the tools around it change.
6. Show every proposal in one lettered list. Each entry gives the lesson, its evidence, the playbook and step, the file and its parent, and the edit line. After it, list the lessons that went to the mode skill, another skill, an enforcement candidate, or memory. Wait for the operator's picks.
7. Write each picked edit. For a personal file, run `playbook extend <parent> [<file-name>] <verb> "<quote>" --with -` with the text on stdin, which appends to the file or creates it with `extends:` and a `--when` sentence. For a standalone playbook run `playbook new <name> --when "<sentence>" --from-file -`. Both refuse a bad quote and undo a write that fails `check`. A team file is written by hand in a branch, with frontmatter first: `extends:` naming bundled playbooks, or empty for a standalone playbook, and a `when:` sentence, then opened as a pull request.
8. Run `playbook check`. When it fails on a line this run wrote, remove that line and report the failure. Then run `playbook show <playbook>` and show the changed step with its stem tags, so the operator sees the edit applied where they meant it.
9. Report what was written, where, and what went elsewhere.

When `playbook` is not on `PATH`, run `node scripts/jstack.mjs` from the `playbook` skill's folder instead. [The playbook reference](../playbook/references/cli.md#locate) describes `locate`, and [the playbooks page](../playbook/references/playbooks.md) gives the file format and the apply order.
