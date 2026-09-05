# Plan format, version 1

This is a local MVP format, not an independent interchange standard. The executable schema is [schema.json](schema.json). The CLI additionally validates references, acyclic prerequisites, completion records, local note paths, and referenced note existence.

`.plan/plan.json` contains:

| Field       | Meaning                                           |
| ----------- | ------------------------------------------------- |
| `version`   | Exactly `1`                                       |
| `title`     | Project label                                     |
| `updatedAt` | ISO 8601 date-time of the plan edit               |
| `tasks`     | Shared task definitions                           |
| `relations` | Directed prerequisites or ordinary associations   |
| `graphs`    | Topic memberships and topic discussion notes      |
| `checks`    | Append-only review and user-confirmation records  |
| `changes`   | Append-only explanations for structural revisions |

IDs are stable ASCII strings matching `[A-Za-z0-9][A-Za-z0-9._:-]*`, up to 100 characters. They are unique within each collection. Titles and content can be any language. Unknown fields and versions are rejected.

## Tasks and graphs

```json
{
  "id": "storage-choice",
  "title": "Choose a local storage approach",
  "kind": "decision",
  "goal": "Choose storage based on the project's actual persistence needs.",
  "completionCriteria": [
    "Record the selected approach, constraints, and rejected alternatives."
  ],
  "status": "not_started",
  "notes": ["notes/user/storage.md"]
}
```

Kinds: `implementation`, `understanding`, `investigation`, `decision`. Saved statuses: `not_started`, `in_progress`, `completed`. Readiness is computed, never persisted: every prerequisite task must be completed. Both kinds of completion count. An in-progress or completed task remains visible even if a prerequisite later changes.

Every task must appear in at least one graph:

```json
{
  "id": "storage",
  "title": "Storage",
  "taskIds": ["storage-choice"],
  "notes": ["notes/agent/storage-discussion.md"]
}
```

Graph membership does not copy tasks or alter readiness. Task detail lists all prerequisites; a prerequisite in another graph links there. `notes` may be empty. Paths must start with `notes/`, end with `.md`, and stay in `.plan`; dot-prefixed segments, traversal, symlinks, and hard links are rejected. Create referenced notes before validation. User-owned notes retain their original wording; agent discussion belongs in separate files with clear attribution. Unadopted future directions belong in these discussions.

## Relations and visibility

```json
{
  "id": "storage-before-save",
  "from": "storage-choice",
  "to": "save-items",
  "type": "prerequisite",
  "implicit": true
}
```

`from` must finish before `to` is ready. All prerequisites participate, including implicit and cross-graph edges. Cycles are rejected. Use `type: "related"` for a normal association; it never activates or blocks anything and cannot be implicit.

The default view includes completed, in-progress, and ready tasks in the selected graph. `Show hidden items` reveals all members. `Show hidden prerequisites` reveals implicit edges between visible members; it never changes task visibility. Detail always shows complete prerequisites. Layout uses the full topic graph before filtering. Status-only edits do not re-layout it; selection and viewport survive valid updates. Nodes use fixed status styles rather than free colors.

## Completion and subsequent concerns

Append a review after checking the user's reported work and evidence:

```json
{
  "id": "check-storage-1",
  "taskId": "storage-choice",
  "at": "2026-09-05T09:00:00Z",
  "kind": "review",
  "outcome": "completed",
  "summary": "The decision addresses the stated constraints.",
  "evidence": [
    "Read notes/user/storage.md and the current persistence interface."
  ]
}
```

Then set the task's `status` to `completed` and `completion` to `{"checkId":"check-storage-1"}`. A completed task must reference its own check with `outcome: "completed"`. Other statuses omit `completion`.

For informed user override, use `kind: "user_confirmation"`, `outcome: "completed"`, and mandatory `dissent`. Record the user's explicit request in `evidence`; preserve the earlier unfavorable review. Do not invent that request. Both completion kinds activate successors identically.

For unresolved or later doubts, append a `review` with `outcome: "needs_work"`, concrete evidence, and optional `dissent`. A completed task can retain its completion reference while new concerns are visible. Never automatically cascade status reversals.

## Structural changes

Append a `changes` item with `id`, `at`, `reason`, `summary`, and `taskIds`. Explain splits, merges, prerequisite edits, criterion edits, and agreed reopenings. Task IDs in structural history may refer to removed tasks, but checks must continue to reference existing tasks; preserve reviewed task definitions rather than deleting their history. The validator checks record structure, not whether a reason reflects genuine agreement. That judgment remains part of collaboration.

No undo UI is supplied. Checkpoint each effective update to local Git; use Git's read-only history for inspection. Do not rewrite or erase prior checks and structural records.
