import type {
  ThreadListItem,
  ThreadDetailResponse,
  PaginatedResponse,
  ThreadType,
} from "@/lib/types/thread.types";
import type { ParticipantResponse } from "@/lib/types/participant.types";
import { structuredLog } from "@/lib/logging";

// ── Types ────────────────────────────────────────────────────────────────────

export interface GetThreadsParams {
  status?: string;
  type?: string;
  page?: number;
  limit?: number;
}

export interface CreateThreadParams {
  title: string;
  type: ThreadType;
  goal?: string | null;
  team_id?: string;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

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

async function parseStrictResponse<T>(res: Response, endpoint: string): Promise<T> {
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

async function parseLegacyResponse<T>(res: Response, endpoint: string): Promise<T> {
  const json = await res.json();
  structuredLog("FRONTEND", "API RESPONSE", { endpoint, response: json });
  if (!res.ok) {
    const message =
      (json as { error?: { message?: string }; message?: string })?.error?.message ??
      (json as { message?: string })?.message ??
      `Request failed (${res.status})`;
    throw new Error(message);
  }

  return json as T;
}

// ── API functions ─────────────────────────────────────────────────────────────

export async function getThreads(
  params: GetThreadsParams
): Promise<PaginatedResponse<ThreadListItem>> {
  const query = new URLSearchParams();
  if (params.status) query.set("status", params.status);
  if (params.type) query.set("type", params.type);
  if (params.page != null) query.set("page", String(params.page));
  if (params.limit != null) query.set("limit", String(params.limit));

  const res = await fetch(`/api/threads?${query}`);
  return parseStrictResponse<PaginatedResponse<ThreadListItem>>(res, "/api/threads");
}

export async function createThread(
  params: CreateThreadParams
): Promise<ThreadListItem> {
  const res = await fetch("/api/threads", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      title: params.title,
      type: params.type,
      goal: params.goal ?? null,
      ...(params.team_id ? { team_id: params.team_id } : {}),
    }),
  });

  const json = await parseStrictResponse<unknown>(res, "/api/threads");
  return unwrapEnvelopeDataOrRaw<ThreadListItem>(json);
}

export async function getThreadById(id: string): Promise<ThreadDetailResponse> {
  const res = await fetch(`/api/threads/${id}`);
  const json = await parseStrictResponse<unknown>(res, "/api/threads/[id]");
  return unwrapEnvelopeDataOrRaw<ThreadDetailResponse>(json);
}

export async function getParticipants(threadId: string): Promise<ParticipantResponse[]> {
  const res = await fetch(`/api/threads/${threadId}/participants`);
  const json = await parseLegacyResponse<{ data?: ParticipantResponse[] }>(
    res,
    "/api/threads/[id]/participants"
  );
  if (!json.data) {
    throw new Error("Contract mismatch for /api/threads/[id]/participants: response.data is required");
  }
  return json.data;
}

export async function addThreadParticipant(
  threadId: string,
  userId: string
): Promise<void> {
  const res = await fetch(`/api/threads/${threadId}/participants`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ user_id: userId, role: "member" }),
  });
  await parseLegacyResponse<unknown>(res, "/api/threads/[id]/participants");
}
