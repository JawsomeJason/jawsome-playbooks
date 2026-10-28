# jstack

jstack layers your personal and team playbooks over pstack's bundled poteto-mode playbooks, in a fixed order where later layers win, like CSS cascade layers. It prints each playbook with every layer applied, tags each step with the layer that wrote it, and names every override, so an agent runs one list and you can see whose rule changed what.

It keeps pstack's playbook format and edit grammar, adds no verbs, and never pins a pstack version. When pstack upgrades, `jstack-cli check` tells you which quotes moved.

## Pieces

- `jstack-cli`, a CLI in `skills/playbook/scripts/jstack.mjs`: `playbook list`, `playbook compute <name>` and `check`. Node standard library only.
- The `playbook` skill runs the CLI for an agent. [Commands and flags](skills/playbook/references/cli.md), and [layers, file format and cascade](skills/playbook/references/layers.md).
- The `setup` skill writes your `<handle>-mode` skill through pstack's automate-me, scaffolds the config dir, and links team folders into your repos. Rerun it any time.

## Install

jstack needs Node, git and [pstack-claude](https://github.com/michael-denyer/pstack-claude), Michael Denyer's port of pstack. Poteto's original pstack for Cursor does not work: project playbooks and `check-playbooks.mjs`, which jstack layers on and runs, exist only in the port.

### 1. Install pstack-claude

Use pstack-claude's own steps for your harness, which its README keeps up to date:

| Harness | Commands |
| --- | --- |
| Claude Code | `claude plugin marketplace add michael-denyer/pstack-claude`, then `claude plugin install pstack@pstack-claude -s user` |
| Codex | `codex plugin marketplace add michael-denyer/pstack-claude`, then `codex plugin add pstack@pstack-claude` |
| Pi | `pi install git:github.com/michael-denyer/pstack-claude` |
| GitHub Copilot | `copilot plugin marketplace add michael-denyer/pstack-claude`, then `copilot plugin install pstack@pstack-claude` |
| Muse | Clone pstack-claude, then `muse plugins install ./plugins/pstack` and `muse plugins approve pstack` |
| Other harnesses | Clone pstack-claude and link each folder in `plugins/pstack/skills/` into `$HOME/.agents/skills/` |

### 2. Install jstack

Claude Code installs it as a plugin, at user scope so it works in every repo:

```sh
claude plugin marketplace add JawsomeJason/jstack
claude plugin install jstack@jstack -s user
```

Update with `claude plugin update jstack@jstack`, and update pstack the same way. Never copy a newer version into the plugin cache by hand. Claude Code loads the version its install record names, so a hand copy runs nowhere, and jstack-cli reads that same record to pick pstack.

Every other harness installs the two skills with the skills CLI, which asks which harnesses to link them into:

```sh
npx skills add JawsomeJason/jstack --skill playbook --skill setup
```

### 3. Put jstack-cli on PATH

The command is `jstack-cli`, not `jstack`, because Java development kits install a `jstack` of their own, and macOS ships one at `/usr/bin/jstack`. Node follows symlinks, so one link to the script is enough. Link from a folder that updates in place, not from a versioned cache folder that the next update leaves behind.

For Claude Code, link from the marketplace clone, which plugin updates refresh:

```sh
ln -s "$HOME/.claude/plugins/marketplaces/jstack/bin/jstack-cli" "$HOME/.local/bin/jstack-cli"
```

For a skills CLI install, link `scripts/jstack.mjs` inside the installed `playbook` skill folder, or `bin/jstack-cli` in a clone of this repo.

### 4. Point jstack-cli at pstack

jstack-cli finds pstack on its own where the harness keeps a plugin cache, and needs `JSTACK_PSTACK_DIR` everywhere else. The variable names the pstack plugin folder, the one that holds `skills/poteto-mode/`. [cli.md](skills/playbook/references/cli.md#environment) gives the full search order.

| Harness | How jstack-cli finds pstack |
| --- | --- |
| Claude Code | The install record, `$HOME/.claude/plugins/installed_plugins.json`, so it uses the version the session runs. |
| Codex | The newest version in `$HOME/.codex/plugins/cache/pstack-claude/pstack/`. Codex keeps no install record that jstack reads, so set the variable when an older version is the active one. |
| Pi, GitHub Copilot, Muse | Set `JSTACK_PSTACK_DIR`. jstack does not search these harnesses' layouts. |
| Other harnesses | Set `JSTACK_PSTACK_DIR` to `plugins/pstack` in your pstack-claude clone. |

### 5. Run setup

Run the `setup` skill (`/jstack:setup` in Claude Code). It writes your `<handle>-mode` skill, scaffolds the config dir, links team folders into your repos, and links the mode skill into the skill folders your harness loads. Start a new session afterwards, so the harness loads `/<handle>-mode`.

## Configure

| Variable | Default |
| --- | --- |
| `JSTACK_CONFIG` | `$HOME/.jstack`. Keep it private: it can hold company rules. |
| `JSTACK_PSTACK_DIR` | The pstack an install record names, else the highest version under `$HOME/.*/plugins/cache/*/pstack/<version>/`. |

## Develop

```sh
node --test 'tests/*.test.mjs'
```

The tests run the CLI against a fake pstack in `tests/fixtures/pstack/` and a config world in `tests/fixtures/config/` that uses every edit verb in every layer.
