# jstack

jstack layers your personal and team playbooks over pstack's bundled poteto-mode playbooks. The layers apply in a fixed order, and a later layer wins, as in CSS cascade layers. `playbook` prints each playbook with every layer applied, tags each step with the layer that wrote it, and lists every override. An agent runs one step list, and you see whose rule changed which step.

jstack keeps pstack's playbook format and edit grammar, adds no verbs, and never pins a pstack version. After a pstack upgrade, `playbook check` names each quote that no longer matches its step.

jstack ships three skills. The `playbook` skill runs `playbook` for an agent. The `learn` skill turns a session's corrections into proposed layer edits and writes the ones you pick. The `setup` skill writes your `<handle>-mode` skill, scaffolds the config dir, and links team folders into your repos. You can rerun `setup` at any time.

In Claude Code, the plugin's hook stops an agent from reading an installed pstack playbook file directly and names the `playbook show` command to run instead. That file holds only pstack's steps, so reading it would skip your layers.

A second hook blocks a direct Edit or Write of a top-level `.md` file, other than a `README.md`, in `01-user/`, `02-orgs/*/02-overrides/` or `03-repos/*/02-overrides/` of your config dir, resolving symlinks, and names `playbook extend` and `playbook new` instead. Those commands accept only valid grammar and undo a write that adds a `playbook check` problem. The hook allows a direct edit of a file that has a `check` problem, so a stale quote can always be repaired, and it allows the edit and says so when `check` cannot run. Set `JSTACK_ALLOW_LAYER_EDITS=1` to edit by hand anyway. The `learn` skill writes personal and overrides layers through the commands, so the hook does not stop it.

The hooks have known gaps. A Bash command can still write a layer file (`sed -i`, `tee`, a redirect) or read a bundled playbook that mentions `jstack` or `playbook show` anywhere in the command. The read hook covers Read and Bash only, so Grep and Glob can still read a bundled playbook. Other harnesses have no hooks.

- The [playbook reference](skills/playbook/references/cli.md) lists the commands, flags, exit codes, and environment variables.
- [Layers, files, and the cascade](skills/playbook/references/layers.md) describes the config dir, the layer file format, and how layers apply.
- [CONTRIBUTING.md](CONTRIBUTING.md) lists the checks and the rules for changes.
- [GLOSSARY.md](GLOSSARY.md) defines the terms these docs use and says which of upstream pstack, pstack-claude or jstack each comes from.

## Install and set up jstack

