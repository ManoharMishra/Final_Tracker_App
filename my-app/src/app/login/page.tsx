"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { useUserContext } from "@/lib/context/user-context";
import styles from "./login.module.css";

type UserLookupResponse = {
  data?: {
    id: string;
    org_id: string;
  };
  error?: {
    message?: string;
  };
};

const quotes = [
  { text: "Alone we can do so little; together we can do so much.", author: "Helen Keller" },
  { text: "Great things in business are never done by one person. They're done by a team of people.", author: "Steve Jobs" },
  { text: "Coming together is a beginning, staying together is progress, and working together is success.", author: "Henry Ford" },
];

export default function LoginPage() {
  const router = useRouter();
  const { setSession } = useUserContext();
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [quoteIndex] = useState(() => Math.floor(Math.random() * quotes.length));

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (loading) return;

    try {
      setLoading(true);
      setError(null);

      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ email: email.trim() }),
      });
      const json = (await res.json()) as UserLookupResponse;

      if (!res.ok || !json.data?.id || !json.data?.org_id) {
        throw new Error(json?.error?.message ?? "User not found");
      }

      setSession(json.data.id, json.data.org_id);
      router.replace("/dashboard");
    } catch {
      setError("User not found");
    } finally {
      setLoading(false);
    }
  }

  const quote = quotes[quoteIndex];

  return (
    <main className={styles.page}>
      {/* Decorative background orbs */}
      <div className={styles.bgOrb1} />
      <div className={styles.bgOrb2} />
      <div className={styles.bgOrb3} />

      <div className={styles.container}>
        {/* Left Panel — Branding & Quote */}
        <aside className={styles.brandPanel}>
          <div className={styles.brandOverlay} />
          <div className={styles.brandContent}>
            <div className={styles.logoBlock}>
              <div className={styles.logoIcon}>
                <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
                  <path d="M4 8L14 3L24 8V20L14 25L4 20V8Z" stroke="white" strokeWidth="2" fill="none" />
                  <path d="M14 3V25" stroke="white" strokeWidth="1.5" opacity="0.5" />
                  <path d="M4 8L24 20" stroke="white" strokeWidth="1.5" opacity="0.3" />
                  <path d="M24 8L4 20" stroke="white" strokeWidth="1.5" opacity="0.3" />
                </svg>
              </div>
              <div>
                <p className={styles.logoName}>Karya-AI</p>
                <p className={styles.logoSub}>Team Productivity Platform</p>
              </div>
            </div>

            <div className={styles.heroText}>
              <h1 className={styles.heroTitle}>
               From Talks to Outcomes, Seamlessly
              </h1>
              <p className={styles.heroDesc}>
                From daily talks to big wins — keep everything moving forward, together.
              </p>
            </div>

            <div className={styles.quoteBlock}>
              <svg className={styles.quoteIcon} width="32" height="32" viewBox="0 0 24 24" fill="currentColor" opacity="0.4">
                <path d="M6 17h3l2-4V7H5v6h3l-2 4zm8 0h3l2-4V7h-6v6h3l-2 4z" />
              </svg>
              <blockquote className={styles.quoteText}>
                {quote.text}
              </blockquote>
              <p className={styles.quoteAuthor}>— {quote.author}</p>
            </div>

            {/* <div className={styles.statsRow}>
              <div className={styles.stat}>
                <span className={styles.statNum}>10k+</span>
                <span className={styles.statLabel}>Active Teams</span>
              </div>
              <div className={styles.statDivider} />
              <div className={styles.stat}>
                <span className={styles.statNum}>99.9%</span>
                <span className={styles.statLabel}>Uptime</span>
              </div>
              <div className={styles.statDivider} />
              <div className={styles.stat}>
                <span className={styles.statNum}>4.9★</span>
                <span className={styles.statLabel}>Rating</span>
              </div>
            </div> */
            <div className={styles.statsRow}>
  <div className={styles.stat}>
    <span className={styles.statLabel}>Designed for real team workflows</span>
  </div>
  <div className={styles.statDivider} />
  <div className={styles.stat}>
    <span className={styles.statLabel}>No clutter, just what matters</span>
  </div>
  <div className={styles.statDivider} />
  <div className={styles.stat}>
    <span className={styles.statLabel}>Built to keep teams aligned</span>
  </div>
</div>}
          </div>
        </aside>

        {/* Right Panel — Login Form */}
        <section className={styles.formPanel}>
          <div className={styles.formWrapper}>
            <div className={styles.formHeader}>
              <div className={styles.mobileLogo}>
                <div className={styles.logoIconSmall}>
                  <svg width="20" height="20" viewBox="0 0 28 28" fill="none">
                    <path d="M4 8L14 3L24 8V20L14 25L4 20V8Z" stroke="currentColor" strokeWidth="2.5" fill="none" />
                  </svg>
                </div>
                <span className={styles.mobileLogoText}>Karya Tracker</span>
              </div>
              <p className={styles.welcomeTag}>Welcome back</p>
              <h2 className={styles.formTitle}>Sign in to your account</h2>
              <p className={styles.formSubtitle}>
                Enter your registered email to continue
              </p>
            </div>

            <form onSubmit={handleSubmit} className={styles.form}>
              <div className={styles.fieldGroup}>
                <label className={styles.label} htmlFor="email">
                  Email Address
                </label>
                <div className={styles.inputWrap}>
                  <svg className={styles.inputIcon} width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                    <rect x="2" y="4" width="20" height="16" rx="3" />
                    <path d="M22 7L12 13L2 7" />
                  </svg>
                  <input
                    id="email"
                    className={styles.input}
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="name@company.com"
                    required
                  />
                </div>
              </div>

              {error && <p className={styles.error}>{error}</p>}

              <button
                className={styles.button}
                type="submit"
                disabled={loading || !email.trim()}
              >
                {loading ? (
                  <span className={styles.btnLoading}>
                    <span className={styles.spinner} />
                    Signing in…
                  </span>
                ) : (
                  "Continue"
                )}
              </button>
            </form>

            <div className={styles.divider}>
              <span>or</span>
            </div>

            <p className={styles.footerText}>
              Don&apos;t have an account?{" "}
              <a href="#" className={styles.link}>Contact your admin</a>
            </p>
          </div>

          <p className={styles.copyright}>
            © 2026 Karya Tracker · Privacy · Terms
          </p>
        </section>
      </div>
    </main>
  );
}
