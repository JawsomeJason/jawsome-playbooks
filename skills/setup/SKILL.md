---
name: setup
description: Sets up jawsome-playbooks for one operator, and is safe to rerun. Asks for a handle and a mode trigger, runs pstack's automate-me to write or update the operator's <handle>-mode skill so it computes playbooks through the playbook command, scaffolds the config dir and config.json, records the operator's org and its forge owners, records each named repo's main checkout, and links the mode skill into the skill folders the operator's harness loads. Use when installing jawsome-playbooks, adding an org or a repo to it, changing the mode trigger, or repairing a config that playbook check reports broken.
compatibility: Requires git, Node, and the pstack plugin with its automate-me and poteto-mode skills.
license: MIT
---

# Setup

This skill turns a fresh install into a working jawsome-playbooks install. It produces a `<handle>-mode` skill that computes playbooks through the playbook command, a config dir for the operator's playbook files, and a record of each repo's checkout. Every step reads what exists and changes only what differs, so a rerun after a crash or a change of mind converges on the same result.

## Rules

- Ask each question as a plain-text lettered list, and accept a letter or a typed answer. A lettered list works in every harness, and the operator answers with one keystroke.
- Offer the answers saved in `config.json` as the default option. A rerun then needs only confirmations.
- Create files and folders only when missing. To change an existing file, show the operator the diff first. Edit the file in place only after they agree, because the config dir holds their own rules.
- Never delete a file or replace a folder. When something in the way is not what setup would have made, stop and show it to the operator.

## Steps

1. Run `playbook doctor`. If `playbook` is not on `PATH`, run `node scripts/playbook.mjs doctor` from the `playbook` skill's folder. Show the operator its output. Doctor checks the `playbook` link and prints the `ln -s` command when it is missing. Offer to run it, or `playbook doctor --fix`, so the link lands in `$HOME/.local/bin`. On a rerun, the `✗` lines show which steps below have work to do, so the questions go to what is broken.
2. Find the config dir: `$PLAYBOOKS_CONFIG`, else `.jawsome-playbooks` in the home directory. Read `config.json` when it exists, and use its `handle`, `modeTrigger`, and `orgs` as defaults.
3. Ask for the handle. Propose the saved handle, a short form of `git config user.name`, and the logged-in user of the forge CLI when one is installed, then a last letter to type one. The handle names the mode skill, `<handle>-mode`.
4. Ask for the trigger: A manual, B on a matching ask, C every session. Each pick's meaning is in [references/mode-contract.md](references/mode-contract.md).
5. Run pstack's automate-me skill to write the mode skill to `<config>/mode/<handle>-mode/`, or to update it when one exists. One copy in the config dir serves every harness step 10 links it into. Give it the handle, the trigger, and the rules in [references/mode-contract.md](references/mode-contract.md) as fixed requirements. If automate-me is not installed, stop and tell the operator to install pstack, because jawsome-playbooks builds on its poteto-mode playbooks.
6. Ask for the org: its name, and the forge owners whose repos belong to it, such as an organization login. Offer "none" for an operator with no team files. An org scopes `playbooks/orgs/<org>/` files to repos with a listed owner, so rules for one employer never reach a side project.
7. Scaffold the config dir and `config.json` per [references/scaffold.md](references/scaffold.md). Record the handle, the trigger as `manual`, `auto`, or `session`, and the org. Leave `pstack` out of a new file. Step 9's check records the version that playbook resolves, so the file names the same pstack that every later `show` uses. A version read by hand can name a different install than the one playbook picks.
8. Ask which repos to record, as checkout paths. For each one, find its main checkout and key, and record it as `repos.<repo>.checkout` in `config.json`, per [references/scaffold.md](references/scaffold.md). Team playbooks are files the repo commits in `.agents/playbooks`, where pstack reads them, so setup links nothing into the checkout. `playbook check` reads the recorded checkouts to find team playbooks from any directory, and `playbook doctor` reads them to check each repo.
9. Run `playbook check --repo <repo>` for each recorded repo, or `playbook check` once when none is recorded. If `playbook` is not on `PATH`, run `node scripts/playbook.mjs` from the `playbook` skill's folder instead. Report every line it prints. A pass records the pstack version in `config.json`. A stale quote or a broken name that setup finds costs less than one found mid-task.
10. Install the mode skill where the harness loads skills. List the user-level skill folders that exist with the command in [references/scaffold.md](references/scaffold.md), and ask which ones the operator's harness loads. Give one letter per folder found, then a last letter to type a folder. Accept several picks. Link `<config>/mode/<handle>-mode` into each picked folder per that page. A harness finds skills only in its own folders, so without the link `/<handle>-mode` does not exist.
11. Run `playbook doctor` again, and show the operator its output. Every line should be `✓` or `-`, including the `playbook` command link. A `✗` that remains is a step that did not take, so name it instead of reporting success.
12. Reply with what setup created, edited, recorded, linked, and left unchanged, and the command to run the mode skill. Tell the operator to start a new session first, because a harness reads its skill folders when a session starts.
