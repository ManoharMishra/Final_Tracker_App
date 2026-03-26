import type {
  MessageListItem,
  MessageListResponse,
  MessageMetadata,
} from "@/lib/types/message.types";
import { structuredLog } from "@/lib/logging";

interface CreateMessageParams {
  thread_id: string;
  content: string;
  metadata?: MessageMetadata;
}

type SuccessEnvelope<T> = {
  success: true;
  data: T;
};

type LegacyDataEnvelope<T> = {
  data: T;
};

function isSuccessEnvelope<T>(value: unknown): value is SuccessEnvelope<T> {
  if (!value || typeof value !== "object") {
    return false;
  }

  const obj = value as Record<string, unknown>;
  return obj.success === true && "data" in obj;
}

function hasDataEnvelope<T>(value: unknown): value is LegacyDataEnvelope<T> {
  if (!value || typeof value !== "object") {
    return false;
  }

  return "data" in (value as Record<string, unknown>);
}

function unwrapEnvelopeOrRaw<T>(json: unknown): T {
  if (isSuccessEnvelope<T>(json)) {
    if (json.data == null) {
      throw new Error("Contract mismatch: response.data is required");
    }
    return json.data;
  }

  return json as T;
}

function unwrapEnvelopeDataOrRaw<T>(json: unknown): T {
  if (isSuccessEnvelope<T>(json)) {
    if (json.data == null) {
      throw new Error("Contract mismatch: response.data is required");
    }
    return json.data;
  }

  if (hasDataEnvelope<T>(json)) {
    return json.data;
  }

  return json as T;
}

async function parseResponse<T>(res: Response, endpoint: string): Promise<T> {
  const json = await res.json();
  structuredLog("FRONTEND", "API RESPONSE", { endpoint, response: json });

  if (!res.ok) {
    const message =
      (json as { error?: { message?: string }; message?: string })?.error?.message ??
      (json as { message?: string })?.message ??
      `Request failed (${res.status})`;
    throw new Error(message);
  }

  return unwrapEnvelopeOrRaw<T>(json);
}

export async function getMessages(
  threadId: string,
  page = 1,
  limit = 20
): Promise<MessageListResponse> {
  const query = new URLSearchParams({
    thread_id: threadId,
    page: String(page),
    limit: String(limit),
  });

  const res = await fetch(`/api/messages?${query}`);
  return parseResponse<MessageListResponse>(res, "/api/messages");
}

export async function createMessage(
  params: CreateMessageParams
): Promise<MessageListItem> {
  const res = await fetch("/api/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      thread_id: params.thread_id,
      content: params.content,
      metadata: params.metadata ?? { mentions: [], attachments: [] },
    }),
  });

  const json = await parseResponse<unknown>(res, "/api/messages");
  return unwrapEnvelopeDataOrRaw<MessageListItem>(json);
}
