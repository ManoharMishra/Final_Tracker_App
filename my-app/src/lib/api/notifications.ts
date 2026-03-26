import type {
  NotificationItem,
  NotificationListResponse,
  SingleResponse,
} from "@/lib/types/notification.types";

async function parseResponse<T>(res: Response): Promise<T> {
  const json = await res.json();
  if (!res.ok) {
    const message = json?.error?.message ?? `Request failed (${res.status})`;
    throw new Error(message);
  }
  return json as T;
}

export async function getNotifications(
  options?: { is_read?: boolean; page?: number; limit?: number }
): Promise<NotificationListResponse> {
  const query = new URLSearchParams({
    page: String(options?.page ?? 1),
    limit: String(options?.limit ?? 20),
  });

  if (typeof options?.is_read === "boolean") {
    query.set("is_read", String(options.is_read));
  }

  const res = await fetch(`/api/notifications?${query.toString()}`);

  return parseResponse<NotificationListResponse>(res);
}

export async function markNotificationRead(
  notificationId: string
): Promise<NotificationItem> {
  const res = await fetch(`/api/notifications/${notificationId}`, {
    method: "PATCH",
  });

  const json = await parseResponse<SingleResponse<NotificationItem>>(res);
  return json.data;
}

export async function markAllNotificationsRead(): Promise<{ updated_count: number }> {
  const res = await fetch("/api/notifications/mark-all-read", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
  });

  const json = await parseResponse<SingleResponse<{ updated_count: number }>>(res);
  return json.data;
}
