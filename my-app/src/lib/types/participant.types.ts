// lib/types/participant.types.ts

/**
 * Shared TypeScript types derived from the Participant Module API contracts.
 */

// ─── Participant responses ──────────────────────────────────────────────────

export interface ParticipantUser {
  id: string;
  name: string;
  email: string;
  avatar_url: string | null;
}

export interface ParticipantResponse {
  id: string;
  thread_id: string;
  user_id: string;
  role: "owner" | "member";
  last_read_at: string | null;
  created_at: string;
  updated_at: string;
  user: ParticipantUser;
}

export interface LastReadResponse {
  thread_id: string;
  user_id: string;
  last_read_at: string;
}

// ─── Notification (created by this module) ──────────────────────────────────

export type NotificationType =
  | "thread_update"
  | "mention"
  | "task_assigned"
  | "decision_added";

export type EntityType = "thread" | "message" | "task";

export interface NotificationRecord {
  id: string;
  user_id: string;
  org_id: string;
  type: NotificationType;
  title: string;
  entity_type: EntityType;
  entity_id: string;
  is_read: boolean;
  created_at: string;
}

// ─── API wrappers ───────────────────────────────────────────────────────────

export interface SingleResponse<T> {
  data: T;
}

export interface ListResponse<T> {
  data: T[];
}
