# Glossary

Terms jawsome-playbooks' docs and skills use, in alphabetical order. Each entry is tagged **[pstack-claude]** when the term or behavior comes from pstack-claude, so a teammate without jawsome-playbooks has it too, or **[jawsome-playbooks]** when only jawsome-playbooks provides it. An entry about upstream pstack says so.

**Anchor quote.** The run of a step's own words, in straight double quotes, that an edit line names so the edit lands on that step. [pstack-claude] It must match exactly one numbered step, as the file's ancestors leave it, with whitespace collapsed; a sibling's text is invisible to it. [jawsome-playbooks] A pstack upgrade that rewrites the step breaks the quote, and `playbook check` names it.

**Bundled playbook.** A playbook that ships inside pstack's poteto-mode skill. jawsome-playbooks never copies it: it reads it from the installed pstack and applies the files that extend it on top. [pstack-claude]

**`check-playbooks.mjs`.** pstack-claude's checker for project playbooks, at `skills/poteto-mode/scripts/check-playbooks.mjs`. It fails when a project playbook extends a playbook the installed pstack lacks, quotes step text that pstack does not have, or writes a change with no straight-quoted anchor. `playbook check` runs it first when the repo has `.agents/playbooks`. [pstack-claude]

**Dormant.** A file whose parent exists only in another context, such as a user file that extends a team file another repo has. It applies nowhere here, and `check` reports it as info, not a problem. A child of a dormant file is dormant too. [jawsome-playbooks]

**Edit line.** A list item (`-`, `*` or `N.`) in a playbook file that changes one step: a bold edit verb, an anchor quote, then the change text. A list item with no verb is a note. The grammar comes from pstack-claude's project playbooks policy fork, not upstream pstack, and jawsome-playbooks adds no verbs to it. [pstack-claude]

**Edit verb.** One of the four bold words an edit line starts with. `**After**` and `**Before**` insert a new step next to the quoted one, `**Replace**` strikes the quoted words and adds the change text after them, and `**In**` appends the change text to the step. [pstack-claude]

**`extends`.** The frontmatter key that names a file's parents by stem, separated by commas. It patches them in place and does not create a derived playbook under the file's name. One level, a team file over bundled playbooks, is [pstack-claude]. Chains, where a user file extends a team file or another user file, are [jawsome-playbooks]. The chains set the apply order.

**Family.** A root and every active file that reaches it through `extends`, directly or through a chain. A file with several parents belongs to each one's family. `playbook show` applies a whole family. [pstack-claude] for team files, [jawsome-playbooks] across chains.

**Handle.** The short name the operator picks when running `setup`, stored as `handle` in `config.json`. It names the mode skill, `<handle>-mode`, and is the default qualifier in a user file's name, `<parent>-<handle>`. [jawsome-playbooks]

**Handoff.** A point where a playbook sends the work to another playbook, which the mode skill then computes with `playbook show` and runs. In a playbook file it registers only as a `playbooks/<stem>.md` path, or as a playbook named right after `run`, `per`, `route ... to` or `hand ... to`, written as a bold title, a capitalized title or a kebab-case stem. A name resolves to its root's family. A lowercase `run babysit` does not register, and `check` never reads the handoff wording inside pstack's own text. [jawsome-playbooks]

**jawsome-playbooks.** Called jstack before 0.8.0, which renamed it. A plugin that extends pstack-claude's bundled playbooks with team and personal playbook files, ordered by their `extends` chains, and checks them against each pstack release. It needs pstack-claude, because project playbooks and `check-playbooks.mjs` exist only in the port. It ships the `playbook`, `learn` and `setup` skills. [jawsome-playbooks]

**`jstack-cli`.** A deprecated alias of the `playbook` command, removed in 0.9.0, with the same flags and output. It spells the playbook commands `jstack-cli playbook show` and so on, and keeps `jstack-cli check` and `jstack-cli doctor` as they are. [jawsome-playbooks]

**Mode skill.** The operator's `<handle>-mode` skill, which pstack's automate-me writes during `setup`. It runs poteto-mode first, takes each playbook's steps from `playbook show` instead of applying project playbooks by hand, and names every override by the stem of the file that made it. [jawsome-playbooks]

**Parent.** A stem a file's `extends` names. A team file's parents are bundled playbooks only [pstack-claude]; a user file's parents may also be team files and user files [jawsome-playbooks].

**Patch.** A file with a non-empty `extends`. It never becomes a step list of its own: it edits its family's root. [pstack-claude]

**Playbook.** A numbered step list that poteto-mode follows for one kind of recurring work, such as babysitting a PR. Each one is either a bundled playbook or a standalone playbook. [pstack-claude]

