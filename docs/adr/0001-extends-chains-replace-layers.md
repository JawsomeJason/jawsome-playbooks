# ADR-0001: Extends chains replace numbered layers

**Status**: Accepted
**Decision date**: 2026-10-30

## Context

jstack orders playbook edits by folder. The config dir holds `01-user/`, `02-orgs/<org>/{01-standard,02-overrides}/` and `03-repos/<repo>/{01-team,02-overrides}/`, and each team file declares `layer: org.standard` or `layer: repo.standard`. The cascade applies the five layers in folder order: user, org.standard, org.overrides, repo.standard, repo.overrides. A file's `extends` names the playbook it patches, and a file may take the same stem as the playbook it patches. So `babysit.md` appears in four folders, and `handing-off-to-qa.md` is a standalone playbook in one folder and an edit to that playbook in two others.

The folders have stopped matching where the files live:

- Team files now live in each repo's `.agents/playbooks/`, as committed copies synced from roobet-agents (roobet-agents ADR-0005, `scripts/sync-playbooks.mjs`). Teammates read them without jstack. The `02-orgs/*/01-standard/` and `03-repos/*/01-team/` folders, and the symlinks that put them into each checkout, exist only for the operator.
- pstack-claude already orders project playbooks by `extends`. poteto-mode's "Project playbooks" paragraph says: when the playbook you match is one a project playbook extends, or the task fits that project playbook's `when`, open the project playbook as well, and apply its changes over the bundled steps. `check-playbooks.mjs` fails a project playbook that extends a stem that pstack does not bundle. A team file therefore has exactly one level of parent, and that parent is always a bundled playbook.
- The order spike in `.audit/playbook-cli.tsv` (unit 3) found that the folder order was still needed for one reason. One stem, `handing-off-to-qa`, was both defined and extended, so the order the files were read in decided which file defined it. With unique names, that ambiguity cannot happen.

Each rule below is marked as **[pstack-claude]** or **[jstack]**. **[pstack-claude]** means the behavior comes from pstack-claude, so a pstack-only teammate gets it. **[jstack]** means only jstack provides it. An agent reading a team file must assume only the **[pstack-claude]** rules apply.

## Decision

### Files and where they are found

- **Team files** sit in `<main checkout>/.agents/playbooks/*.md`, at the top level only. **[pstack-claude]** Org files are synced from roobet-agents and pinned in `.agents/playbooks.lock`. Repo files are committed in the repo directly and are not in the lock. jstack does not read the lock, because no rule below needs to know whether a team file came from an org or from the repo. roobet-agents' `sync-playbooks.mjs --check` owns drift.
- A team file extends only bundled pstack stems, or has an empty `extends`. **[pstack-claude]** Its anchor quotes match only bundled text. **[pstack-claude]** It is therefore valid for a pstack-only teammate.
- **User files** sit in the config dir (`$JSTACK_CONFIG` or `~/.jstack`). **[jstack]**

  ```
  ~/.jstack/
  ├── config.json
  ├── playbooks/*.md                 active in every context
  ├── playbooks/orgs/<org>/*.md      active in a checkout whose owner config.json maps to <org>
  └── playbooks/repos/<repo>/*.md    active in the checkout whose repo key is <repo>
  ```

  The folders say *where* a file is active. They never say *what order* files apply in. A user file whose parent is a team file needs no scope folder: it applies only where that team file exists, and elsewhere it is **dormant**. Scope folders are for user files whose parent exists everywhere, such as a bundled playbook or a user standalone, but that should apply in one org or one repo only. Examples are `handing-off-to-qa-frontend` and `syncing-a-roobet-ticket-web-sdks`.
- A user file may extend any bundled playbook, any team file active in the context, or any user file active in the context. **[jstack]** Chains past one level exist only for user files.

### Frontmatter

- `extends` and `when` keep pstack-claude's meaning and syntax. **[pstack-claude]** `when` is required in every file. **[pstack-claude]**
- `layer:` is deleted. jstack reports it as a problem for one release, with the fix ("delete it"). After that release, jstack ignores it like any other unknown key.
- `source:` stops being a jstack rule. It is roobet-agents' review convention, and that repo's sync check enforces it (see the migration plan). jstack ignores it, so `check` no longer lists `proposed` files.
- No new key replaces the 01/02 numbering. The extends graph supplies the order, and the scope folders supply where a file is active.

