# planc

[![license](https://img.shields.io/badge/license-MIT-blue)](LICENSE) <img alt="Repository size" src="https://img.shields.io/github/repo-size/Bli-AIk/planc.svg"/> <img alt="Last commit" src="https://img.shields.io/github/last-commit/Bli-AIk/planc.svg"/> <br>

**planc** is a project-local AI skill for planning together, implementing yourself, and keeping your understanding of a project.

| English | Simplified Chinese              |
| ------- | ------------------------------- |
| English | [简体中文](./readme_zh-hans.md) |

Discuss goals and tradeoffs with your agent, turn agreed work into a task graph, and build the project yourself. Keep your notes alongside the plan. When you ask for a review, the agent checks your work and records its evidence.

![The planc task graph and inspector in Catppuccin Mocha](docs/images/workspace.png)

## What It Does

- **Collaborative planning.** Investigate the code, discuss alternatives, and record only the work you have agreed to do.
- **User-led execution.** You write the project code, run commands, and keep your own notes. The agent explains, questions, and gives teaching examples.
- **Progressive task graphs.** Completed, in-progress, and ready tasks appear by default. Successors become visible as their prerequisites finish.
- **Shared tasks.** A task can appear in several topic graphs with one shared definition and status.
- **Traceable reviews.** Completion links to a check record. An informed user can confirm completion despite the agent's objections, which remain on record.
- **Local history.** Plans and Markdown live in an independent `.plan` Git repository, with a read-only web view that updates when files change.

### Task Types

| Type           | Purpose                                       | Completion evidence                     |
| -------------- | --------------------------------------------- | --------------------------------------- |
| Implementation | Build a piece of the project yourself         | Code, your notes, and execution results |
| Understanding  | Explain part of the project in your own words | Your explanation and open questions     |
| Investigation  | Establish facts before choosing a direction   | Sources, observations, and findings     |
| Decision       | Choose an approach and record the tradeoff    | The choice, constraints, and rationale  |

## Install

**Project-local installation is required.** Install planc separately in each project where you want this collaboration agreement. Do not install it in a home-directory skill folder or use a global skill installer.

Requirements: **Node.js 22+**, **Git**, and an installed Codex or Claude Code client. The commands below use a POSIX shell (Linux, macOS, or WSL). The skill includes its CLI and built web page; the target project does not need `npm install` or a frontend build.

To try it in a new test project:

```sh
mkdir -p planc-test
cd planc-test
git init
```

For an existing project, change into its root instead. The `--accept-plan-git` flag is an explicit confirmation that planc may create independent history inside `.plan` and append `/.plan/` to this project's `.gitignore`; it never commits to the outer repository. Then choose your agent's installation block below. The temporary clone is removed after the complete skill has been copied into your project.

### Codex

Run from the target project's root:

```sh
(
  set -eu
  planc_source="$(mktemp -d)"
  trap 'rm -rf "$planc_source"' EXIT
  git clone --depth 1 https://github.com/Bli-AIk/planc.git "$planc_source"
  node "$planc_source/scripts/install.mjs" codex .
  node .agents/skills/planc/scripts/planc.cjs init . --accept-plan-git
  node .agents/skills/planc/scripts/planc.cjs validate .
)
```

This installs `.agents/skills/planc/SKILL.md` and its supporting files. Start `codex` from this project, then use `/skills` or mention the skill directly:

```text
$planc Help me understand this project and plan the next change. I will implement it myself.
```

Open the local viewer from the same project directory:

```sh
node .agents/skills/planc/scripts/planc.cjs serve .
```

### Claude Code

Run from the target project's root:

```sh
(
  set -eu
  planc_source="$(mktemp -d)"
  trap 'rm -rf "$planc_source"' EXIT
  git clone --depth 1 https://github.com/Bli-AIk/planc.git "$planc_source"
  node "$planc_source/scripts/install.mjs" claude .
  node .claude/skills/planc/scripts/planc.cjs init . --accept-plan-git
  node .claude/skills/planc/scripts/planc.cjs validate .
)
```

This installs `.claude/skills/planc/SKILL.md` and its supporting files. Start `claude` from this project, then invoke:

```text
/planc Help me understand this project and plan the next change. I will implement it myself.
```

Open the local viewer from the same project directory:

```sh
node .claude/skills/planc/scripts/planc.cjs serve .
```

Both installation paths follow the official [Codex skills documentation](https://developers.openai.com/codex/skills/) and [Claude Code skills documentation](https://code.claude.com/docs/en/skills#where-skills-live). If the skill does not appear after adding the directory, restart the client from the project root.

The installer preserves an existing installation and exits with an error instead of overwriting it. It refuses home-directory installation and symlinked destination directories. Installing both agents in the same project creates two local skill copies; they use the same `.plan` data.

## Usage

The viewer prints its local URL, normally `http://127.0.0.1:4317/`. It tries another port if that one is occupied; stop it with Ctrl-C. A new plan starts empty. Work with your agent to adopt the first tasks.

### During the Work

1. Describe your goal or current difficulty. The agent reads relevant code and notes, helps establish facts, and discusses possible directions.
2. Adopt tasks and tradeoffs together. Unchosen alternatives stay in discussion notes; they do not become a hidden implementation roadmap.
3. Choose a task, implement it yourself, and record your understanding and questions in Markdown. Ask for explanations whenever needed.
4. Report completion and request a check. The agent reviews code, notes, and existing execution results, then records what it actually checked.
5. When something is unclear, discuss task size, prerequisites, or completion criteria. Structural changes keep their reasons and history.

If you understand an outstanding concern and still explicitly confirm completion, the task records **user-confirmed completion** with the agent's dissent. Its successors activate normally. Later doubts do not automatically undo completed tasks or cascade through the plan.

### Files

```text
your-project/
  .agents/skills/planc/    # Codex installation, if selected
  .claude/skills/planc/    # Claude Code installation, if selected
  .gitignore              # init appends /.plan/
  .plan/
    .git/                 # independent local history, no default remote
    plan.json             # tasks, relations, graphs, checks, structural changes
    notes/
      user/               # your original notes
      agent/              # separately attributed agent discussions
```

Tasks save only `not_started`, `in_progress`, or `completed`. Readiness comes from all prerequisites, including implicit and cross-graph prerequisites. Ordinary associations never affect readiness. The viewer can show hidden tasks and implicit edges; task detail always lists every prerequisite.

The graph is laid out before filtering. Status changes preserve node positions, and saved updates preserve selection and viewport. Invalid JSON, references, or notes show an error while the last valid view stays visible. That fallback lasts only for the running server session.

See the [format reference](skill/planc/references/format.md), [JSON Schema](src/schema.json), and [example plan](examples/plan.json). The example and screenshot use fictional project notes, not evidence of learning outcomes.

### Tools

After each effective update, validate and checkpoint. For Codex:

```sh
node .agents/skills/planc/scripts/planc.cjs validate .
node .agents/skills/planc/scripts/planc.cjs checkpoint . -m "Clarify completion evidence"
```

For Claude Code, replace `.agents` with `.claude`. The four entrypoints are `init`, `validate`, `serve`, and `checkpoint`. Repeated initialization preserves existing data; checkpoints skip empty commits. See the [tool reference](skill/planc/references/tools.md).

## Boundaries

The skill does not deliver your current project's implementation or patches. It can explain, investigate, review, and offer teaching examples. Your Markdown is not automatically rewritten.

After installation, initialization's outer `.gitignore` append is the only write exception. Subsequent planning writes stay inside `.plan`; you run the project's builds, tests, and other operations. The service binds only to `127.0.0.1` and exposes no write API, Git internals, or project source files. Path validation reinforces this agreement; skill text is not a host-level sandbox.

Engineering checks verify observable behavior. You independently decide whether real use helps you understand the project, retain control, and enjoy making it.

## Development

In the planc source repository:

```sh
npm ci
npm run check:md
npm run check
npx playwright install chromium
npm run test:browser
```

The frontend uses TypeScript, Cytoscape.js, dagre, Markdown-it, and Lucide. The visual style adapts [OpenCode's terminal-like design](https://getdesign.md/opencode.ai/design-md) to [Catppuccin Mocha](https://github.com/catppuccin/palette); see [DESIGN.md](DESIGN.md).

`npm run build` refreshes both `dist/` and the standalone `skill/planc/` bundle. Use `npm run format:md` to format Markdown with Prettier. Tests cover data validation, Git boundaries, both local installation paths, HTTP/SSE behavior, and desktop/mobile interactions. Set `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` to use an existing Chromium executable.

## License

[MIT](LICENSE). Bundled dependency licenses are included in [THIRD_PARTY_NOTICES.txt](dist/THIRD_PARTY_NOTICES.txt).
