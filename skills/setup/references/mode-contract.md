# Mode skill contract

Hand these rules to pstack's automate-me skill as fixed requirements for the `<handle>-mode` skill. They are what makes the mode skill use jstack, so automate-me must keep them through every revision.

1. The mode skill runs poteto-mode first, every time it fires. jstack only changes how playbook steps are assembled, and poteto-mode owns everything else.
2. It performs poteto-mode's copy-and-apply step with `jstack-cli playbook compute <playbook>`, and copies the output into the todolist once. The computed list already holds the bundled steps and every layer's edits, so applying the project playbooks again would double them.
3. It names every line under `Overrides:` in its reply, giving the layer and the step that layer changed. An override changes behavior the user expects from pstack, so it must never pass silently.
4. When the run reaches a playbook listed under `Hands off to:`, it computes that playbook with `jstack-cli playbook compute` too, and runs the computed steps. The callee's own layers change its steps, so running the bundled text would drop them.
5. When `jstack-cli` is not on `PATH`, it follows poteto-mode as written. The mode skill must still work on a machine without jstack.

## Trigger

Write the trigger the user picked into the skill's description and frontmatter:

| Pick | Trigger | How |
| --- | --- | --- |
| A | manual | The skill runs only when the user invokes it by name. Turn off model invocation where the harness allows it, and make the description name only the handle and `/<handle>-mode`. |
| B | on a matching ask | Model invocation stays on, and the description names the asks that should fire it, such as babysitting a pull request or shipping a stack. |
| C | every session | Add one line that loads the skill to the user-level instructions file the harness reads at the start of every session. Keep model invocation on. |

Once fired, the mode skill holds for the rest of the session, so each later multi-step ask routes to its playbook without invoking it again.
