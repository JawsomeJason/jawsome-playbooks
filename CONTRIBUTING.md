# Contributing

## Run the checks

```sh
node --test 'tests/*.test.mjs'
claude plugin validate .
```

`tests/readme-harnesses.test.mjs` reads pstack-claude's README from `PSTACK_CLAUDE_README`, or from the pstack-claude marketplace clone under `$HOME/.*/plugins/marketplaces/`. Without either, it skips and says why. CI clones pstack-claude, so the test always runs there. If you have Muse, `muse plugins validate .` checks the Muse bundle.

## Write the failing test first

Commit a test that fails for the reason you expect, then the change that turns it green. A test that never failed may not test anything, and the commit order lets a reviewer watch it go red, then green.

## Use the Node standard library only

`jstack-cli` and the tests import nothing outside Node, so they run wherever Node does, with no install step. `package.json` exists only because Pi reads its `pi` field.

## Stay compatible with pstack

- Use pstack's playbook format and edit grammar, and add no verbs. Team files live in a repo's `.agents/playbooks/`, where pstack reads them as project playbooks and its `check-playbooks.mjs` checks them, so a verb pstack lacks would break them there.
- Never pin a pstack version. jstack reads whichever pstack the harness installed, and `jstack-cli check` names each quote an upgrade moved. A pin would hold users on an old pstack.

## Cover every harness pstack-claude supports

Each README install step has one table with a row per harness, in the order pstack-claude's README lists them. `tests/readme-harnesses.test.mjs` fails when a table drops a harness or changes the order. When pstack-claude adds a harness, add its row to every table, and mark the row untested until someone runs it.

Each harness reads its own manifest: `.claude-plugin/` for Claude Code and GitHub Copilot, `.agents/plugins/marketplace.json` and `.codex-plugin/` for Codex, the `pi` field of `package.json` for Pi, and `.muse-plugin/` for Muse. Change the version in all five files together. Keep the repo free of symlinks, because Muse refuses to install a plugin that contains one and Codex drops them when it copies a plugin.

## Commit style

Use [Conventional Commits](https://www.conventionalcommits.org/), as the history does: `type(scope): subject`. The body says what changed and why, because the diff already shows how. Claim only what you checked, and name the check.

## License

jstack is MIT-licensed. See [LICENSE](LICENSE). [NOTICE](NOTICE) lists the text adapted from pstack-claude.
