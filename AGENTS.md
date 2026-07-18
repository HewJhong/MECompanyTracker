# Agent Instructions

## Session continuity

Before planning or changing this repository, find and read the newest timestamped file in `docs/handovers/`. Use it to understand the latest completed work, verification results, outstanding risks, dirty-worktree boundaries, and recommended next action.

After reading the handover, confirm its Git claims against the current `git status` and recent log. The handover records progress, but the current repository state remains authoritative.

Do not discard, stage, commit, or overwrite unrelated working-tree changes identified by the handover unless the user explicitly includes them in the task.

## Pull request review completion

Before merging a pull request or reporting its review as complete, inspect every review surface after all review checks finish: general conversation comments, submitted reviews, and inline review threads, including bot-authored comments. A successful or neutral check conclusion does not prove that the reviewer left no findings.

Resolve or explicitly disposition every critical or important finding before merging.
