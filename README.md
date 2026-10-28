# jstack

jstack layers your personal and team playbooks over pstack's bundled poteto-mode playbooks, in a fixed order where later layers win, like CSS cascade layers. It prints each playbook with every layer applied, tags each step with the layer that wrote it, and names every override, so an agent runs one list and you can see whose rule changed what.

It keeps pstack's playbook format and edit grammar, adds no verbs, and never pins a pstack version. When pstack upgrades, `jstack-cli check` tells you which quotes moved.

## Pieces

- `jstack-cli`, a CLI in `skills/playbook/scripts/jstack.mjs`: `playbook list`, `playbook compute <name>` and `check`. Node standard library only.
- The `playbook` skill runs the CLI for an agent. [Commands and flags](skills/playbook/references/cli.md), and [layers, file format and cascade](skills/playbook/references/layers.md).
- The `setup` skill writes your `<handle>-mode` skill through pstack's automate-me, scaffolds the config dir, and links team folders into your repos. Rerun it any time.

## Install

jstack needs Node, git and [pstack-claude](https://github.com/michael-denyer/pstack-claude), Michael Denyer's port of pstack. Poteto's original pstack for Cursor does not work: project playbooks and `check-playbooks.mjs`, which jstack layers on and runs, exist only in the port.

Each step has one row per harness that pstack-claude supports, in the order its README lists them. `tests/readme-harnesses.test.mjs` fails when a step leaves one out.

The **Checked** column says what was run. Claude Code, Codex, Pi and Muse were installed into a throwaway home directory from a local jstack checkout, with Claude Code 2.1.312, codex-cli 0.154.0, pi 0.85.1 and Muse Code 1.4.12. GitHub Copilot, OpenCode, Gemini CLI and Prime Agent are untested. Their rows follow pstack-claude's notes for each harness and have not been run with jstack. No harness has run the `setup` skill end to end.

### 1. Install pstack-claude

These are pstack-claude's own steps, which [its README](https://github.com/michael-denyer/pstack-claude#install) keeps up to date. GitHub Copilot, OpenCode, Gemini CLI and Prime Agent are untested.

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

Install at user scope where the harness asks, so jstack works in every repo. GitHub Copilot, OpenCode, Gemini CLI and Prime Agent are untested.

| Harness | Commands | Checked |
| --- | --- | --- |
| Claude Code | `claude plugin marketplace add JawsomeJason/jstack`, then `claude plugin install jstack@jstack -s user` | Yes, from a local checkout |
| Codex | `codex plugin marketplace add JawsomeJason/jstack`, then `codex plugin add jstack@jstack` | Yes, from a local checkout |
| Pi | `pi install git:github.com/JawsomeJason/jstack` | Yes, from a local checkout |
| GitHub Copilot | `copilot plugin marketplace add JawsomeJason/jstack`, then `copilot plugin install jstack@jstack` | Untested |
| Muse | `git clone https://github.com/JawsomeJason/jstack`, then `muse plugins install ./jstack`. jstack has no hooks or agent definitions, so it needs no `muse plugins approve`. | Yes, from a local checkout |
| OpenCode | `git clone https://github.com/JawsomeJason/jstack`, then link `jstack/skills/playbook` and `jstack/skills/setup` into `$HOME/.agents/skills/` | Untested |
| Gemini CLI | The same as OpenCode | Untested |
| Prime Agent | The same as OpenCode | Untested |

Update jstack and pstack with the harness's own update command, such as `claude plugin update jstack@jstack`. Never copy a newer version into a plugin cache by hand. The harness loads the version its install record names, so a hand copy runs nowhere, and jstack-cli reads that same record to pick pstack.

### 3. Put jstack-cli on PATH

The command is `jstack-cli`, not `jstack`, because Java development kits install a `jstack` of their own, and macOS ships one at `/usr/bin/jstack`. Link the harness's copy of `bin/jstack-cli` into a folder on `PATH`:

```sh
ln -s <path from the table> "$HOME/.local/bin/jstack-cli"
```

Link from a folder that updates in place, not from a versioned cache folder that the next update leaves behind. GitHub Copilot, OpenCode, Gemini CLI and Prime Agent are untested.

| Harness | Path to link | Checked |
| --- | --- | --- |
| Claude Code | `$HOME/.claude/plugins/marketplaces/jstack/bin/jstack-cli`, the marketplace clone that plugin updates refresh | Yes, the link. A local-checkout install keeps no clone, so the path is the one pstack-claude's GitHub install uses on this machine. |
| Codex | `$HOME/.codex/.tmp/marketplaces/jstack/bin/jstack-cli`, the marketplace clone that `codex plugin marketplace upgrade` refreshes | Path seen for pstack-claude's GitHub marketplace. Codex's plugin cache is versioned, under `$HOME/.codex/plugins/cache/jstack/jstack/<version>/`. |
| Pi | `$HOME/.pi/agent/git/github.com/JawsomeJason/jstack/bin/jstack-cli` | Path seen for pstack-claude's git install |
| GitHub Copilot | `$HOME/.copilot/installed-plugins/jstack/jstack/bin/jstack-cli`, from the layout pstack-claude's Copilot smoke test checks | Untested |
| Muse | `bin/jstack-cli` in your jstack clone. Muse copies the plugin into a cache folder named by a content hash, which changes on every update. | Yes |
| OpenCode | `bin/jstack-cli` in your jstack clone | Untested |
| Gemini CLI | `bin/jstack-cli` in your jstack clone | Untested |
| Prime Agent | `bin/jstack-cli` in your jstack clone | Untested |

### 4. Point jstack-cli at pstack

jstack-cli finds pstack on its own where the harness keeps a plugin cache under a dot-folder of your home directory, and needs `JSTACK_PSTACK_DIR` everywhere else. The variable names the pstack plugin folder, the one that holds `skills/poteto-mode/`. [cli.md](skills/playbook/references/cli.md#environment) gives the full search order. GitHub Copilot, OpenCode, Gemini CLI and Prime Agent are untested.

| Harness | How jstack-cli finds pstack | Checked |
| --- | --- | --- |
| Claude Code | The install record, `$HOME/.claude/plugins/installed_plugins.json`, so it uses the version the session runs | Yes |
| Codex | The highest version in `$HOME/.codex/plugins/cache/pstack-claude/pstack/`. Codex keeps no install record that jstack reads, so set the variable when an older version is the active one. | Yes |
| Pi | Set `JSTACK_PSTACK_DIR=$HOME/.pi/agent/git/github.com/michael-denyer/pstack-claude/plugins/pstack` | Yes |
| GitHub Copilot | Set `JSTACK_PSTACK_DIR=$HOME/.copilot/installed-plugins/pstack-claude/pstack`, the folder pstack-claude's Copilot smoke test checks | Untested |
| Muse | Set `JSTACK_PSTACK_DIR` to `plugins/pstack` in your pstack-claude clone. After a `git pull` there, run `muse plugins update pstack` so Muse loads the same version. | Yes |
| OpenCode | Set `JSTACK_PSTACK_DIR` to `plugins/pstack` in your pstack-claude clone | Untested |
| Gemini CLI | The same as OpenCode | Untested |
| Prime Agent | The same as OpenCode | Untested |

### 5. Run setup

Run the `setup` skill. It writes your `<handle>-mode` skill, scaffolds the config dir, links team folders into your repos, and links the mode skill into the skill folders your harness loads. Start a new session afterwards, so the harness loads `/<handle>-mode`. Every row except Claude Code is untested.

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

## Configure

| Variable | Default |
| --- | --- |
| `JSTACK_CONFIG` | `$HOME/.jstack`. Keep it private: it can hold company rules. |
| `JSTACK_PSTACK_DIR` | The pstack an install record names, else the highest version under `$HOME/.*/plugins/cache/*/pstack/<version>/`. |

## Develop

```sh
node --test 'tests/*.test.mjs'
```

The tests run the CLI against a fake pstack in `tests/fixtures/pstack/` and a config world in `tests/fixtures/config/` that uses every edit verb in every layer. [CONTRIBUTING.md](CONTRIBUTING.md) lists the other checks and the rules for changes.

## Credits

jstack runs on top of two projects:

- [pstack](https://github.com/cursor/plugins/tree/main/pstack) by Lauren Tan (Poteto), which provides the playbooks and poteto-mode.
- [pstack-claude](https://github.com/michael-denyer/pstack-claude) by Michael Denyer, which makes it possible for repos to add their own playbooks.

jstack doesn't copy pstack's playbooks. It reads them from your install and adds your edits on top.

The test fixtures use a few short excerpts of pstack-claude's playbooks, under the MIT license. See [NOTICE](NOTICE).
