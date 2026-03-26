export type AttachmentEntityType = "thread" | "message" | "task";

export interface AttachmentItem {
  id: string;
  org_id: string;
  uploaded_by: string;
  file_name: string;
  file_type: string;
  file_size: number;
  file_url: string;
  entity_type: AttachmentEntityType;
  entity_id: string;
  thread_id: string | null;
  message_id: string | null;
  task_id: string | null;
  created_at: string;
  deleted_at: string | null;
}

export interface Pagination {
  page: number;
  limit: number;
  total: number;
  total_pages: number;
}

export interface AttachmentListResponse {
  data: AttachmentItem[];
  pagination: Pagination;
}

export interface SingleResponse<T> {
  data: T;
}

export interface UploadUrlResponse {
  upload_url: string;
  file_url: string;
  key: string;
}
