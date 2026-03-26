export type NotificationType =
  | "thread_update"
  | "mention"
  | "task_assigned"
  | "decision_added";

export type NotificationEntityType = "thread" | "message" | "task";

export interface NotificationItem {
  id: string;
  user_id: string;
  org_id: string;
  type: NotificationType;
  title: string;
  entity_type: NotificationEntityType;
  entity_id: string;
  is_read: boolean;
  created_at: string;
}

export interface Pagination {
  page: number;
  limit: number;
  total: number;
  total_pages: number;
}

export interface NotificationListResponse {
  data: NotificationItem[];
  pagination: Pagination;
}

export interface SingleResponse<T> {
  data: T;
}
