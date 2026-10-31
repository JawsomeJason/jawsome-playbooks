# Mode skill contract

Hand these rules to pstack's automate-me skill as fixed requirements for the `<handle>-mode` skill. These rules make the mode skill use jawsome-playbooks, so automate-me must keep them through every revision.

1. The mode skill runs poteto-mode first, every time it fires. jawsome-playbooks changes only how the agent assembles playbook steps, and poteto-mode owns everything else.
2. It performs poteto-mode's copy-and-apply step with `playbook show <playbook>`, and copies the output into the todolist once. The computed list already holds the bundled steps and every team and personal file's edits, so applying the project playbooks again would double them.
3. It names every line under `Overrides:` in its reply, giving the stem of the file that made the change and the step it changed. An override changes behavior the operator expects from pstack, so the reply must always name it.
4. When the run reaches a playbook listed under `Hands off to:`, it computes that playbook with `playbook show` too, and runs the computed steps. The callee's own family changes its steps, so running the bundled text would drop them.
5. It runs `playbook` or `jstack-cli`, whichever is on `PATH`, spelling the second as `jstack-cli playbook show`. When neither is on `PATH`, it follows poteto-mode as written. A machine can have only the deprecated alias, whose output is the same, and the mode skill must still work on a machine without jstack.

## Trigger

Write the trigger the operator picked into the skill's description and frontmatter:

| Pick | Trigger | How |
| --- | --- | --- |
| A | manual | The skill runs only when the operator invokes it by name. Turn off model invocation where the harness allows it, and make the description name only the handle and `/<handle>-mode`. |
| B | on a matching ask | Model invocation stays on, and the description names the asks that should fire it, such as babysitting a pull request or shipping a stack. |
| C | every session | Add one line that loads the skill to the user-level instructions file the harness reads at the start of every session. Keep model invocation on. |

Once fired, the mode skill holds for the rest of the session, so each later multi-step ask routes to its playbook without invoking it again.
