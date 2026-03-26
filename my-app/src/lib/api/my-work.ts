import type { MyWorkResponse } from "@/lib/types/mywork.types";

async function parseResponse<T>(res: Response): Promise<T> {
  const json = await res.json();
  if (!res.ok) {
    const message = json?.error?.message ?? `Request failed (${res.status})`;
    throw new Error(message);
  }

  return json as T;
}

export async function getMyWork(): Promise<MyWorkResponse> {
  const res = await fetch("/api/my-work");

  return parseResponse<MyWorkResponse>(res);
}
