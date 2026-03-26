type ApiSingleResponse<T> = {
  data: T;
};

type OrganizationItem = {
  id: string;
  name: string;
  slug?: string;
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

export async function createOrganization(name: string): Promise<OrganizationItem> {
  const res = await fetch("/api/organizations", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name }),
  });

  const json = await parseResponse<ApiSingleResponse<OrganizationItem> | OrganizationItem>(res);
  return "data" in json ? json.data : json;
}