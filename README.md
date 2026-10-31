# jawsome-playbooks

jawsome-playbooks, called jstack before 0.8.0, extends team playbooks with personal ones, over pstack's bundled poteto-mode playbooks. Each file names the playbook it changes in `extends`, as pstack-claude's project playbooks do, and those chains set the order: parents first, team files before personal ones. `playbook` prints each playbook with every file that extends it applied, tags each step with the file that wrote it, and lists every override. An agent runs one step list, and you see whose rule changed which step.

jawsome-playbooks keeps pstack's playbook format and edit grammar, adds no verbs, and never pins a pstack version. After a pstack upgrade, `playbook check` names each quote that no longer matches its step.

jawsome-playbooks ships three skills. The `playbook` skill runs `playbook` for an agent. The `learn` skill turns a session's corrections into proposed playbook edits and writes the ones you pick. The `setup` skill writes your `<handle>-mode` skill, scaffolds the config dir, and records your repos' checkouts. You can rerun `setup` at any time.

In Claude Code, the plugin's hook stops an agent from reading an installed pstack playbook file directly and names the `playbook show` command to run instead. That file holds only pstack's steps, so reading it would skip your edits.

A second hook blocks a direct Edit or Write of a top-level `.md` file, other than a `README.md`, in `playbooks/`, `playbooks/orgs/*/` or `playbooks/repos/*/` of your config dir, resolving symlinks, and names `playbook extend` and `playbook new` instead. Those commands accept only valid grammar and undo a write that adds a `playbook check` problem. The hook allows a direct edit of a file that has a `check` problem, so a stale quote can always be repaired, and it allows the edit and says so when `check` cannot run. Set `PLAYBOOKS_ALLOW_EDITS=1` to edit by hand anyway. The `learn` skill writes personal files through the commands, so the hook does not stop it.

The hooks have known gaps. A Bash command can still write a playbook file (`sed -i`, `tee`, a redirect) or read a bundled playbook that mentions `jstack-cli`, `playbook.mjs` or `playbook show` anywhere in the command. The read hook covers Read and Bash only, so Grep and Glob can still read a bundled playbook. Other harnesses have no hooks.

- The [playbook reference](skills/playbook/references/cli.md) lists the commands, flags, exit codes, and environment variables.
- [Playbook files, families, and order](skills/playbook/references/playbooks.md) describes where files live, their format and names, the order they apply in, and what `check` validates, each rule marked with the project that provides it.
- [ADR-0001](docs/adr/0001-extends-chains-replace-layers.md) records why `extends` chains replaced numbered layer folders.
- [CONTRIBUTING.md](CONTRIBUTING.md) lists the checks and the rules for changes.
- [GLOSSARY.md](GLOSSARY.md) defines the terms these docs use and says which of upstream pstack, pstack-claude or jawsome-playbooks each comes from.

## Install and set up jawsome-playbooks

