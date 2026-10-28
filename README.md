# jstack

jstack layers your personal and team playbooks over pstack's bundled poteto-mode playbooks, in a fixed order where later layers win, like CSS cascade layers. It prints each playbook with every layer applied, tags each step with the layer that wrote it, and names every override, so an agent runs one list and you can see whose rule changed what.

It keeps pstack's playbook format and edit grammar, adds no verbs, and never pins a pstack version. When pstack upgrades, `jstack-cli check` tells you which quotes moved.

## Pieces

- `jstack-cli`, a CLI in `skills/playbook/scripts/jstack.mjs`: `playbook list`, `playbook compute <name>` and `check`. Node standard library only.
- The `playbook` skill runs the CLI for an agent. [Commands and flags](skills/playbook/references/cli.md), and [layers, file format and cascade](skills/playbook/references/layers.md).
- The `setup` skill writes your `<handle>-mode` skill through pstack's automate-me, scaffolds the config dir, and links team folders into your repos. Rerun it any time.

## Put the CLI on PATH

`bin/jstack-cli` links to the script, and Node follows the link, so one symlink is enough:

```sh
ln -s "$PWD/plugins/jstack/bin/jstack-cli" "$HOME/.local/bin/jstack-cli"
```

Run that from a clone of this repo, or point it at the installed plugin's folder.

## Configure

| Variable | Default |
| --- | --- |
| `JSTACK_CONFIG` | `$HOME/.jstack`. Keep it private: it can hold company rules. |
| `JSTACK_PSTACK_DIR` | The highest pstack version found under `$HOME/.*/plugins/cache/*/pstack/<version>/`. |

## Develop

```sh
node --test 'plugins/jstack/tests/*.test.mjs'
```

The tests run the CLI against a fake pstack in `tests/fixtures/pstack/` and a config world in `tests/fixtures/config/` that uses every edit verb in every layer.