### Names

1. **Every stem is unique.** No file may take a bundled stem. No two files that can be active in the same context may share a stem. This applies to team files in any checkout that `config.json` `repos` records, and to user files in any scope folder. **[jstack]** This replaces the old rule that a file could target a playbook through its own file name, which was already deprecated. Every file is now addressable by its stem.
2. **Team files carry their scope word**, the org name or the repo key, as one hyphen-separated word, placed where it reads naturally: `opening-a-roobet-pr`, `approving-frontend-snapshots`. **[jstack convention]** The scope word keeps a team file from colliding with a future bundled stem, and it makes provenance readable in handoffs and in `show` output. `check` reports a missing scope word as `info`, not as a failure, because jstack is public and other orgs' team files are not bound by Roobet's convention.
3. **User files that derive from a parent** are named `<parent>-<qualifier>`. **[jstack convention]** The qualifier is the operator's handle for the general personal override (`opening-a-pr-jawsome`). It is the repo or org key for a scoped variant (`handing-off-to-qa-frontend`). It is a descriptive word for a mode variant (`babysit-review-watch`). `playbook extend` proposes `<parent>-<handle>` when no file name is given.
4. **Standalone playbooks** are named for the work, as a gerund phrase or a role (`watching-a-channel`, `number-one`), and follow rule 1 only.

### Resolution: what `playbook show` and poteto-mode run

- A **root** is a bundled playbook, or a standalone playbook (empty `extends`, numbered steps). **[pstack-claude]** A file with a non-empty `extends` is a **patch**. It never becomes a separate step list. **[pstack-claude]**
- A root's **family** is the root plus every active file that reaches it through `extends`, directly or through a chain. **[jstack]** A file that extends several parents belongs to the family of each, such as `running-the-frontend-app` (`feature, bug-fix`). **[pstack-claude]** for a team file, **[jstack]** across chains.
- **"Opening a PR"** resolves the way it does today. poteto-mode matches the bundled `opening-a-pr` by title. **[pstack-claude]** `playbook show opening-a-pr` computes its family: bundled steps, then `opening-a-roobet-pr` (in a Roobet checkout), then `opening-a-pr-jawsome`. A pstack-only teammate gets the bundled steps plus `opening-a-roobet-pr`, which is the same team part. **[pstack-claude]**
- **Any name in a family resolves to its root.** `playbook show opening-a-roobet-pr` prints the `opening-a-pr` family and notes that the asked-for name is a member. **[jstack]** Every route into a family therefore yields the same steps, whether it is a title match, a handoff, or a derived name.
- **Apply order** is a topological sort of the family, so a parent always applies before its children. **[jstack]** Ties between files that do not depend on each other break on two keys:
  1. Team files apply before user files. The team part then matches what pstack-only users see, and personal edits read last.
  2. Within each group, files sort by stem, which is the directory order that `check-playbooks.mjs` uses.

  This reverses one thing from the old cascade. A user file that extends a bundled playbook directly used to apply *below* the team files. It now applies after them.
