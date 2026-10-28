---
name: setup
description: Sets up jstack for one operator, and is safe to rerun. Asks for a handle and a mode trigger, runs pstack's automate-me to write or update the operator's <handle>-mode skill so it computes playbooks through jstack-cli, scaffolds the config dir and layers.json, records the operator's org and its forge owners, links each named repo's team folder into its checkout with a git exclude line, and links the mode skill into the skill folders the operator's harness loads. Use when installing jstack, adding an org or a repo to it, changing the mode trigger, or repairing a config that jstack-cli check reports broken.
compatibility: Requires git, Node, and the pstack plugin with its automate-me and poteto-mode skills.
license: MIT
---

# Setup

This skill turns a fresh install into a working jstack. It produces a `<handle>-mode` skill that computes playbooks through jstack-cli, a config dir for the layers, and team folders linked into the repos. Every step reads what exists and changes only what differs, so a rerun after a crash or a change of mind converges on the same result.

## Rules

- Ask each question as a plain-text lettered list, and accept a letter or a typed answer. A lettered list works in every harness, and the operator answers with one keystroke.
- Offer the answers saved in `layers.json` as the default option. A rerun then needs only confirmations.
- Create files and folders only when missing. To change an existing file, show the operator the diff first. Edit the file in place only after they agree, because the config dir holds their own rules.
- Never delete a file or replace a folder. When something in the way is not what setup would have made, stop and show it to the operator.

## Steps

1. Find the config dir: `$JSTACK_CONFIG`, else `.jstack` in the home directory. Read `layers.json` when it exists, and use its `handle`, `modeTrigger`, and `orgs` as defaults.
2. Ask for the handle. Propose the saved handle, a short form of `git config user.name`, and the logged-in user of the forge CLI when one is installed, then a last letter to type one. The handle names the mode skill, `<handle>-mode`.
3. Ask for the trigger: A manual, B on a matching ask, C every session. Each pick's meaning is in [references/mode-contract.md](references/mode-contract.md).
4. Run pstack's automate-me skill to write the mode skill to `<config>/mode/<handle>-mode/`, or to update it when one exists. One copy in the config dir serves every harness step 9 links it into. Give it the handle, the trigger, and the rules in [references/mode-contract.md](references/mode-contract.md) as fixed requirements. If automate-me is not installed, stop and tell the operator to install pstack, because jstack layers on its poteto-mode playbooks.
5. Ask for the org: its name, and the forge owners whose repos belong to it, such as an organization login. Offer "none" for an operator with no team files. An org scopes `orgs/<org>/` rules to repos with a listed owner, so rules for one employer never reach a side project.
6. Scaffold the config dir and `layers.json` per [references/scaffold.md](references/scaffold.md). Record the handle, the trigger as `manual`, `auto`, or `session`, and the org. Leave `pstack` out of a new file. Step 8's check records the version that jstack-cli resolves, so the file names the same pstack that every later `compute` uses. A version read by hand can name a different install than the one jstack-cli picks.
7. Ask which repos to link, as checkout paths. For each one, find its main checkout and key, link each org standard file into `<config>/repos/<repo>/team/`, link that folder to `<main checkout>/.agents/playbooks`, and add the exclude line, all per [references/scaffold.md](references/scaffold.md). pstack reads team files only from `.agents/playbooks`, and the exclude line keeps the link out of the team's diffs.
8. Run `jstack-cli check --repo <repo>` for each linked repo, or `jstack-cli check` once when no repo is linked. If `jstack-cli` is not on `PATH`, run `node scripts/jstack.mjs` from the `playbook` skill's folder instead. Report every line it prints. A pass records the pstack version in `layers.json`. A broken link or a stale quote that setup finds costs less than one found mid-task.
9. Install the mode skill where the harness loads skills. List the user-level skill folders that exist with the command in [references/scaffold.md](references/scaffold.md), and ask which ones the operator's harness loads. Give one letter per folder found, then a last letter to type a folder. Accept several picks. Link `<config>/mode/<handle>-mode` into each picked folder per that page. A harness finds skills only in its own folders, so without the link `/<handle>-mode` does not exist.
10. Reply with what setup created, edited, linked, and left unchanged, and the command to run the mode skill. Tell the operator to start a new session first, because a harness reads its skill folders when a session starts.
