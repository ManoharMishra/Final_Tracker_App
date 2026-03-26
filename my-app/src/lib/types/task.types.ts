export type TaskStatus = "open" | "in_progress" | "done";

export interface TaskUser {
  id: string;
  name: string;
  email: string;
  avatar_url: string | null;
}

export interface TaskListItem {
  id: string;
  title: string;
  status: TaskStatus;
  thread_id: string | null;
  source_message_id: string | null;
  assigned_to: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
  assignee: TaskUser | null;
  creator: TaskUser | null;
}

export interface Pagination {
  page: number;
  limit: number;
  total: number;
  total_pages: number;
}

export interface TaskListResponse {
  data: TaskListItem[];
  pagination: Pagination;
}

export interface SingleResponse<T> {
  data: T;
}
