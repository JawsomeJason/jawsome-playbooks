# Contributing

## Run the checks

```sh
node --test 'tests/*.test.mjs'
claude plugin validate .
```

The tests in `tests/jstack.test.mjs` run jstack-cli against a fake pstack in `tests/fixtures/pstack/` and a config dir in `tests/fixtures/config/`. That config dir has files in all five layers and uses all four edit verbs.

`tests/readme-harnesses.test.mjs` reads pstack-claude's README from `PSTACK_CLAUDE_README`, or from the pstack-claude marketplace clone under `$HOME/.*/plugins/marketplaces/`. Without either, the test skips and says why. CI clones pstack-claude, so the test always runs there.

If you have Muse, also run `muse plugins validate .` to check the Muse bundle.

## Write the failing test first

Commit a test that fails for the reason you expect, then the change that turns it green. A test that never failed may test nothing. The commit order also lets a reviewer see the test fail, then pass.

## Use the Node standard library only

jstack-cli and the tests import nothing outside Node, so they run wherever Node runs, with no install step. `package.json` exists only because Pi reads its `pi` field.

## Stay compatible with pstack

- Use pstack's playbook format and edit grammar, and add no verbs. Team files live in a repo's `.agents/playbooks/`, where pstack reads them as project playbooks and its `check-playbooks.mjs` checks them. A verb that pstack lacks would break them there.
- Never pin a pstack version. jstack-cli reads whichever pstack the harness installed, and `jstack-cli check` names each quote that an upgrade broke. A pin would hold users on an old pstack.

## Cover every harness pstack-claude supports

Each README install step has one table with a row per harness, in the order pstack-claude's README lists them. `tests/readme-harnesses.test.mjs` fails when a table drops a harness or changes the order. When pstack-claude adds a harness, add its row to every table. Mark the row untested until someone runs it.

Each harness reads its own manifest:

- Claude Code and GitHub Copilot read `.claude-plugin/`.
- Codex reads `.agents/plugins/marketplace.json` and `.codex-plugin/`.
- Pi reads the `pi` field of `package.json`.
- Muse reads `.muse-plugin/`.

Five files carry the version: `.claude-plugin/plugin.json`, `.claude-plugin/marketplace.json`, `.codex-plugin/plugin.json`, `.muse-plugin/plugin.json`, and `package.json`. Change all five together. Keep the repo free of symlinks, because Muse refuses to install a plugin that contains one and Codex drops them when it copies a plugin.

## Write Conventional Commits

Use [Conventional Commits](https://www.conventionalcommits.org/), as the history does: `type(scope): subject`. In the body, say what changed and why, because the diff already shows how. Claim only what you checked, and name the check.

## License

jstack is MIT-licensed. See [LICENSE](LICENSE). [NOTICE](NOTICE) lists the text adapted from pstack-claude.
