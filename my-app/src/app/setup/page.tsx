"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { createUser } from "@/lib/api/users";
import styles from "./setup.module.css";

type SetupForm = {
  userName: string;
  email: string;
  phone: string;
};

export default function SetupPage() {
  const router = useRouter();
  const [form, setForm] = useState<SetupForm>({
    userName: "",
    email: "",
    phone: "",
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [checkingOrg, setCheckingOrg] = useState(true);
  const [orgGateError, setOrgGateError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    async function validateSetupOrg() {
      try {
        setCheckingOrg(true);
        setOrgGateError(null);

        const res = await fetch("/api/setup/status", { cache: "no-store" });
        const json = await res.json();

        if (!active) return;

        if (!res.ok) {
          const message =
            json?.error?.message ??
            "Single-organization mode requires exactly one organization";
          setOrgGateError(message);
        }
      } catch {
        if (!active) return;
        setOrgGateError("Unable to verify organization setup. Please try again.");
      } finally {
        if (active) {
          setCheckingOrg(false);
        }
      }
    }

    void validateSetupOrg();

    return () => {
      active = false;
    };
  }, []);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting || checkingOrg || orgGateError) return;

    try {
      setSubmitting(true);
      setError(null);

      const user = await createUser(
        form.userName.trim(),
        form.email.trim(),
        form.phone.trim() || undefined
      );

      const user_id = user.id;
      if (!user_id) {
        throw new Error("Invalid user response");
      }

      router.push("/login");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Setup failed");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className={styles.page}>
      <form className={styles.card} onSubmit={handleSubmit}>
        <h1 className={styles.title}>Initial Setup</h1>

        <label className={styles.label}>
          User Name
          <input
            className={styles.input}
            value={form.userName}
            onChange={(e) =>
              setForm((prev) => ({ ...prev, userName: e.target.value }))
            }
            required
          />
        </label>

        <label className={styles.label}>
          Email
          <input
            className={styles.input}
            type="email"
            value={form.email}
            onChange={(e) => setForm((prev) => ({ ...prev, email: e.target.value }))}
            required
          />
        </label>

        <label className={styles.label}>
          Phone (optional)
          <input
            className={styles.input}
            value={form.phone}
            onChange={(e) => setForm((prev) => ({ ...prev, phone: e.target.value }))}
          />
        </label>

        {error && <p className={styles.error}>{error}</p>}
        {checkingOrg && <p className={styles.error}>Checking organization setup...</p>}
        {orgGateError && <p className={styles.error}>{orgGateError}</p>}

        <button
          className={styles.button}
          type="submit"
          disabled={submitting || checkingOrg || Boolean(orgGateError)}
        >
          {submitting ? "Setting up..." : "Continue"}
        </button>
      </form>
    </main>
  );
}