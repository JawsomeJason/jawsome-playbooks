# Scaffolding commands

Every command here checks before it writes, so a second run of the whole page changes nothing. `CONFIG` is `$PLAYBOOKS_CONFIG`, or `.jawsome-playbooks` in the home directory.

## Create the config dir folders

```sh
mkdir -p "$CONFIG/playbooks"
```

`mkdir -p` leaves an existing folder and its files alone. The scope folders, `playbooks/orgs/<org>/` and `playbooks/repos/<repo>/`, appear when `playbook extend --scope` or `playbook new --scope` first writes into one, so setup makes none.

## Create config.json when it is missing

Create `config.json` only when it is missing:

```json
{
  "handle": "<handle>",
  "modeTrigger": "manual",
  "orgs": { "<org>": { "owners": ["<forge owner>"] } },
  "repos": { "<repo>": { "checkout": "<main checkout>" } }
}
```

`modeTrigger` is `manual`, `auto`, or `session` for picks A, B, and C. A new file has no `pstack` key, because the first passing `playbook check` writes the version it resolved. When the file exists, change only the keys whose answers changed. Show the operator the diff, and write the file after they agree. Keep keys you do not recognize, because a later jawsome-playbooks may use them.

## Record one repo

Find the main checkout and the repo key:

```sh
MAIN=$(cd "$(git -C "$CHECKOUT" rev-parse --path-format=absolute --git-common-dir)/.." && pwd)
REPO=$(basename "$(git -C "$MAIN" remote get-url origin)" .git)
```

A worktree's common dir is the main checkout's `.git`, so every worktree of a repo records the same checkout. A repo without an `origin` remote uses `basename "$MAIN"` as its key.

Record the main checkout as `repos.<repo>.checkout` in `config.json`, with the diff shown first, as for any other change to the file. `playbook check` reads it to find the repo's team playbooks from any directory, and `playbook doctor` reads it to check the repo.

Link nothing into the checkout. Team playbooks are files the repo commits in `.agents/playbooks`, so a link there would hide the team's own files. When `.agents/playbooks` is a link into the config dir, the retired layout, `playbook doctor` fails it; show it to the operator, who replaces it with the committed files.

## Link the mode skill into each skill folder

List the user-level skill folders, the `skills` folder of each dot-folder in the home directory:

```sh
find -L "$HOME" -mindepth 2 -maxdepth 2 -path "$HOME/.*/skills" -type d 2>/dev/null
```

The search names no harness, so it finds the folder of any harness that keeps one there. `-L` counts a `skills` folder that is itself a link. The search misses a harness whose folder does not exist, so the operator types that folder.

Link the mode skill into each folder the operator picked, as `DIR`:

```sh
[ -e "$DIR/$HANDLE-mode" ] || [ -L "$DIR/$HANDLE-mode" ] || ln -s "$CONFIG/mode/$HANDLE-mode" "$DIR/$HANDLE-mode"
readlink "$DIR/$HANDLE-mode"
```

When `readlink` prints anything other than `$CONFIG/mode/$HANDLE-mode`, stop and show the operator what is there. It may be a mode skill they wrote by hand, and replacing it would delete their work. The link keeps one copy of the skill, so an automate-me revision reaches every harness at once.
