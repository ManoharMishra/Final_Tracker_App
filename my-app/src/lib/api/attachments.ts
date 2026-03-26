import type {
  AttachmentEntityType,
  AttachmentItem,
  AttachmentListResponse,
  SingleResponse,
  UploadUrlResponse,
} from "@/lib/types/attachment.types";

interface BaseAttachmentEntity {
  entity_type: AttachmentEntityType;
  entity_id: string;
  thread_id?: string;
  message_id?: string;
  task_id?: string;
}

interface GenerateUploadUrlParams extends BaseAttachmentEntity {
  file_name: string;
  file_type: string;
  file_size: number;
}

interface SaveAttachmentParams extends BaseAttachmentEntity {
  file_name: string;
  file_type: string;
  file_size: number;
  file_url: string;
}

async function parseResponse<T>(res: Response): Promise<T> {
  const json = await res.json();
  if (!res.ok) {
    const message = json?.error?.message ?? `Request failed (${res.status})`;
    throw new Error(message);
  }

  return json as T;
}

export async function getAttachments(
  params: BaseAttachmentEntity,
  page = 1,
  limit = 20
): Promise<AttachmentListResponse> {
  const query = new URLSearchParams({
    entity_type: params.entity_type,
    entity_id: params.entity_id,
    page: String(page),
    limit: String(limit),
  });

  if (params.thread_id) query.set("thread_id", params.thread_id);
  if (params.message_id) query.set("message_id", params.message_id);
  if (params.task_id) query.set("task_id", params.task_id);

  const res = await fetch(`/api/attachments?${query.toString()}`);

  return parseResponse<AttachmentListResponse>(res);
}

export async function generateUploadUrl(
  params: GenerateUploadUrlParams
): Promise<UploadUrlResponse> {
  const res = await fetch("/api/upload/presigned-url", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(params),
  });

  const json = await parseResponse<SingleResponse<UploadUrlResponse>>(res);
  return json.data;
}

export async function saveAttachment(
  params: SaveAttachmentParams
): Promise<AttachmentItem> {
  const res = await fetch("/api/attachments", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(params),
  });

  const json = await parseResponse<SingleResponse<AttachmentItem>>(res);
  return json.data;
}