jstack needs Node, git, and [pstack-claude](https://github.com/michael-denyer/pstack-claude), Michael Denyer's port of pstack. Poteto's original pstack for Cursor does not work with jstack. Project playbooks and `check-playbooks.mjs` exist only in the port. jstack builds on project playbooks, and jstack-cli runs `check-playbooks.mjs`.

Each step has one row per harness that pstack-claude supports, in the order its README lists them. `tests/readme-harnesses.test.mjs` fails when a step leaves one out.

The **Checked** column says what someone ran. The Claude Code, Codex, Pi, and Muse rows come from installs into a throwaway home directory from a local jstack checkout, with Claude Code 2.1.312, codex-cli 0.154.0, pi 0.85.1, and Muse Code 1.4.12. GitHub Copilot, OpenCode, Gemini CLI, and Prime Agent are untested. Their rows follow pstack-claude's notes for each harness, and nobody has run them with jstack. No harness has run the `setup` skill end to end.

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

### 2. Install jstack

If the harness asks for a scope, pick user scope, so jstack works in every repo.

| Harness | Commands | Checked |
| --- | --- | --- |
| Claude Code | `claude plugin marketplace add JawsomeJason/jstack`, then `claude plugin install jstack@jstack -s user` | Yes, from a local checkout |
| Codex | `codex plugin marketplace add JawsomeJason/jstack`, then `codex plugin add jstack@jstack` | Yes, from a local checkout |
| Pi | `pi install git:github.com/JawsomeJason/jstack` | Yes, from a local checkout |
| GitHub Copilot | `copilot plugin marketplace add JawsomeJason/jstack`, then `copilot plugin install jstack@jstack` | Untested |
| Muse | `git clone https://github.com/JawsomeJason/jstack`, then `muse plugins install ./jstack`. jstack has no hooks or agent definitions, so it needs no `muse plugins approve`. | Yes, from a local checkout |
| OpenCode | `git clone https://github.com/JawsomeJason/jstack`, then link `jstack/skills/playbook`, `jstack/skills/learn`, and `jstack/skills/setup` into `$HOME/.agents/skills/` | Untested |
| Gemini CLI | The same as OpenCode | Untested |
| Prime Agent | The same as OpenCode | Untested |

To update jstack or pstack, use the harness's own update command, such as `claude plugin update jstack@jstack`. Do not copy a newer version into a plugin cache by hand. The harness loads the version its install record names, so the harness never runs a hand copy. playbook reads the same record to pick pstack.

### 3. Put playbook on PATH

The command is `playbook`, not `jstack`, because Java development kits install a `jstack` of their own, and macOS ships one at `/usr/bin/jstack`. macOS and Linux ship no system `playbook` command, so the name is free. `jstack-cli` is a compatibility alias of `playbook` that keeps older scripts and mode skills working; `jstack-cli playbook compute` still runs, and means the same as `playbook show`.

Link the harness's copy of `bin/playbook` and `bin/jstack-cli` into a folder on `PATH`. Take the path from the table, which lists `bin/jstack-cli`, and use `playbook` in place of `jstack-cli` for the second link:

```sh
ln -s <path from the table> "$HOME/.local/bin/jstack-cli"
ln -s <the same folder>/playbook "$HOME/.local/bin/playbook"
```

Link from a folder that updates in place. A link into a versioned cache folder keeps pointing at the old version after an update.

| Harness | Path to link | Checked |
| --- | --- | --- |
| Claude Code | `$HOME/.claude/plugins/marketplaces/jstack/bin/jstack-cli`, the marketplace clone that plugin updates refresh | Yes, the link. A local-checkout install keeps no clone, so the path follows the layout of pstack-claude's GitHub install. |
| Codex | `bin/jstack-cli` in your jstack clone. Codex offers no stable copy to link. Its marketplace snapshot sits in a temporary folder, `$HOME/.codex/.tmp/marketplaces/jstack/`, which `codex plugin marketplace upgrade` replaces, and its plugin cache is versioned, under `$HOME/.codex/plugins/cache/jstack/jstack/<version>/`. | Yes, both Codex paths, with codex-cli 0.154.0 and a throwaway `CODEX_HOME` |
| Pi | `$HOME/.pi/agent/git/github.com/JawsomeJason/jstack/bin/jstack-cli` | Path seen for pstack-claude's git install |
| GitHub Copilot | `$HOME/.copilot/installed-plugins/jstack/jstack/bin/jstack-cli`, from the layout pstack-claude's Copilot smoke test checks | Untested |
| Muse | `bin/jstack-cli` in your jstack clone. Muse copies the plugin into a cache folder named by a content hash, which changes on every update. | Yes |
| OpenCode | `bin/jstack-cli` in your jstack clone | Untested |
| Gemini CLI | `bin/jstack-cli` in your jstack clone | Untested |
| Prime Agent | `bin/jstack-cli` in your jstack clone | Untested |

### 4. Point playbook at pstack

playbook finds pstack without help when the harness keeps a plugin cache in a dot-folder of your home directory. For every other harness, set `JSTACK_PSTACK_DIR` to the pstack plugin folder, the one that holds `skills/poteto-mode/`. The [playbook environment reference](skills/playbook/references/cli.md#environment) gives the full search order.

| Harness | How playbook finds pstack | Checked |
| --- | --- | --- |
| Claude Code | The install record, `$HOME/.claude/plugins/installed_plugins.json`, so it uses the version the session runs | Yes |
| Codex | The one version folder in `$HOME/.codex/plugins/cache/pstack-claude/pstack/`. Codex keeps a single version of each plugin and replaces it on each `codex plugin add` and `codex plugin marketplace upgrade`, downgrades included, so that folder is the version Codex runs. Codex records the version nowhere else. `config.toml` holds only `enabled = true`, and `.codex-marketplace-install.json` in the marketplace snapshot holds the marketplace's git revision. If Claude Code also has pstack, its install record wins, so set the variable when the two run different versions. | Yes |
| Pi | Set `JSTACK_PSTACK_DIR=$HOME/.pi/agent/git/github.com/michael-denyer/pstack-claude/plugins/pstack` | Yes |
| GitHub Copilot | Set `JSTACK_PSTACK_DIR=$HOME/.copilot/installed-plugins/pstack-claude/pstack`, the folder pstack-claude's Copilot smoke test checks | Untested |
| Muse | Set `JSTACK_PSTACK_DIR` to `plugins/pstack` in your pstack-claude clone. After a `git pull` there, run `muse plugins update pstack` so Muse loads the same version. | Yes |
| OpenCode | Set `JSTACK_PSTACK_DIR` to `plugins/pstack` in your pstack-claude clone | Untested |
| Gemini CLI | The same as OpenCode | Untested |
| Prime Agent | The same as OpenCode | Untested |

### 5. Run setup

Run the `setup` skill. It writes your `<handle>-mode` skill, scaffolds the config dir, links team folders into your repos, and links the mode skill into the skill folders your harness loads. The config dir is `$HOME/.jstack`, or `$JSTACK_CONFIG` when you set it. If it holds rules you would not publish, keep it private.

After setup, start a new session, so the harness loads `/<handle>-mode`. To check the install later, run `playbook doctor`. It prints each check with `✓` or `✗` and the commands that fix each failure. `playbook doctor --fix` asks before it runs each fix. The [doctor reference](skills/playbook/references/cli.md#doctor) lists the checks.

| Harness | How to run it | Checked |
| --- | --- | --- |
| Claude Code | `/jstack:setup` | Yes, the command. Setup itself not run. |
| Codex | Ask for `jstack:setup` by name, or pick it from the skill list, as pstack-claude's Codex notes say for `pstack:poteto-mode` | Untested |
| Pi | `/skill:setup`, the form pstack-claude's Pi notes give | Untested |
| GitHub Copilot | `/jstack:setup`, the form pstack-claude's Copilot notes give | Untested |
| Muse | `/setup`, the form pstack-claude's Muse notes give. `muse skills list` shows the skill as `plugin:jstack:setup`. | Untested |
| OpenCode | Ask the agent to run the `setup` skill by name. pstack-claude says these harnesses have no routing hook, so you name the skill. | Untested |
| Gemini CLI | The same as OpenCode | Untested |
| Prime Agent | The same as OpenCode | Untested |

## Credits

jstack runs on top of two projects:

- [pstack](https://github.com/cursor/plugins/tree/main/pstack) by Lauren Tan (Poteto), which provides the playbooks and poteto-mode.
- [pstack-claude](https://github.com/michael-denyer/pstack-claude) by Michael Denyer, which makes it possible for repos to add their own playbooks.

jstack doesn't copy pstack's playbooks. It reads them from your install and adds your edits on top.

The test fixtures use a few short excerpts of pstack-claude's playbooks, under the MIT license. See [NOTICE](NOTICE).
