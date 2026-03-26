import type { NotificationItem } from "@/lib/types/notification.types";

export interface MyWorkTaskItem {
  id: string;
  title: string;
  status: "open" | "in_progress" | "done";
  thread_id: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface MyWorkMentionItem {
  id: string;
  thread_id: string;
  author_id: string;
  content: string;
  metadata: unknown;
  created_at: string;
  updated_at: string;
}

export interface MyWorkResponse {
  tasks: MyWorkTaskItem[];
  mentions: MyWorkMentionItem[];
  notifications: NotificationItem[];
}