- **The most derived file wins** in the only sense that matters for a patch. A child applies after its ancestors, so its `Replace` strikes their words and its `In` text lands after theirs. **[jstack]** There is no "pick one leaf": every active member of the family applies, which matches pstack-claude, where every project playbook that extends the matched one opens. **[pstack-claude]**
- **Siblings** are two files with a common parent and neither an ancestor of the other. Both apply. **[pstack-claude]** for team siblings, **[jstack]** for the rest. A file's anchor quotes match only text that its own ancestors wrote, never a sibling's text. **[jstack]**, generalizing pstack-claude's rule that team quotes match only bundled text. The result does not depend on the order siblings happen to be read in. When two siblings `Replace` overlapping words in one step, `check` fails and names both files. The fix is to make one file extend the other. Two siblings that both use `In` or `After` on the same step are fine: their text lands in tie-break order.
- **Overrides** are now recorded by file, not by layer. An override is an `In` or `Replace` on a step that a different file wrote. `show` tags each step with the stem that wrote it and the stems that edited it, and lists each override as `- step 5: opening-a-pr-jawsome added to "Descriptions." (opening-a-pr, after opening-a-roobet-pr)`. **[jstack]**
- **Handoffs** keep working by name. **[jstack]** jstack's parsing of `run`, `per`, `route … to`, `hand … to` and `playbooks/<stem>.md` is unchanged. A handoff name resolves through the stem index (bundled stems and titles, team stems, user stems) to its root's family. A handoff to a stem that is dormant in this context is `info` (the family exists elsewhere). A handoff to a stem that no context defines is a problem. The mode skill rule ("show the handed-off playbook before its steps start") is unchanged.

### Standalone playbooks

User standalones, such as `number-one`, `watching-a-channel`, `reviewing-code` and `building-a-ticket`, are roots. They keep their names and their folder-keyed scripts (`scripts/number-one/`, `scripts/watching-a-channel/`). Other user files may extend them, for example `handing-off-to-qa-frontend`. Team standalones (`matching-a-roobet-design`, `pinging-for-roobet-review`, `syncing-a-roobet-ticket`, `writing-a-roobet-ticket`) are roots that only user files can extend. A team file cannot, because pstack-claude allows team files to extend only bundled stems. **[pstack-claude]** poteto-mode finds any standalone only by its `when`. **[pstack-claude]** jstack also finds it by name through a handoff. **[jstack]**

### What `check` validates

| Check | Result | Provenance |
|---|---|---|
| pstack-claude's `check-playbooks.mjs` passes on `.agents/playbooks` (run first, unchanged) | fail | [pstack-claude] |
| Team file extends a non-bundled stem, or quotes text that is not in its bundled parents | fail (jstack repeats it so `show` refuses the family) | [pstack-claude] |
| Missing `when` | fail | [pstack-claude] |
| An `extends` stem that no context defines (bundled, a team file in any `repos` checkout, or a user file in any scope) | fail | [jstack] |
| An `extends` stem defined in another context only | info: dormant here | [jstack] |
| A cycle among user files (self-extension included) | fail, naming the cycle | [jstack] |
| A stem that equals a bundled stem, or that another file in an overlapping scope already uses | fail, with the `<parent>-<handle>` rename hint | [jstack] |
| An anchor quote that matches no step, or more than one step, in the text its ancestors leave | fail, naming the ancestor that wrote the closest match when it is not a parent | [jstack] |
| Sibling `Replace` edits on overlapping words | fail | [jstack] |
| Unresolved handoff or `<playbook> step N` reference | fail; dormant target is info | [jstack] |
| Team file without its scope word | info | [jstack convention] |
| `layer:` key present; a numbered config layout (`01-user/`, `02-orgs/`, `03-repos/`) present | fail, naming the move into `playbooks/` | [jstack] |
| A standalone with edit lines | fail | [jstack] |

`check` with no repo context discovers team stems from every checkout in `config.json` `repos`. Missing-parent and dormant results are therefore the same from any directory.

### config.json

`config.json` stays: `handle`, `modeTrigger`, `pstack`, `telemetry`, `orgs`, `repos`. `orgs` still maps forge owners to an org name, and it now selects `playbooks/orgs/<org>/`. `repos` still records checkouts. `doctor` reads them, and `check` reads them to discover team stems across repos. `handle` also supplies the default user-file qualifier.

### Commands

- `extend` and `new` write user files only. `--layer user|org|repo` becomes `--scope everywhere|org|repo` (default `everywhere`). `extend` takes an optional file name, defaulting to `<parent>-<handle>`. They keep refusing bad quotes and undoing writes that add a `check` problem.
- `locate` names the step, the stem that wrote it and the stems that edited it, and suggests the parent a new edit must extend. That parent is the file that wrote the quoted words, which is the smallest parent that makes the quote visible.
- `list` shows each root with its origin (`pstack`, `team` or `user`) and its active family members, instead of five layer columns.
- `doctor` stops requiring a `.agents/playbooks` symlink into the config dir and a git exclude line. It fails a leftover symlink into the config dir and reports an untracked `.agents/playbooks` as info.
- No `playbook migrate` ships (open question 3). The one known numbered config dir was migrated with a throwaway script.