**`playbook`.** jawsome-playbooks' command, `scripts/playbook.mjs` in the `playbook` skill, which needs only Node. Its commands are `list`, `show`, `locate`, `extend`, `new`, `check` and `doctor`. [jawsome-playbooks]

**`playbook check`.** Validates every team file and active user file against the installed pstack, after running pstack-claude's `check-playbooks.mjs` when the repo has `.agents/playbooks`. It reports stale or ambiguous quotes, missing parents, cycles, repeated stems, sibling `Replace` clashes, unresolved handoffs and step references, retired `layer:` keys and numbered folders, and broken links, and notes dormant files. A pass records the checked pstack version in `config.json`. [jawsome-playbooks]

**`playbook extend`.** Writes one edit line into a user file, in `playbooks/` or the scope folder `--scope` picks, and creates the file with `extends: <parent>` when it is missing. The file name defaults to `<parent>-<handle>`. It refuses a quote that does not match exactly one step its parent can see, and undoes a write that adds a `check` problem. [jawsome-playbooks]

**`playbook locate`.** Names the one step of the computed family that a quote finds, the stems that wrote and edited that step, the file that wrote the quoted words, and the user file an edit belongs in, which extends that writer. [jawsome-playbooks]

**`playbook new`.** Writes a standalone playbook in `playbooks/` or the scope folder `--scope` picks: a file with an empty `extends`, a `when` sentence and numbered steps. It refuses a name pstack or any file already uses, and a body with edit lines. [jawsome-playbooks]

**`playbook show`.** Prints a root's family with every member applied in apply order, and tags each step with the stem of the file that wrote it and each stem that edited it. Any member's name prints its root's family. Sections after the steps list the family, handoffs, notes, overrides and problems. `compute` is an alias of it. [jawsome-playbooks]

**Project playbook.** pstack-claude's name for a Markdown file in a repo's `.agents/playbooks/`, with `extends` and `when` frontmatter, that poteto-mode applies over the bundled steps. In jawsome-playbooks, a repo's team files are its project playbooks. [pstack-claude]

**pstack (upstream).** Lauren Tan's Cursor plugin at [cursor/plugins/pstack](https://github.com/cursor/plugins/tree/main/pstack), which provides poteto-mode and its playbooks. Upstream owns most of the playbook content, including the handoff wording inside it. pstack-claude carries its own policy changes to a few playbooks, such as Babysit, Autopilot and Shipping. It has no project playbooks, `extends` or `check-playbooks.mjs`, so jawsome-playbooks does not run on it.

**pstack-claude.** Michael Denyer's [port of pstack](https://github.com/michael-denyer/pstack-claude) for Claude Code, Codex, Pi, GitHub Copilot, Muse and other harnesses, installed as `pstack@pstack-claude`. It tracks upstream and carries named forks declared in `tools/forks.json`, such as the project playbooks paragraph in its `poteto-mode/SKILL.md` policy fork. jawsome-playbooks builds on this port.

**Root.** A bundled playbook, or a standalone playbook. Every family has one root, and `show` prints a family under its root's name. [pstack-claude]

**Scope folder.** `playbooks/orgs/<org>/` or `playbooks/repos/<repo>/` in the config dir. A user file there is active only in that org's or that repo's checkouts. The folder says where a file is active, never its order. [jawsome-playbooks]

**Scope word.** The org name or repo key that a team file carries in its name, as one hyphen-separated word, such as `roobet` in `opening-a-roobet-pr`. It keeps a team file from colliding with a future bundled stem. `check` reports a missing one as info. [jawsome-playbooks]

**Sibling.** A file that shares a parent with another and neither descends from the other. Both apply, and neither's quotes see the other's text. Their `In` and `After` text lands in apply order, and two siblings that `Replace` the same words fail `check`. [pstack-claude] for team siblings, [jawsome-playbooks] for the rest.

**Standalone playbook.** A playbook a file defines on its own, with an empty `extends` and a unique stem, so its numbered steps are its body. poteto-mode matches it only by its `when` sentence [pstack-claude], and jawsome-playbooks also finds it by name through a handoff [jawsome-playbooks]. It cannot carry edit lines.

**Team file.** A playbook file in a repo's `.agents/playbooks/`, which the repo commits and a pull request changes. [pstack-claude] It extends only bundled playbooks and quotes only pstack's text, because pstack's checker reads it without personal files. [pstack-claude]

**User file.** A playbook file in the config dir, in `playbooks/` or a scope folder. Only user files form chains, and `playbook extend` and `playbook new` write them. [jawsome-playbooks]

**`when`.** The required frontmatter sentence that names the requests a file serves. poteto-mode matches a standalone playbook only by this sentence. [pstack-claude]
