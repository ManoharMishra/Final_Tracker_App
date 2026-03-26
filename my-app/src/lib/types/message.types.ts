export interface MessageMetadata {
  mentions: string[];
  attachments: string[];
}

export interface MessageAuthor {
  id: string;
  name: string;
  email: string;
  avatar_url: string | null;
}

export interface MessageListItem {
  id: string;
  thread_id: string;
  author_id: string;
  content: string;
  metadata: MessageMetadata;
  created_at: string;
  updated_at: string;
  author: MessageAuthor | null;
}

export interface Pagination {
  page: number;
  limit: number;
  total: number;
  total_pages: number;
}

export interface MessageListResponse {
  data: MessageListItem[];
  pagination: Pagination;
}

export interface SingleResponse<T> {
  data: T;
}
