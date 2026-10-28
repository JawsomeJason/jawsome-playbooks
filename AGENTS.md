# Repo rules

These rules apply to every agent and person who edits this repo. [CONTRIBUTING.md](CONTRIBUTING.md) covers checks, tests and commits.

- Skill frontmatter uses only [Agent Skills spec](https://agentskills.io/specification) keys: `name`, `description`, `license`, `compatibility`, `metadata` and `allowed-tools`, plus `argument-hint`. The spec is the part every harness reads the same way, and harnesses that do not know `argument-hint` ignore it.
- No person, company or private path appears in a skill or a test fixture. Skills have to work for any user at any company. Authorship fields in the manifests, `LICENSE`, `NOTICE` and the README's credits are the exception, because they must name the authors.
- Every rule states its reason. A rule with its reason still makes sense after the tools around it change.
- Prose carries no time-relative words, such as "currently", "latest" or "recently". They go stale without anyone editing the file.