jawsome-playbooks needs Node, git, and [pstack-claude](https://github.com/michael-denyer/pstack-claude), Michael Denyer's port of pstack. Poteto's original pstack for Cursor does not work with jawsome-playbooks. Project playbooks and `check-playbooks.mjs` exist only in the port. jawsome-playbooks builds on project playbooks, and playbook runs `check-playbooks.mjs`.

Each step has one row per harness that pstack-claude supports, in the order its README lists them. `tests/readme-harnesses.test.mjs` fails when a step leaves one out.

The **Checked** column says what someone ran. The Claude Code, Codex, Pi, and Muse rows come from installs into a throwaway home directory from a local jawsome-playbooks checkout, with Claude Code 2.1.312, codex-cli 0.154.0, pi 0.85.1, and Muse Code 1.4.12. GitHub Copilot, OpenCode, Gemini CLI, and Prime Agent are untested. Their rows follow pstack-claude's notes for each harness, and nobody has run them with jstack. No harness has run the `setup` skill end to end.

### 1. Install pstack-claude

These are pstack-claude's own steps. The source for them is [the install section of pstack-claude's README](https://github.com/michael-denyer/pstack-claude#install). If a command here fails, follow that section instead.

| Harness | Commands | Checked |
| --- | --- | --- |
| Claude Code | `claude plugin marketplace add michael-denyer/pstack-claude`, then `claude plugin install pstack@pstack-claude -s user` | Yes |
| Codex | `codex plugin marketplace add michael-denyer/pstack-claude`, then `codex plugin add pstack@pstack-claude` | Yes |
| Pi | `pi install git:github.com/michael-denyer/pstack-claude` | Yes |
| GitHub Copilot | `copilot plugin marketplace add michael-denyer/pstack-claude`, then `copilot plugin install pstack@pstack-claude` | Untested |
| Muse | `git clone https://github.com/michael-denyer/pstack-claude`, then `muse plugins install ./pstack-claude/plugins/pstack` and `muse plugins approve pstack` | Install yes, approve not run |
| OpenCode | Clone pstack-claude and link each folder in `plugins/pstack/skills/` into `$HOME/.agents/skills/`, with the loop under [Other harnesses](https://github.com/michael-denyer/pstack-claude#other-harnesses) | Untested |
| Gemini CLI | The same as OpenCode | Untested |
| Prime Agent | The same as OpenCode | Untested |

### 2. Install jawsome-playbooks

If the harness asks for a scope, pick user scope, so jawsome-playbooks works in every repo.

| Harness | Commands | Checked |
| --- | --- | --- |
| Claude Code | `claude plugin marketplace add JawsomeJason/jawsome-playbooks`, then `claude plugin install jawsome-playbooks@jawsome-playbooks -s user` | Yes, from a local checkout |
| Codex | `codex plugin marketplace add JawsomeJason/jawsome-playbooks`, then `codex plugin add jawsome-playbooks@jawsome-playbooks` | Yes, from a local checkout |
| Pi | `pi install git:github.com/JawsomeJason/jawsome-playbooks` | Yes, from a local checkout |
| GitHub Copilot | `copilot plugin marketplace add JawsomeJason/jawsome-playbooks`, then `copilot plugin install jawsome-playbooks@jawsome-playbooks` | Untested |
| Muse | `git clone https://github.com/JawsomeJason/jawsome-playbooks`, then `muse plugins install ./jawsome-playbooks`. jawsome-playbooks has no hooks or agent definitions, so it needs no `muse plugins approve`. | Yes, from a local checkout |
| OpenCode | `git clone https://github.com/JawsomeJason/jawsome-playbooks`, then link `jawsome-playbooks/skills/playbook`, `jawsome-playbooks/skills/learn`, and `jawsome-playbooks/skills/setup` into `$HOME/.agents/skills/` | Untested |
| Gemini CLI | The same as OpenCode | Untested |
| Prime Agent | The same as OpenCode | Untested |

To update jawsome-playbooks or pstack, use the harness's own update command, such as `claude plugin update jawsome-playbooks@jawsome-playbooks`. Do not copy a newer version into a plugin cache by hand. The harness loads the version its install record names, so the harness never runs a hand copy. playbook reads the same record to pick pstack.

### 3. Put playbook on PATH

Link the harness's copy of `bin/playbook` into a folder on `PATH`:

```sh
ln -s <path from the table> "$HOME/.local/bin/playbook"
```

Link from a folder that updates in place. A link into a versioned cache folder keeps pointing at the old version after an update.

`jstack-cli` is a deprecated alias of `playbook`, kept for 0.8.x and removed in 0.9.0. It takes the same commands, spelled `jstack-cli playbook show` and so on, so older scripts and mode skills keep working. Link `bin/jstack-cli` from the same folder only while something still calls it.

| Harness | Path to link | Checked |
| --- | --- | --- |
| Claude Code | `$HOME/.claude/plugins/marketplaces/jawsome-playbooks/bin/playbook`, the marketplace clone that plugin updates refresh | Yes |
| Codex | `bin/playbook` in your jawsome-playbooks clone. Codex offers no stable copy to link. Its marketplace snapshot sits in a temporary folder, `$HOME/.codex/.tmp/marketplaces/jawsome-playbooks/`, which `codex plugin marketplace upgrade` replaces, and its plugin cache is versioned, under `$HOME/.codex/plugins/cache/jawsome-playbooks/jawsome-playbooks/<version>/`. | Yes, both Codex paths, with codex-cli 0.154.0 and a throwaway `CODEX_HOME` |
| Pi | `$HOME/.pi/agent/git/github.com/JawsomeJason/jawsome-playbooks/bin/playbook` | Path seen for pstack-claude's git install |
| GitHub Copilot | `$HOME/.copilot/installed-plugins/jawsome-playbooks/jawsome-playbooks/bin/playbook`, from the layout pstack-claude's Copilot smoke test checks | Untested |
| Muse | `bin/playbook` in your jawsome-playbooks clone. Muse copies the plugin into a cache folder named by a content hash, which changes on every update. | Yes |
| OpenCode | `bin/playbook` in your jawsome-playbooks clone | Untested |
| Gemini CLI | `bin/playbook` in your jawsome-playbooks clone | Untested |
| Prime Agent | `bin/playbook` in your jawsome-playbooks clone | Untested |

### 4. Point playbook at pstack

playbook finds pstack without help when the harness keeps a plugin cache in a dot-folder of your home directory. For every other harness, set `PLAYBOOKS_PSTACK_DIR` to the pstack plugin folder, the one that holds `skills/poteto-mode/`. The [playbook environment reference](skills/playbook/references/cli.md#environment) gives the full search order.

| Harness | How playbook finds pstack | Checked |
| --- | --- | --- |
| Claude Code | The install record, `$HOME/.claude/plugins/installed_plugins.json`, so it uses the version the session runs | Yes |
| Codex | The one version folder in `$HOME/.codex/plugins/cache/pstack-claude/pstack/`. Codex keeps a single version of each plugin and replaces it on each `codex plugin add` and `codex plugin marketplace upgrade`, downgrades included, so that folder is the version Codex runs. Codex records the version nowhere else. `config.toml` holds only `enabled = true`, and `.codex-marketplace-install.json` in the marketplace snapshot holds the marketplace's git revision. If Claude Code also has pstack, its install record wins, so set the variable when the two run different versions. | Yes |
| Pi | Set `PLAYBOOKS_PSTACK_DIR=$HOME/.pi/agent/git/github.com/michael-denyer/pstack-claude/plugins/pstack` | Yes |
| GitHub Copilot | Set `PLAYBOOKS_PSTACK_DIR=$HOME/.copilot/installed-plugins/pstack-claude/pstack`, the folder pstack-claude's Copilot smoke test checks | Untested |
| Muse | Set `PLAYBOOKS_PSTACK_DIR` to `plugins/pstack` in your pstack-claude clone. After a `git pull` there, run `muse plugins update pstack` so Muse loads the same version. | Yes |
| OpenCode | Set `PLAYBOOKS_PSTACK_DIR` to `plugins/pstack` in your pstack-claude clone | Untested |
| Gemini CLI | The same as OpenCode | Untested |
| Prime Agent | The same as OpenCode | Untested |

### 5. Run setup

Run the `setup` skill. It writes your `<handle>-mode` skill, scaffolds the config dir, records your repos' checkouts, and links the mode skill into the skill folders your harness loads. The config dir is `$HOME/.jawsome-playbooks`, or `$PLAYBOOKS_CONFIG` when you set it. If it holds rules you would not publish, keep it private.

After setup, start a new session, so the harness loads `/<handle>-mode`. To check the install later, run `playbook doctor`. It prints each check with `✓` or `✗` and the commands that fix each failure. `playbook doctor --fix` asks before it runs each fix. The [doctor reference](skills/playbook/references/cli.md#doctor) lists the checks.

| Harness | How to run it | Checked |
| --- | --- | --- |
| Claude Code | `/jawsome-playbooks:setup` | Yes, the command. Setup itself not run. |
| Codex | Ask for `jawsome-playbooks:setup` by name, or pick it from the skill list, as pstack-claude's Codex notes say for `pstack:poteto-mode` | Untested |
| Pi | `/skill:setup`, the form pstack-claude's Pi notes give | Untested |
| GitHub Copilot | `/jawsome-playbooks:setup`, the form pstack-claude's Copilot notes give | Untested |
| Muse | `/setup`, the form pstack-claude's Muse notes give. `muse skills list` shows the skill as `plugin:jawsome-playbooks:setup`. | Untested |
| OpenCode | Ask the agent to run the `setup` skill by name. pstack-claude says these harnesses have no routing hook, so you name the skill. | Untested |
| Gemini CLI | The same as OpenCode | Untested |
| Prime Agent | The same as OpenCode | Untested |

## Renamed from jstack

0.8.0 renamed jstack to jawsome-playbooks. The old names keep working through 0.8.x and stop in 0.9.0. To move over:

1. Reinstall the plugin: `claude plugin uninstall jstack@jstack`, `claude plugin marketplace remove jstack`, then the step 2 commands. GitHub redirects `JawsomeJason/jstack` to the new repo.
2. Move the config dir: `mv ~/.jstack ~/.jawsome-playbooks`. Until 0.9.0, playbook reads `~/.jstack` when `~/.jawsome-playbooks` does not exist, and `playbook check` prints an info line saying so.
3. Rename the environment variables: `JSTACK_CONFIG`, `JSTACK_PSTACK_DIR` and `JSTACK_STATE` become `PLAYBOOKS_CONFIG`, `PLAYBOOKS_PSTACK_DIR` and `PLAYBOOKS_STATE`, and `JSTACK_ALLOW_PLAYBOOK_EDITS` becomes `PLAYBOOKS_ALLOW_EDITS`. A `PLAYBOOKS_` name wins when both are set.
4. Relink `playbook` from the new install path in step 3, and change scripts and mode skills that call `jstack-cli` to call `playbook`. `jstack-cli` is a deprecated alias until 0.9.0.
5. Change skill names: `jstack:playbook`, `jstack:setup` and `jstack:learn` become `jawsome-playbooks:playbook`, `jawsome-playbooks:setup` and `jawsome-playbooks:learn`.

## Credits

jawsome-playbooks runs on top of two projects:

- [pstack](https://github.com/cursor/plugins/tree/main/pstack) by Lauren Tan (Poteto), which provides the playbooks and poteto-mode.
- [pstack-claude](https://github.com/michael-denyer/pstack-claude) by Michael Denyer, which makes it possible for repos to add their own playbooks.

jawsome-playbooks doesn't copy pstack's playbooks. It reads them from your install and adds your edits on top.

The test fixtures use a few short excerpts of pstack-claude's playbooks, under the MIT license. See [NOTICE](NOTICE).