## Consequences

- One mechanism, `extends`, orders everything, and it is pstack-claude's own mechanism. The team part of any family that jstack computes is what a pstack-only teammate runs.
- The org and repo team folders, the per-repo symlinks, the git exclude line, `layer:` and the five-layer vocabulary all go away. `layers.md` is retired.
- Every file is addressable by name. A personal edit to a team rule is a user file that extends the team file by name. It is dormant outside the repos that carry that file, so the `02-overrides/` folders are no longer needed for scoping.
- Renames touch three repos at once, and each repo's handoff text must follow the renames. `check` catches every stale name.
- The order changes in one place: a personal file that patches a bundled playbook directly now applies after the team files, not before them. The golden diff shows exactly where that moves text.
- Chains are only as deep as user files make them. Team depth stays at one, which pstack-claude enforces.
- jstack is a public repo. Other users' numbered config dirs fail `check` until they move their files into `playbooks/` by hand, as `check`'s message and `playbooks.md` describe.

## Migration plan

Each step ends in a state someone can verify. Work happens in a jstack worktree, because `~/.local/bin/jstack-cli` runs the live `~/code/jstack` checkout, and the watcher uses it. The cutover (steps 12–16) happens in one sitting.

### jstack (code, docs, tests, glossary)

1. **Baseline.** Run `.audit/golden/capture.sh` with the current CLI into `.audit/golden/pre-extends/`, and add a normalizer that reduces each `compute --json` to its effective step text. *Verify:* a rerun gives an empty diff.
2. **Tests first, in the new layout.** Restructure `tests/fixtures/config/` and change `tests/helpers.mjs` `world()` so that it writes team files into the checkout's `.agents/playbooks/` with a lock, instead of linking them. Add failing tests for: cycle; missing parent; dormant parent; stem that collides with a bundled stem; team file that extends a non-bundled stem; sibling `Replace` conflict; quotes that see only ancestors; show by derived name resolving to the root; apply order (topological, team before user, then stem); handoff to a derived name; `layer:` and numbered layout errors that name `migrate`; `extend --scope`; `extend` default name. *Verify:* new tests fail, and the old ones fail only on layout.
3. **Graph engine in `skills/playbook/scripts/jstack.mjs`.** Delete `DIR`, `LEGACY_DIRS`, `LAYERS`, `ORDER`, `label` and the layer-ranked `cascade`. Add file collection (team plus the three user scopes), a stem index with collision checks, cycle detection, a family topological sort, and family application with ancestor-only `locate`. Rework `collectFiles`, `configStems` (now across `repos` checkouts), `computed`, `editTarget`, `anchorProblem`, `below`, `writeDir`, `runList`, `runLocate`, `runExtend`, `runNew`, `checkReport` (drop `proposed`) and `checkRepo`. *Verify:* `node --test` passes.
4. **JSON schemas.** In `references/schemas/jstack.{compute,list,locate,check}.schema.json`, replace `layer`, `origin` and `touched` layer names with stems, plus `kind: pstack|team|user`. *Verify:* schema tests pass against the new output.
5. **`playbook migrate`** (one release). It moves files, rewrites `extends` from `--map`, deletes the numbered folders that are left empty, and reruns `check`. *Verify:* a test migrates the old fixture layout into the new one byte for byte, and running it again changes nothing.
6. **Hook.** Rename `hooks/layer-edits.mjs` to `hooks/playbook-edits.mjs`. Its path regex becomes `^playbooks/(?:(?:orgs|repos)/[^/]+/)?(?!README\.md$)[^/]+\.md$`. Update `hooks/hooks.json` and `tests/hooks.test.mjs`. *Verify:* the hook tests pass, and a direct Edit of `~/.jstack/playbooks/x.md` is redirected.
7. **Retire `layers.md`.** Rename `skills/playbook/references/layers.md` to `skills/playbook/references/playbooks.md` and rewrite it at about half its length. It keeps the file grammar, where files are found (team dir and the three user scopes), config.json, names, resolution (roots, families, apply order, siblings, handoffs) and the check table. Every rule is tagged [pstack-claude] or [jstack]. *Verify:* no file links to `layers.md` (`grep -r layers.md` comes up empty).
8. **Other docs.** Update `references/cli.md` (`--scope`, `extend` default name, `list`, `locate`, `migrate`, the `show` example tags), `skills/playbook/SKILL.md` (description and the "Write a layer file" section), `skills/learn/SKILL.md` (pick personal vs team by audience, and the parent from `locate`, not a layer), `skills/setup/SKILL.md` and `references/scaffold.md` (scaffold `playbooks/`, stop linking team folders and writing exclude lines), `references/mode-contract.md` (stems, not layers, in the override rule), `README.md`, `CONTRIBUTING.md`, `AGENTS.md` if it names layers, and the descriptions in `.claude-plugin/plugin.json`, `.claude-plugin/marketplace.json`, `.codex-plugin/plugin.json`, `.muse-plugin/plugin.json` and `package.json`. *Verify:* `grep -rE "01-user|02-orgs|03-repos|cascade order|org\.standard|repo\.overrides" --exclude-dir=.audit --exclude-dir=.git` is empty apart from `migrate` and its test.
9. **Glossary** (`GLOSSARY.md`), with every entry tagged [pstack-claude] or [jstack]:
   - *Remove:* **Cascade order**, **Layer**.
   - *Rewrite:* **Anchor quote** (matches the step as its ancestors leave it). **`extends`** (names parents by stem; one bundled level is [pstack-claude], chains are [jstack]; it still patches in place). **Standalone playbook** (empty `extends`, unique stem; no longer "names no lower playbook"). **Team file** (a file in `.agents/playbooks/`; drop `layer`/`source`). **Project playbook** (provenance). **Handoff** (resolves to the root's family). **jstack** (no "layers"). **`playbook show`** (family, stem tags). **`playbook check`** (the new table). **`playbook extend`** (user files, `--scope`, default name). **`playbook locate`** (writer stem, suggested parent). **`playbook new`** (`--scope`). **Mode skill** (names overrides by stem). **Handle** (default qualifier).
   - *Add:* **Root**, **Patch**, **Family**, **Parent**, **Sibling**, **Dormant**, **Scope folder**, **Scope word**, **User file**, **`playbook migrate`**.
   - *Unchanged:* **Bundled playbook**, **`check-playbooks.mjs`**, **Edit line**, **Edit verb**, **`jstack-cli`**, **`playbook`**, **pstack (upstream)**, **pstack-claude**, **`when`**, **Playbook**.

   *Verify:* every glossary term used in `playbooks.md` resolves, and no glossary term is left unused.
10. **Rename test fixtures** (old → new, under `tests/fixtures/`):
    - `config/01-user/babysit.md` → `config/playbooks/babysit-tester.md`
    - `config/01-user/opening-a-pr.md` → `config/playbooks/opening-a-pr-tester.md`
    - `config/01-user/triage.md` → `config/playbooks/triage.md`
    - `config/02-orgs/acme/01-standard/babysit.md` → `team/acme/babysitting-an-acme-pr.md` (written into the checkout and the lock by `world()`)
    - `config/02-orgs/acme/02-overrides/babysit.md` → `config/playbooks/babysitting-an-acme-pr-tester.md` (extends `babysitting-an-acme-pr`)
    - `config/02-orgs/acme/02-overrides/triage.md` → `config/playbooks/orgs/acme/triage-acme.md` (extends `triage`)
    - `config/03-repos/web/01-team/web-release.md` → `team/web/releasing-web.md` (repo file, not in the lock)
    - `config/03-repos/web/02-overrides/babysit.md` → `config/playbooks/repos/web/babysitting-an-acme-pr-web.md` (extends `babysitting-an-acme-pr`)
    - `config/03-repos/web/02-overrides/triage.md` → `config/playbooks/repos/web/triage-web.md` (extends `triage-acme`, a three-deep chain)
    - `config/03-repos/web/02-overrides/web-release.md` → `config/playbooks/releasing-web-tester.md` (extends `releasing-web`; dormant outside `web`)

    *Verify:* `node --test` passes, which covers steps 2–10.
11. **Golden compare.** Copy `.audit/golden/config` and migrate it with the rename map below. Capture into `.audit/golden/post-extends/`, then diff the normalized step text against `pre-extends`. Allowed diffs: tags (layer → stem), renamed handoff names, and the text order on steps where a direct-to-bundled user file and a team file both use `In`. *Verify:* every other diff is zero, and each allowed diff is listed in `.audit/playbook-cli.tsv`.
12. **Release** 0.7.0 (minor; 0.x), then merge to main. This changes the live CLI, so do steps 13–20 right after it.

### roobet-agents

13. **One PR** (it can merge before step 12, because Jason's checkouts still use symlinks until step 18). Rename the files with `git mv` and delete each `layer:` line:
    - `playbooks/babysit.md` → `playbooks/babysitting-a-roobet-pr.md`
    - `playbooks/opening-a-pr.md` → `playbooks/opening-a-roobet-pr.md`
    - `playbooks/matching-a-design.md` → `playbooks/matching-a-roobet-design.md`
    - `playbooks/pinging-for-review.md` → `playbooks/pinging-for-roobet-review.md`
    - `playbooks/syncing-a-ticket.md` → `playbooks/syncing-a-roobet-ticket.md`
    - `playbooks/writing-a-ticket.md` → `playbooks/writing-a-roobet-ticket.md`
14. **`scripts/sync-playbooks.mjs`.** `sync` deletes each copy that the previous lock lists and the source no longer has, so a rename leaves no stale copy. It still never touches files outside the lock. `check` also fails a source playbook that lacks `when` or `source`, carries `layer:`, or has no `roobet` word in its name. Add cases to `scripts/sync-playbooks.test.mjs` for the rename cleanup and each lint. *Verify:* `node --test` passes. Sync into a temp clone of frontend, then `check-playbooks.mjs` passes there and no old-name copy remains.
15. **ADR-0005 amendment** (`docs/adr/0005-playbooks-as-team-layer.md`). Set Amended to the merge date. Add three Decision bullets: org playbooks carry the org word in their names and extend only bundled pstack playbooks; a repo's own playbooks are committed in that repo outside the lock; `layer:` is gone. Change Related to point at jstack ADR-0001 and `playbooks.md` instead of `layers.md`. Also update `GLOSSARY.md` (drop **Layer**, reword **jstack**) and `README.md` line 25 ("Layers personal and team playbooks…" becomes "Extends team playbooks with personal ones…"). *Verify:* the links resolve, and `grep -rn "layer" docs README.md GLOSSARY.md` returns only historical text.

### dotclaude (`~/code/dotclaude/jstack`)

16. **Migrate the files.** Run `playbook migrate --map …` as a dry run, review the output, then `--apply`. File renames (old → new):

    | Old | New | `extends` after |
    |---|---|---|
    | `01-user/auditing-agent-rules.md` | `playbooks/auditing-agent-rules.md` | (standalone) |
    | `01-user/babysit-review-watch.md` | `playbooks/babysit-review-watch.md` | `babysit` |
    | `01-user/babysit.md` | `playbooks/babysit-jawsome.md` | `babysit` |
    | `01-user/bug-fix.md` | `playbooks/bug-fix-jawsome.md` | `bug-fix` |
    | `01-user/drafting-a-message.md` | `playbooks/drafting-a-message.md` | (standalone) |
    | `01-user/feature.md` | `playbooks/feature-jawsome.md` | `feature` |
    | `01-user/getting-a-pr-review.md` | `playbooks/getting-a-pr-review.md` | (standalone) |
    | `01-user/getting-a-transcript.md` | `playbooks/getting-a-transcript.md` | (standalone) |
    | `01-user/number-one.md` | `playbooks/number-one.md` | (standalone) |
    | `01-user/opening-a-pr.md` | `playbooks/opening-a-pr-jawsome.md` | `opening-a-pr` |
    | `01-user/reviewing-code.md` | `playbooks/reviewing-code.md` | (standalone) |
    | `01-user/reviewing-other-prs.md` | `playbooks/reviewing-other-prs.md` | (standalone) |
    | `01-user/shipping.md` | `playbooks/shipping-jawsome.md` | `shipping` |
    | `01-user/testing-in-the-browser.md` | `playbooks/testing-in-the-browser.md` | (standalone) |
    | `01-user/watching-a-channel.md` | `playbooks/watching-a-channel.md` | (standalone) |
    | `01-user/watching-review-asks.md` | `playbooks/watching-review-asks.md` | (standalone) |
    | `02-orgs/roobet/02-overrides/babysit.md` | `playbooks/babysitting-a-roobet-pr-jawsome.md` | `babysitting-a-roobet-pr` |
    | `02-orgs/roobet/02-overrides/building-a-ticket.md` | `playbooks/orgs/roobet/building-a-ticket.md` | (standalone) |
    | `02-orgs/roobet/02-overrides/handing-off-to-qa.md` | `playbooks/orgs/roobet/handing-off-to-qa.md` | (standalone) |
    | `02-orgs/roobet/02-overrides/matching-a-design.md` | `playbooks/matching-a-roobet-design-jawsome.md` | `matching-a-roobet-design` |
    | `02-orgs/roobet/02-overrides/pinging-for-review.md` | `playbooks/pinging-for-roobet-review-jawsome.md` | `pinging-for-roobet-review` |
    | `03-repos/frontend/02-overrides/handing-off-to-qa.md` | `playbooks/repos/frontend/handing-off-to-qa-frontend.md` | `handing-off-to-qa` |
    | `03-repos/web-sdks/02-overrides/bumping-consumers.md` | `playbooks/repos/web-sdks/bumping-consumers.md` | (standalone) |
    | `03-repos/web-sdks/02-overrides/handing-off-to-qa.md` | `playbooks/repos/web-sdks/handing-off-to-qa-web-sdks.md` | `handing-off-to-qa` |
    | `03-repos/web-sdks/02-overrides/releasing.md` | `playbooks/releasing-web-sdks-jawsome.md` | `releasing-web-sdks` |
    | `03-repos/web-sdks/02-overrides/syncing-a-ticket.md` | `playbooks/repos/web-sdks/syncing-a-roobet-ticket-web-sdks.md` | `syncing-a-roobet-ticket` |

    Files that leave dotclaude:
    - `02-orgs/roobet/01-standard/{babysit,matching-a-design,opening-a-pr,pinging-for-review,syncing-a-ticket,writing-a-ticket}.md` are deleted. roobet-agents is now their source.
    - The `03-repos/{frontend,web-sdks}/01-team/` links to those files are deleted.
    - `03-repos/frontend/01-team/approving-snapshots.md` → `frontend/.agents/playbooks/approving-frontend-snapshots.md`
    - `03-repos/frontend/01-team/running-the-app.md` → `frontend/.agents/playbooks/running-the-frontend-app.md`
    - `03-repos/web-sdks/01-team/releasing.md` → `web-sdks/.agents/playbooks/releasing-web-sdks.md`
    - `03-repos/web-sdks/01-team/verifying-a-component.md` → `web-sdks/.agents/playbooks/verifying-a-web-sdks-component.md`

    Each of the four moved team files also drops `layer:`.

    Where an old override quoted text that a lower layer wrote, `check` names the quote. For example, if the Roobet babysit override quotes text from the operator's babysit file, the fix is to add that file as a second parent (`extends: babysitting-a-roobet-pr, babysit-jawsome`).
17. **Repoint handoff text** to the new names: `pinging-for-review` → `pinging-for-roobet-review` (in `getting-a-pr-review`, `babysitting-a-roobet-pr-jawsome`, `pinging-for-roobet-review-jawsome`, and `mode/jawsome-mode/SKILL.md`); `syncing-a-ticket` → `syncing-a-roobet-ticket` (in `shipping-jawsome`, `building-a-ticket`, `releasing-web-sdks-jawsome`); `writing-a-ticket` → `writing-a-roobet-ticket` (in `bumping-consumers`); `releasing` → `releasing-web-sdks` (in `releasing-web-sdks-jawsome` and the team `releasing-web-sdks`). Also change the jawsome-mode "Playbooks" paragraph to "name each step another file overrode: the file stem, and the step." *Verify:* `playbook check` reports no unresolved handoff.
18. **Swap the checkouts.** In `~/code/frontend` and `~/code/web-sdks`, replace the `.agents/playbooks` symlink with a real folder. Run `node ~/code/roobet-agents/scripts/sync-playbooks.mjs <checkout>`, then add the repo's own renamed files. The git exclude line stays until the repo PRs land (open question 1). *Verify:* `check-playbooks.mjs` passes in each checkout, and `sync-playbooks.mjs <checkout> --check` passes.
19. **Other dotclaude references.** Update the layer paths in `plugins/toolbox/skills/toolbox/SKILL.md`, `plugins/guard/skills/enforce/SKILL.md` and `plugins/guard/skills/harden/SKILL.md`. *Verify:* `grep -rE "01-user|02-orgs|03-repos" ~/code/dotclaude --exclude-dir=.git` is empty.
20. **End-to-end check.** Run `playbook check` in frontend, in web-sdks and in `/tmp`, and `playbook doctor`. `playbook show` must work for `opening-a-pr`, `babysit`, `handing-off-to-qa` and `syncing-a-roobet-ticket` in both repos. Rerun the step 11 golden compare against the live config. *Verify:* all pass. The only diffs are the named ones. `babysitting-a-roobet-pr-jawsome` is dormant in `/tmp` and active in both repos.

### Outside the three repos (follows open question 1)

21. Open PRs in frontend and web-sdks that commit `.agents/playbooks/` and `.agents/playbooks.lock`, and remove the exclude line from Jason's clone after they merge.

## Open questions, decided

The operator approved the migration with these defaults, which he can still overrule:

1. The four repo-specific team files stay in the operator's config as user files under `playbooks/repos/<repo>/`. No PRs go into frontend or web-sdks, so step 21 is not done, and those checkouts keep untracked `.agents/playbooks` folders behind the git exclude line.
2. A variant with a narrower `when` always applies, matching pstack-claude.
3. No `playbook migrate`: steps 5 and 16 use a throwaway script kept outside the repos, and the release rejects numbered layouts outright.

The questions as first asked:

1. **The four repo-specific team files** (`approving-frontend-snapshots`, `running-the-frontend-app`, `releasing-web-sdks`, `verifying-a-web-sdks-component`): commit them to frontend and web-sdks for team review now? Move them into roobet-agents? Or keep them as untracked copies that only you have until the team agrees?
2. **Variants.** A derived file with a narrower `when`, like `babysit-review-watch` ("following the conversation on someone else's PR"), applies on every babysit today, and in pstack-claude. Should jstack apply such a file only when the task fits its `when`? Default if you don't decide: apply it always, matching pstack-claude.
3. **Other jstack users.** Ship `playbook migrate` and a one-release deprecation for public users? Or treat you as the only user, migrate dotclaude with a throwaway script, and have the new release reject numbered layouts outright?

## Related

- roobet-agents [ADR-0005: Team playbooks live here and sync into each repo as committed copies](https://github.com/project-atl/roobet-agents/blob/main/docs/adr/0005-playbooks-as-team-layer.md) and `scripts/sync-playbooks.mjs`
- pstack-claude `skills/poteto-mode/SKILL.md`, "Project playbooks", and `skills/poteto-mode/scripts/check-playbooks.mjs`
- [playbooks.md](../../skills/playbook/references/playbooks.md), which replaced `layers.md`; [GLOSSARY.md](../../GLOSSARY.md)
- `.audit/playbook-cli.tsv` unit 3 (order spike) and `.audit/playbook-cli-plan.md` units 9–12
