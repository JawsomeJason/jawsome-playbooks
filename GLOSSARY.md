# Glossary

Terms jstack's docs and skills use, in alphabetical order.

**Anchor quote.** The run of a step's own words, in straight double quotes, that an edit line names so the edit lands on that step. It must match exactly one numbered step, as the lower layers left it, with whitespace collapsed. A pstack upgrade that rewrites the step breaks the quote, and `playbook check` names it.

**Bundled playbook.** A playbook that ships inside pstack's poteto-mode skill. jstack never copies it: it reads it from the installed pstack and applies the layers on top.

**Cascade order.** The fixed order the layers apply in, lowest first: user, org.standard, org.overrides, repo.standard, repo.overrides. A later layer wins, as in CSS cascade layers, and the numbered folders in the config dir spell out the same order.

**`check-playbooks.mjs`.** pstack-claude's checker for project playbooks, at `skills/poteto-mode/scripts/check-playbooks.mjs`. It fails when a project playbook extends a playbook the installed pstack lacks, quotes step text that pstack does not have, or writes a change with no straight-quoted anchor. `playbook check` runs it first when the repo has `.agents/playbooks`.

**Edit line.** A list item (`-`, `*` or `N.`) in a layer file that changes one step: a bold edit verb, an anchor quote, then the change text. A list item with no verb is a note. The grammar comes from pstack-claude's project playbooks policy fork, not upstream pstack, and jstack adds no verbs to it.

**Edit verb.** One of the four bold words an edit line starts with. `**After**` and `**Before**` insert a new step next to the quoted one, `**Replace**` strikes the quoted words and adds the change text after them, and `**In**` appends the change text to the step.

**`extends`.** The frontmatter key that lists, separated by commas, the playbook stems a layer file edits. It patches those playbooks in place and does not create a derived playbook under the file's name. It comes from pstack-claude's project playbooks policy fork, not upstream pstack, and jstack also lets it name a standalone playbook that a lower layer defines.

**Handle.** The short name the operator picks when running `setup`, stored as `handle` in `config.json`. It names the mode skill, `<handle>-mode`.

**Handoff.** A point where a playbook sends the work to another playbook, which the mode skill then computes with `playbook show` and runs. In layer-file text it registers only as a `playbooks/<stem>.md` path, or as a playbook named right after `run`, `per`, `route ... to` or `hand ... to`, written as a bold title, a capitalized title or a kebab-case stem. A lowercase `run babysit` does not register, and `check` never reads the handoff wording inside pstack's own text.

**jstack.** A plugin that layers personal, org and repo playbook edits over pstack-claude's bundled playbooks and checks them against each pstack release. It needs pstack-claude, because project playbooks and `check-playbooks.mjs` exist only in the port. It ships the `playbook`, `learn` and `setup` skills.

**`jstack-cli`.** A compatibility alias of the `playbook` command, with the same flags and output. It spells the playbook commands `jstack-cli playbook show` and so on, and keeps `jstack-cli check` and `jstack-cli doctor` as they are.

**Layer.** One level of playbook edits, held in one folder of the config dir or in a repo's team files. A layer extends only playbooks below it in the cascade order, so `check` fails a file whose `extends` names a playbook that the same or a higher layer defines.

**Mode skill.** The operator's `<handle>-mode` skill, which pstack's automate-me writes during `setup`. It runs poteto-mode first, takes each playbook's steps from `playbook show` instead of applying project playbooks by hand, and names every override in its reply.

**Playbook.** A numbered step list that poteto-mode follows for one kind of recurring work, such as babysitting a PR. Each one is either a bundled playbook or a standalone playbook that a layer defines.

**`playbook`.** jstack's command, `scripts/jstack.mjs` in the `playbook` skill, which needs only Node. Its commands are `list`, `show`, `locate`, `extend`, `new`, `check` and `doctor`. It is not named `jstack` because Java development kits install a `jstack` of their own that can shadow it.

**`playbook check`.** Validates every layer file against the installed pstack, after running pstack-claude's `check-playbooks.mjs` when the repo has `.agents/playbooks`. It reports stale or ambiguous quotes, unknown `extends` stems, unresolved handoffs and step references, and broken links. A pass records the checked pstack version in `config.json`.

**`playbook extend`.** Writes one edit line into a layer file in the user, org overrides or repo overrides layer, and creates the file with `extends: <parent>` when it is missing. It refuses a quote that does not match exactly one step, and undoes a write that adds a `check` problem.

**`playbook locate`.** Names the one step of the computed playbook that a quote finds, and the file each active layer would hold an edit to it in. It judges the quote against the step as the layers below each layer leave it.

**`playbook new`.** Writes a standalone playbook: a file with an empty `extends`, a `when` sentence and numbered steps. It refuses a name that pstack or a layer at or below the chosen one already defines, and a body with edit lines.

**`playbook show`.** Prints one playbook with every layer applied in cascade order, and tags each step with its origin layer and each layer that edited it. Sections after the steps list handoffs, notes, overrides and problems. `compute` is an alias of it.

**Project playbook.** pstack-claude's name for a Markdown file in a repo's `.agents/playbooks/`, with `extends` and `when` frontmatter, that poteto-mode applies over the bundled steps. In jstack, a repo's team files are its project playbooks.

**pstack (upstream).** Lauren Tan's Cursor plugin at [cursor/plugins/pstack](https://github.com/cursor/plugins/tree/main/pstack), which provides poteto-mode and its playbooks. Upstream owns most of the playbook content, including the handoff wording inside it. pstack-claude carries its own policy changes to a few playbooks, such as Babysit, Autopilot and Shipping. It has no project playbooks, `extends` or `check-playbooks.mjs`, so jstack does not run on it.

**pstack-claude.** Michael Denyer's [port of pstack](https://github.com/michael-denyer/pstack-claude) for Claude Code, Codex, Pi, GitHub Copilot, Muse and other harnesses, installed as `pstack@pstack-claude`. It tracks upstream and carries named forks declared in `tools/forks.json`, such as the project playbooks paragraph in its `poteto-mode/SKILL.md` policy fork. jstack builds on this port.

**Standalone playbook.** A playbook that a layer file defines on its own, with an empty `extends` and a stem that names no lower playbook, so its numbered steps are its body. poteto-mode matches it only by its `when` sentence, and it cannot carry edit lines.

**Team file.** A layer file in the org.standard or repo.standard layer, which a repo's `.agents/playbooks/` shows and a pull request changes. It needs `layer` and `source` keys, and may quote only pstack's own text, because pstack's checker reads it without the other layers.

**`when`.** The required frontmatter sentence that names the requests a layer file serves. poteto-mode matches a standalone playbook only by this sentence.
