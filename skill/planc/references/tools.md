# Bundled tools

Install the complete skill inside the project, using `.agents/skills/planc` for Codex or `.claude/skills/planc` for Claude Code. Personal/global installation is unsupported. Resolve this absolute skill directory once, then run its bundled script against the containing project. Quote project paths and messages. Node >=22 and Git are required; no target-project npm dependency installation is needed.

```sh
node <skill>/scripts/planc.cjs init /path/to/project --accept-plan-git
node <skill>/scripts/planc.cjs validate /path/to/project
node <skill>/scripts/planc.cjs checkpoint /path/to/project -m "Clarify storage completion evidence"
node <skill>/scripts/planc.cjs serve /path/to/project --port 4317
```

The project argument defaults to the working directory. It is the outer project, not `.plan`. `serve` binds only to `127.0.0.1`, tries the next port when occupied, and prints the actual URL. Stop with Ctrl-C. `--port 0` requests any free port. `--help` lists entrypoints.

`init` first requires explicit consent for the project-local Git boundary. Explain that it creates independent `.plan/.git` history, appends `/.plan/` to the outer `.gitignore`, and checkpoints plan files; it never commits to or configures the outer repository. After the user agrees, pass `--accept-plan-git`. Without that flag, initialization exits before writing. It creates missing directories and an empty version-1 plan, preserves existing plans, notes, and Git configuration, and never creates a remote or pushes. Repeated initialization after `.plan/.git` exists needs no repeated consent and creates no empty commit.

`validate` checks the complete plan and every referenced Markdown file. Errors exit nonzero. Fix data inside `.plan`, preserving user notes and review history, then validate again. Unsupported versions require an explicit migration; there is no silent conversion.

`checkpoint` first validates and checks the local boundary, then stages and commits changes inside `.plan`. It rejects symlinks, hard links, linked Git worktrees/submodules, external object stores, and Git attribute files that could invoke external filters. Existing configuration is not rewritten. Hooks and signing are disabled for tool invocations. A no-op succeeds without an empty commit. Notes are committed as written; the tool never rewrites them. Avoid simultaneous manual edits while checkpointing; there is no multi-writer transaction protocol in the MVP.

The read-only service exposes only packaged static assets, validated plan snapshots, referenced Markdown, local commit summaries, and change notifications. It never serves `.git` internals, unreferenced files, or outer source code. It rejects write methods and cross-origin requests. It polls complete snapshots every 500 ms to handle nested files and atomic saves. Invalid edits display an error while the last valid snapshot remains available in memory; that fallback is not persisted across server restarts.

Service endpoints: `GET /api/plan`, `GET /api/note?path=notes/...md`, `GET /api/events` (SSE), and `GET /api/history`. API payloads are local implementation details. Markdown HTML is disabled, images do not make external requests, and source-file links are not exposed by the service.

Initialization's outer `.gitignore` append is the only write exception. Building or testing the user's actual project remains their operation. These checks protect normal tool use; they do not isolate another process that deliberately races filesystem replacements or edits project files.
