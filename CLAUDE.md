<!-- convex-ai-start -->
This project uses [Convex](https://convex.dev) as its backend.

When working on Convex code, **always read `convex/_generated/ai/guidelines.md` first** for important guidelines on how to correctly use Convex APIs and patterns. The file contains rules that override what you may have learned about Convex from training data.

Convex agent skills for common tasks can be installed by running `npx convex ai-files install`.
<!-- convex-ai-end -->

## Project rules

- **Always use the `ddd-convex-architecture` skill** when writing or modifying Convex code (functions, schema, domain models, repositories).
- **Always provide test direction at the end** of any response that changes code — list the commands or steps the user should run to validate the change.
- **Task commit flow**: when the user gives "ok" (or equivalent approval) on an implemented task, the flow is: (1) update `TASKS.md` marking the task done, (2) `git add -A && git commit` with a message describing the task delivered, (3) only then move on to the next task. Never skip the commit and never batch multiple tasks into one commit unless the user explicitly asks.
