import type {
  DecisionListItem,
  DecisionListResponse,
  SingleResponse,
} from "@/lib/types/decision.types";

interface CreateDecisionParams {
  thread_id: string;
  content: string;
  source_message_id?: string;
  is_ai_generated?: boolean;
}

async function parseResponse<T>(res: Response): Promise<T> {
  const json = await res.json();
  if (!res.ok) {
    const message = json?.error?.message ?? `Request failed (${res.status})`;
    throw new Error(message);
  }

  return json as T;
}

export async function getDecisions(
  threadId: string,
  page = 1,
  limit = 20
): Promise<DecisionListResponse> {
  const query = new URLSearchParams({
    thread_id: threadId,
    page: String(page),
    limit: String(limit),
  });

  const res = await fetch(`/api/decisions?${query}`);

  return parseResponse<DecisionListResponse>(res);
}

export async function createDecision(
  params: CreateDecisionParams
): Promise<DecisionListItem> {
  const res = await fetch("/api/decisions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      thread_id: params.thread_id,
      content: params.content,
      ...(params.source_message_id && {
        source_message_id: params.source_message_id,
      }),
      is_ai_generated: params.is_ai_generated ?? false,
    }),
  });

  const json = await parseResponse<SingleResponse<DecisionListItem>>(res);
  return json.data;
}
