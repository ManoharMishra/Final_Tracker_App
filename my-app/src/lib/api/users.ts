type ApiSingleResponse<T> = {
  data: T;
};

type UserItem = {
  id: string;
  name: string;
  email: string;
  phone?: string | null;
  org_id: string;
  created_at?: string;
  updated_at?: string;
};

async function parseResponse<T>(res: Response): Promise<T> {
  const json = await res.json();
  if (!res.ok) {
    const message = json?.error?.message ?? `Request failed (${res.status})`;
    throw new Error(message);
  }

  return json as T;
}

export async function createUser(
  name: string,
  email: string,
  phone: string | undefined
): Promise<UserItem> {
  const payload: {
    name: string;
    email: string;
    phone?: string;
  } = {
    name,
    email,
  };

  if (phone && phone.trim()) {
    payload.phone = phone.trim();
  }

  const res = await fetch("/api/users", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  const json = await parseResponse<ApiSingleResponse<UserItem> | UserItem>(res);
  return "data" in json ? json.data : json;
}