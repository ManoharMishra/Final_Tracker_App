"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import styles from "./page.module.css";

type InviteInfo = {
  id: string;
  orgId: string;
  role: "OWNER" | "ADMIN" | "MEMBER";
  maxUses: number | null;
  usedCount: number;
  expiresAt: string | null;
  isActive: boolean;
  createdAt: string;
};

function getApiErrorMessage(payload: unknown, fallback: string): string {
  if (payload && typeof payload === "object") {
    const error = "error" in payload ? payload.error : null;
    if (typeof error === "string") return error;
    if (
      error &&
      typeof error === "object" &&
      "message" in error &&
      typeof (error as { message: unknown }).message === "string"
    ) {
      return (error as { message: string }).message;
    }
  }
  return fallback;
}

export default function InviteAcceptPage() {
  const params = useParams<{ token: string }>();
  const router = useRouter();
  const token = useMemo(() => {
    const raw = params?.token;
    if (Array.isArray(raw)) return raw[0] ?? "";
    return raw ?? "";
  }, [params]);

  const [loading, setLoading] = useState(true);
  const [invite, setInvite] = useState<InviteInfo | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Registration form state
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    async function run() {
      if (!token) {
        setLoadError("Invite token is missing");
        setLoading(false);
        return;
      }

      try {
        const res = await fetch(`/api/invite/${encodeURIComponent(token)}`);
        const json = await res.json();
        if (!res.ok) {
          throw new Error(getApiErrorMessage(json, "Invite is invalid or expired"));
        }
        if (!active) return;
        setInvite(json.data ?? null);
      } catch (err: unknown) {
        if (!active) return;
        setLoadError(err instanceof Error ? err.message : "Unknown error");
      } finally {
        if (active) setLoading(false);
      }
    }

    run();
    return () => { active = false; };
  }, [token]);

  async function handleRegister(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);

    const trimmedName = name.trim();
    const trimmedEmail = email.trim();
    if (!trimmedName) { setFormError("Name is required"); return; }
    if (!trimmedEmail) { setFormError("Email is required"); return; }

    setSubmitting(true);
    try {
      const res = await fetch("/api/invite/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token,
          name: trimmedName,
          email: trimmedEmail,
          ...(phone.trim() ? { phone: phone.trim() } : {}),
        }),
      });

      const json = await res.json();
      if (!res.ok) {
        throw new Error(getApiErrorMessage(json, "Failed to create account"));
      }

      // Session cookie is set by the server — navigate to dashboard
      router.push("/dashboard");
    } catch (err: unknown) {
      setFormError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className={styles.page}>
      <div className={styles.card}>
        <h1 className={styles.title}>You&apos;ve been invited</h1>

        {loading && <p className={styles.muted}>Checking invite...</p>}

        {!loading && loadError && <p className={styles.error}>{loadError}</p>}

        {!loading && !loadError && invite && (
          <>
            <p className={styles.detail}>
              You&apos;ve been invited to join as <strong>{invite.role}</strong>.
              Fill in your details to create your account and get started.
            </p>

            {invite.expiresAt && (
              <p className={styles.muted}>
                Invite expires: {new Date(invite.expiresAt).toLocaleString()}
              </p>
            )}

            <form onSubmit={handleRegister} className={styles.form} noValidate>
              <div className={styles.field}>
                <label htmlFor="inv-name" className={styles.label}>
                  Full name <span aria-hidden="true">*</span>
                </label>
                <input
                  id="inv-name"
                  type="text"
                  className={styles.input}
                  placeholder="Jane Smith"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                  autoFocus
                />
              </div>

              <div className={styles.field}>
                <label htmlFor="inv-email" className={styles.label}>
                  Email <span aria-hidden="true">*</span>
                </label>
                <input
                  id="inv-email"
                  type="email"
                  className={styles.input}
                  placeholder="jane@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>

              <div className={styles.field}>
                <label htmlFor="inv-phone" className={styles.label}>
                  Phone <span className={styles.optional}>(optional)</span>
                </label>
                <input
                  id="inv-phone"
                  type="tel"
                  className={styles.input}
                  placeholder="+1 555 000 0000"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                />
              </div>

              {formError && <p className={styles.error}>{formError}</p>}

              <button
                type="submit"
                className={styles.primaryBtn}
                disabled={submitting}
              >
                {submitting ? "Creating account..." : "Create account & join"}
              </button>
            </form>
          </>
        )}

        <Link href="/login" className={styles.link}>
          Already have an account? Sign in
        </Link>
      </div>
    </div>
  );
}
