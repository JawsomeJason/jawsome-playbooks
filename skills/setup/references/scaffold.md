# Scaffolding commands

Every command here checks before it writes, so running the whole page twice changes nothing the second time. `CONFIG` is `$JSTACK_CONFIG`, or `.jstack` in the home directory.

## Config tree

```sh
mkdir -p "$CONFIG/user" "$CONFIG/orgs/$ORG/standard" "$CONFIG/orgs/$ORG/overrides"
mkdir -p "$CONFIG/repos/$REPO/team" "$CONFIG/repos/$REPO/overrides"
```

`mkdir -p` leaves existing folders and their files alone.

## layers.json

Create it only when it is missing:

```json
{
  "handle": "<handle>",
  "modeTrigger": "manual",
  "layers": ["user", "org.standard", "org.overrides", "repo.standard", "repo.overrides"],
  "orgs": { "<org>": { "owners": ["<forge owner>"] } }
}
```

`modeTrigger` is `manual`, `auto` or `session` for picks A, B and C. The file has no `pstack` key yet, because the first passing `jstack-cli check` writes the version it resolved. When the file exists, change only the keys whose answers changed, show the user the diff, and write it after they agree. Keep keys you do not recognize, because a later jstack may use them.

## Team folder for one repo

Find the main checkout and the repo key:

```sh
MAIN=$(cd "$(git -C "$CHECKOUT" rev-parse --path-format=absolute --git-common-dir)/.." && pwd)
REPO=$(basename "$(git -C "$MAIN" remote get-url origin)" .git)
```

A worktree's common dir is the main checkout's `.git`, so every worktree of a repo shares one link. A repo without an `origin` remote uses `basename "$MAIN"` as its key.

Link each org standard file into the team folder, skipping files already linked:

```sh
find "$CONFIG/orgs/$ORG/standard" -maxdepth 1 -name '*.md' -print0 |
  while IFS= read -r -d '' f; do
    name=$(basename "$f")
    [ -e "$CONFIG/repos/$REPO/team/$name" ] || [ -L "$CONFIG/repos/$REPO/team/$name" ] ||
      ln -s "../../../orgs/$ORG/standard/$name" "$CONFIG/repos/$REPO/team/$name"
  done
```

`find` lists the files instead of a `*.md` glob, so the loop runs the same in bash and zsh with zero, one or many files. An unmatched glob stops zsh with `no matches found`, and in bash it makes a link named `*.md`. The links are relative, so the config dir still works after it moves or when it is itself a symlink.

Link the team folder into the checkout:

```sh
mkdir -p "$MAIN/.agents"
[ -e "$MAIN/.agents/playbooks" ] || [ -L "$MAIN/.agents/playbooks" ] ||
  ln -s "$CONFIG/repos/$REPO/team" "$MAIN/.agents/playbooks"
```

When `.agents/playbooks` already exists and is not that link, stop and show the user what is there. It may hold the repo's own tracked playbooks, and replacing it would delete their work.

Keep the link out of the repo's status without touching its tracked `.gitignore`:

```sh
EXCLUDE="$(git -C "$MAIN" rev-parse --path-format=absolute --git-common-dir)/info/exclude"
mkdir -p "$(dirname "$EXCLUDE")"
grep -qxF '/.agents/playbooks' "$EXCLUDE" 2>/dev/null || echo '/.agents/playbooks' >> "$EXCLUDE"
```

The pattern has no trailing slash on purpose. git sees the link as a file, and a pattern ending in `/` matches only directories, so `/.agents/playbooks/` leaves the link showing in `git status`. When the repo tracks other files under `.agents/`, this line still hides only the link.

## Mode skill

List the user-level skill folders, the `skills` folder of each dot-folder in the home directory:

```sh
find -L "$HOME" -mindepth 2 -maxdepth 2 -path "$HOME/.*/skills" -type d 2>/dev/null
```

The search names no harness, so it finds the folder of any harness that keeps one there. `-L` counts a `skills` folder that is itself a link. A harness whose folder does not exist yet gets none, so the user types it.

Link the mode skill into each folder the user picked, as `DIR`:

```sh
[ -e "$DIR/$HANDLE-mode" ] || [ -L "$DIR/$HANDLE-mode" ] || ln -s "$CONFIG/mode/$HANDLE-mode" "$DIR/$HANDLE-mode"
readlink "$DIR/$HANDLE-mode"
```

When `readlink` prints anything other than `$CONFIG/mode/$HANDLE-mode`, stop and show the user what is there. It may be a mode skill they wrote by hand, and replacing it would delete their work. The link keeps one copy of the skill, so an automate-me revision reaches every harness at once.
