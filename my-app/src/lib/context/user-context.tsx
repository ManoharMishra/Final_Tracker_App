"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";

type UserContextValue = {
  user_id: string | null;
  org_id: string | null;
  expires_at: string | null;
  initialized: boolean;
  setSession: (user_id: string, org_id: string) => void;
  refreshSession: () => Promise<void>;
  clearSession: () => Promise<void>;
};

const UserContext = createContext<UserContextValue | undefined>(undefined);

export function UserProvider({ children }: { children: React.ReactNode }) {
  const [user_id, setUserId] = useState<string | null>(null);
  const [org_id, setOrgId] = useState<string | null>(null);
  const [expires_at, setExpiresAt] = useState<string | null>(null);
  const [initialized, setInitialized] = useState(false);

  async function refreshSession() {
    try {
      const response = await fetch("/api/auth/session", {
        cache: "no-store",
      });
      const json = (await response.json()) as {
        data?: { user_id: string; org_id: string; expires_at: string } | null;
      };

      if (!response.ok || !json.data) {
        setUserId(null);
        setOrgId(null);
        setExpiresAt(null);
        return;
      }

      setUserId(json.data.user_id);
      setOrgId(json.data.org_id);
      setExpiresAt(json.data.expires_at);
    } catch {
      setUserId(null);
      setOrgId(null);
      setExpiresAt(null);
    } finally {
      setInitialized(true);
    }
  }

  useEffect(() => {
    void refreshSession();
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const originalFetch = window.fetch.bind(window);

    window.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
      const requestUrl =
        typeof input === "string"
          ? input
          : input instanceof URL
            ? input.toString()
            : input.url;

      const isApiCall =
        requestUrl.startsWith("/api") ||
        requestUrl.startsWith(`${window.location.origin}/api`);

      if (!isApiCall) {
        return originalFetch(input, init);
      }

      const headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined));
      if (user_id && !headers.has("x-user-id")) {
        headers.set("x-user-id", user_id);
      }
      if (org_id && !headers.has("x-org-id")) {
        headers.set("x-org-id", org_id);
      }

      if (input instanceof Request) {
        const nextRequest = new Request(input, {
          ...init,
          headers,
        });
        return originalFetch(nextRequest);
      }

      return originalFetch(input, {
        ...init,
        headers,
      });
    }) as typeof window.fetch;

    return () => {
      window.fetch = originalFetch;
    };
  }, [user_id, org_id]);

  function setSession(nextUserId: string, nextOrgId: string) {
    setUserId(nextUserId);
    setOrgId(nextOrgId);
    setExpiresAt(null);
    setInitialized(true);
  }

  async function clearSession() {
    try {
      await fetch("/api/auth/logout", {
        method: "POST",
      });
    } finally {
      setUserId(null);
      setOrgId(null);
      setExpiresAt(null);
      setInitialized(true);
    }
  }

  const value = useMemo<UserContextValue>(
    () => ({
      user_id,
      org_id,
      expires_at,
      initialized,
      setSession,
      refreshSession,
      clearSession,
    }),
    [user_id, org_id, expires_at, initialized]
  );

  return <UserContext.Provider value={value}>{children}</UserContext.Provider>;
}

export function useUserContext() {
  const context = useContext(UserContext);
  if (!context) {
    throw new Error("useUserContext must be used within UserProvider");
  }

  return context;
}