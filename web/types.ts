export type Status = 'not_started' | 'in_progress' | 'completed';
export interface Task {
  id: string; title: string; kind: 'implementation' | 'understanding' | 'investigation' | 'decision';
  goal: string; completionCriteria: string[]; status: Status; notes: string[]; completion?: { checkId: string };
  readiness: { ready: boolean; missing: string[] };
}
export interface Relation { id: string; from: string; to: string; type: 'prerequisite' | 'related'; implicit?: boolean }
export interface Graph { id: string; title: string; taskIds: string[]; notes: string[] }
export interface Check { id: string; taskId: string; at: string; kind: 'review' | 'user_confirmation'; outcome: 'completed' | 'needs_work'; summary: string; evidence: string[]; dissent?: string }
export interface Change { id: string; at: string; reason: string; summary: string; taskIds: string[] }
export interface Plan { version: 1; title: string; updatedAt: string; tasks: Task[]; relations: Relation[]; graphs: Graph[]; checks: Check[]; changes: Change[] }
export interface Snapshot { revision: string; plan: Plan; notes: Record<string, string> }
export interface Payload { ok: boolean; snapshot: Snapshot | null; errors?: string[] }
export interface Commit { id: string; at: string; message: string }
