import type {
  TaskListItem,
  TaskListResponse,
  TaskStatus,
  SingleResponse,
} from "@/lib/types/task.types";
import { structuredLog } from "@/lib/logging";

interface CreateTaskParams {
  title: string;
  thread_id?: string;
  source_message_id?: string;
  assigned_to?: string;
}

async function parseResponse<T>(res: Response, endpoint: string): Promise<T> {
  const json = await res.json();
  structuredLog("FRONTEND", "API RESPONSE", { endpoint, response: json });
  if (!res.ok) {
    const message = json?.error?.message ?? `Request failed (${res.status})`;
    throw new Error(message);
  }

  return json as T;
}

export async function getTasks(
  threadId: string,
  page = 1,
  limit = 20
): Promise<TaskListResponse> {
  const query = new URLSearchParams({
    thread_id: threadId,
    page: String(page),
    limit: String(limit),
  });

  const res = await fetch(`/api/tasks?${query}`);

  return parseResponse<TaskListResponse>(res, "/api/tasks");
}

export async function createTask(
  params: CreateTaskParams
): Promise<TaskListItem> {
  const res = await fetch("/api/tasks", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      title: params.title,
      ...(params.thread_id && { thread_id: params.thread_id }),
      ...(params.source_message_id && {
        source_message_id: params.source_message_id,
      }),
      ...(params.assigned_to && { assigned_to: params.assigned_to }),
    }),
  });

  const json = await parseResponse<SingleResponse<TaskListItem>>(res, "/api/tasks");
  return json.data;
}

export async function updateTaskStatus(
  taskId: string,
  status: TaskStatus
): Promise<TaskListItem> {
  const res = await fetch(`/api/tasks/${taskId}/status`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      status,
    }),
  });

  const json = await parseResponse<SingleResponse<TaskListItem>>(
    res,
    "/api/tasks/[id]/status"
  );
  return json.data;
}
