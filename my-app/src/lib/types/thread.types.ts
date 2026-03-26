// lib/types/thread.types.ts

/**
 * Shared TypeScript types derived from the API contracts.
 * These types are the SINGLE SOURCE OF TRUTH for request/response shapes.
 */

// ─── Enums ──────────────────────────────────────────────────────────────────

export type ThreadType = "private" | "team" | "org";
export type ThreadStatus = "open" | "dormant" | "converted";
export type ParticipantRole = "owner" | "member";
export type ThreadVisibility = "ORG" | "TEAM" | "PRIVATE";
export type ThreadEventType =
  | "thread_created"
  | "thread_updated"
  | "thread_status_changed"
  | "participant_added"
  | "participant_removed"
  | "message_created"
  | "message_deleted"
  | "task_created"
  | "task_status_changed"
  | "decision_added"
  | "summary_created"
  | "attachment_added";

// ─── Core Entities ──────────────────────────────────────────────────────────

export interface ThreadResponse {
  id: string;
  title: string;
  type: ThreadType;
  visibility?: ThreadVisibility | null;
  status: ThreadStatus;
  goal: string | null;
  org_id: string;
  team_id?: string | null;
  created_by: string;
  last_activity_at: string;
  created_at: string;
  updated_at: string;
}

export interface ThreadListItem extends ThreadResponse {
  content?: string | null;
  input_type?: "UPDATE" | "BLOCKER" | "IDEA" | "TASK_SOURCE" | null;
  taskId?: string | null;
  creator?: {
    id: string;
    name: string;
    email: string;
    avatar_url: string | null;
  };
  meta?: {
    workType?: "FEATURE" | "BUG" | "MEETING" | "OTHER" | null;
    blockerType?: "CODE" | "DEPENDENCY" | "REQUIREMENT" | null;
    urgency?: "LOW" | "MEDIUM" | "HIGH" | null;
    ideaImpact?: "LOW" | "MEDIUM" | "HIGH" | null;
  } | null;
  stats?: {
    reactionsCount: number;
    commentsCount: number;
    conversionCount: number;
  } | null;
  _count: {
    participants: number;
    messages: number;
  };
}

export interface ParticipantUser {
  id: string;
  name: string;
  email: string;
  avatar_url: string | null;
}

export interface ThreadParticipantResponse {
  id: string;
  user_id: string;
  role: ParticipantRole;
  last_read_at: string | null;
  user: ParticipantUser;
}

export interface ThreadSummaryResponse {
  id: string;
  content: string;
  version: number;
  created_by: string;
  created_at: string;
}

export interface RecentDecisionResponse {
  id: string;
  content: string;
  is_ai_generated: boolean;
  created_by: string;
  created_at: string;
}

export interface ThreadDetailResponse extends ThreadResponse {
  participants: ThreadParticipantResponse[];
  latest_summary: ThreadSummaryResponse | null;
  recent_decisions: RecentDecisionResponse[];
  _count: {
    messages: number;
    participants: number;
    tasks: number;
    decisions: number;
  };
}

// ─── Pagination ─────────────────────────────────────────────────────────────

export interface Pagination {
  page: number;
  limit: number;
  total: number;
  total_pages: number;
}

export interface PaginatedResponse<T> {
  data: T[];
  pagination: Pagination;
}

// ─── API Responses ──────────────────────────────────────────────────────────

export interface SingleResponse<T> {
  data: T;
}

export interface ErrorResponse {
  error: {
    code: string;
    message: string;
    details: unknown[];
  };
}

// ─── Event Payload ──────────────────────────────────────────────────────────

export interface EventPayload {
  entity_id: string;
  entity_type: "thread" | "message" | "task" | "decision" | "summary" | "attachment";
  data: Record<string, unknown>;
}
