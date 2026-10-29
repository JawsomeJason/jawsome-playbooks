# Scaffolding commands

Every command here checks before it writes, so a second run of the whole page changes nothing. `CONFIG` is `$JSTACK_CONFIG`, or `.jstack` in the home directory.

## Create the config dir folders

```sh
mkdir -p "$CONFIG/01-user" "$CONFIG/02-orgs/$ORG/01-standard" "$CONFIG/02-orgs/$ORG/02-overrides"
mkdir -p "$CONFIG/03-repos/$REPO/01-team" "$CONFIG/03-repos/$REPO/02-overrides"
```

`mkdir -p` leaves existing folders and their files alone.

## Create layers.json when it is missing

Create `layers.json` only when it is missing:

```json
{
  "handle": "<handle>",
  "modeTrigger": "manual",
  "orgs": { "<org>": { "owners": ["<forge owner>"] } },
  "repos": { "<repo>": { "checkout": "<main checkout>" } }
}
```

`modeTrigger` is `manual`, `auto`, or `session` for picks A, B, and C. A new file has no `pstack` key, because the first passing `jstack-cli check` writes the version it resolved. When the file exists, change only the keys whose answers changed. Show the operator the diff, and write the file after they agree. Keep keys you do not recognize, because a later jstack may use them.

## Link the team folder into one repo

Find the main checkout and the repo key:

```sh
MAIN=$(cd "$(git -C "$CHECKOUT" rev-parse --path-format=absolute --git-common-dir)/.." && pwd)
REPO=$(basename "$(git -C "$MAIN" remote get-url origin)" .git)
```

A worktree's common dir is the main checkout's `.git`, so every worktree of a repo shares one link. A repo without an `origin` remote uses `basename "$MAIN"` as its key.

Link each org standard file into the team folder. The loop skips a file that is already linked:

```sh
find "$CONFIG/02-orgs/$ORG/01-standard" -maxdepth 1 -name '*.md' -print0 |
  while IFS= read -r -d '' f; do
    name=$(basename "$f")
    [ -e "$CONFIG/03-repos/$REPO/01-team/$name" ] || [ -L "$CONFIG/03-repos/$REPO/01-team/$name" ] ||
      ln -s "../../../02-orgs/$ORG/01-standard/$name" "$CONFIG/03-repos/$REPO/01-team/$name"
  done
```

`find` lists the files instead of a `*.md` glob, so the loop runs the same in bash and zsh with zero, one, or many files. An unmatched glob stops zsh with `no matches found`, and in bash it makes a link named `*.md`. The links are relative, so the config dir still works after it moves or when it is itself a symlink.

Link the team folder into the checkout:

```sh
mkdir -p "$MAIN/.agents"
[ -e "$MAIN/.agents/playbooks" ] || [ -L "$MAIN/.agents/playbooks" ] ||
  ln -s "$CONFIG/03-repos/$REPO/01-team" "$MAIN/.agents/playbooks"
```

When `.agents/playbooks` already exists and is not that link, stop and show the operator what is there. It may hold the repo's own tracked playbooks, and replacing it would delete their work.

Record the main checkout as `repos.<repo>.checkout` in `layers.json`, with the diff shown first, as for any other change to the file. `jstack-cli doctor` reads it to find the checkout from any directory.

Keep the link out of the repo's status without touching its tracked `.gitignore`:

```sh
EXCLUDE="$(git -C "$MAIN" rev-parse --path-format=absolute --git-common-dir)/info/exclude"
mkdir -p "$(dirname "$EXCLUDE")"
grep -qxF '/.agents/playbooks' "$EXCLUDE" 2>/dev/null || echo '/.agents/playbooks' >> "$EXCLUDE"
```

The pattern has no trailing slash on purpose. git sees the link as a file, and a pattern ending in `/` matches only directories, so `/.agents/playbooks/` leaves the link showing in `git status`. When the repo tracks other files under `.agents/`, this line still hides only the link.

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
