export interface DecisionCreator {
  id: string;
  name: string;
  email: string;
  avatar_url: string | null;
}

export interface DecisionListItem {
  id: string;
  thread_id: string;
  content: string;
  source_message_id: string | null;
  is_ai_generated: boolean;
  created_by: string;
  created_at: string;
  updated_at: string;
  creator: DecisionCreator | null;
}

export interface Pagination {
  page: number;
  limit: number;
  total: number;
  total_pages: number;
}

export interface DecisionListResponse {
  data: DecisionListItem[];
  pagination: Pagination;
}

export interface SingleResponse<T> {
  data: T;
}
