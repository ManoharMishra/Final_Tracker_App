"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useUserContext } from "@/lib/context/user-context";
import type { ThreadListItem } from "@/lib/types/thread.types";
import { getThreads } from "@/lib/api/threads";
import ThreadQuickCreate from "./ThreadQuickCreate";
import styles from "./threads.module.css";

function inputTypeBadgeClass(inputType?: ThreadListItem["input_type"] | null) {
  if (inputType === "UPDATE") return styles.quickTypeUpdate;
  if (inputType === "BLOCKER") return styles.quickTypeBlocker;
  if (inputType === "IDEA") return styles.quickTypeIdea;
  return styles.quickTypeTaskSource;
}

function inputTypeLabel(inputType?: ThreadListItem["input_type"] | null) {
  return inputType ?? "TASK_SOURCE";
}

function visibilityLabel(thread: ThreadListItem): string {
  if (thread.type === "team") return "👥 Team";
  if (thread.type === "private") return "🔒 Private";
  return "🌐 Org";
}

function visibilityBadgeClass(thread: ThreadListItem, styles: Record<string, string>): string {
  if (thread.type === "team") return styles.visTeam ?? "";
  if (thread.type === "private") return styles.visPrivate ?? "";
  return styles.visOrg ?? "";
}

function summaryLine(thread: ThreadListItem): string {
  const inputType = thread.input_type;
  if (inputType === "UPDATE") {
    if (thread.meta?.workType === "FEATURE") return "Completed: Feature work";
    if (thread.meta?.workType === "BUG") return "Progress on: Bug fix";
    if (thread.meta?.workType === "MEETING") return "Attended: Meeting";
    return "Progress on: Coordination";
  }

  if (inputType === "BLOCKER") {
    if (thread.meta?.blockerType === "DEPENDENCY") {
      return "Waiting on: Dependency";
    }
    if (thread.meta?.blockerType === "REQUIREMENT") {
      return "Needs clarity";
    }
    const urgency = thread.meta?.urgency ? ` (${thread.meta.urgency})` : "";
    return `Issue: System${urgency}`;
  }

  if (inputType === "IDEA") {
    const impact = thread.meta?.ideaImpact ? ` (${thread.meta.ideaImpact} impact)` : "";
    return `Suggested improvement${impact}`;
  }

  return "Task source";
}

export default function ThreadsPage() {
  const { initialized, user_id } = useUserContext();
  const [threads, setThreads] = useState<ThreadListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string>("");
  const [type, setType] = useState<string>("");
  const [actionBusyByThread, setActionBusyByThread] = useState<Record<string, boolean>>({});
  const currentUserId = user_id ?? "";

  function loadThreads() {
    if (!initialized) {
      return;
    }

    setLoading(true);
    setError(null);

    if (!currentUserId) {
      setError("Invalid session. Please login again.");
      setLoading(false);
      return;
    }

    getThreads({ status: status || undefined, type: type || undefined })
      .then((data) => setThreads(data.data))
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    if (!initialized) {
      return;
    }

    loadThreads();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialized, currentUserId, status, type]);

  async function handleReact(threadId: string) {
    if (!currentUserId) return;
    setActionBusyByThread((m) => ({ ...m, [threadId]: true }));
    try {
      const res = await fetch(`/api/threads/${threadId}/react`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ reaction: "like" }),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => null);
        throw new Error(json?.error?.message ?? "Failed to react");
      }
      setThreads((prev) =>
        prev.map((t) =>
          t.id === threadId
            ? {
                ...t,
                stats: {
                  reactionsCount: (t.stats?.reactionsCount ?? 0) + 1,
                  commentsCount: t.stats?.commentsCount ?? 0,
                  conversionCount: t.stats?.conversionCount ?? 0,
                },
              }
            : t
        )
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to react");
    } finally {
      setActionBusyByThread((m) => ({ ...m, [threadId]: false }));
    }
  }

  async function handleComment(threadId: string) {
    if (!currentUserId) return;
    const comment = window.prompt("Add a short comment");
    if (!comment || !comment.trim()) return;

    setActionBusyByThread((m) => ({ ...m, [threadId]: true }));
    try {
      const res = await fetch(`/api/threads/${threadId}/comment`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ comment: comment.trim() }),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => null);
        throw new Error(json?.error?.message ?? "Failed to comment");
      }
      setThreads((prev) =>
        prev.map((t) =>
          t.id === threadId
            ? {
                ...t,
                stats: {
                  reactionsCount: t.stats?.reactionsCount ?? 0,
                  commentsCount: (t.stats?.commentsCount ?? 0) + 1,
                  conversionCount: t.stats?.conversionCount ?? 0,
                },
              }
            : t
        )
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to comment");
    } finally {
      setActionBusyByThread((m) => ({ ...m, [threadId]: false }));
    }
  }

  async function handleConvert(threadId: string) {
    if (!currentUserId) return;
    setActionBusyByThread((m) => ({ ...m, [threadId]: true }));
    try {
      const res = await fetch(`/api/threads/${threadId}/convert-to-task`, {
        method: "POST",
      });
      if (!res.ok) {
        const json = await res.json().catch(() => null);
        throw new Error(json?.error?.message ?? "Failed to convert to task");
      }
      const json = (await res.json()) as { data?: { thread?: { taskId?: string | null } } };
      const newTaskId = json.data?.thread?.taskId ?? "converted";

      if ((json as { data?: { points?: { points: number; streak: number; awarded?: number } } }).data?.points) {
        const points = (json as { data?: { points?: { points: number; streak: number; awarded?: number } } }).data?.points;
        if (points && typeof window !== "undefined") {
          window.dispatchEvent(
            new CustomEvent("points-updated", {
              detail: {
                points: points.points,
                streak: points.streak,
                awarded: points.awarded,
              },
            })
          );
        }
      }

      setThreads((prev) =>
        prev.map((t) =>
          t.id === threadId
            ? {
                ...t,
                taskId: newTaskId,
                stats: {
                  reactionsCount: t.stats?.reactionsCount ?? 0,
                  commentsCount: t.stats?.commentsCount ?? 0,
                  conversionCount: (t.stats?.conversionCount ?? 0) + 1,
                },
              }
            : t
        )
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to convert");
    } finally {
      setActionBusyByThread((m) => ({ ...m, [threadId]: false }));
    }
  }

  return (
    <>
      <h1 className={styles.pageTitle}>Threads</h1>

      <ThreadQuickCreate actorId={currentUserId} onCreated={loadThreads} />

      <div className={styles.controls}>
        <select
          className={styles.select}
          value={status}
          onChange={(e) => setStatus(e.target.value)}
        >
          <option value="">All statuses</option>
          <option value="open">Open</option>
          <option value="dormant">Dormant</option>
          <option value="converted">Converted</option>
        </select>

        <select
          className={styles.select}
          value={type}
          onChange={(e) => setType(e.target.value)}
        >
          <option value="">All types</option>
          <option value="private">Private</option>
          <option value="team">Team</option>
          <option value="org">Org</option>
        </select>
      </div>

      {loading && <p className={styles.loading}>Loading…</p>}
      {error && <p className={styles.error}>{error}</p>}

      {!loading && !error && threads.length === 0 && (
        <p className={styles.empty}>No threads found.</p>
      )}

      {!loading && !error && threads.length > 0 && (
        <div className={styles.threadList}>
          {threads.map((thread) => (
            <article key={thread.id} className={styles.quickCard}>
              <div className={styles.quickTopRow}>
                <div className={styles.quickUserTime}>
                  <span className={styles.quickUserName}>
                    {thread.creator?.name || "Unknown user"}
                  </span>
                  <span className={styles.quickDot}>•</span>
                  <span className={styles.quickTime}>
                    {new Date(thread.created_at).toLocaleString()}
                  </span>
                </div>
                <div className={styles.quickBadgeRow}>
                  <span className={`${styles.quickVisBadge} ${visibilityBadgeClass(thread, styles)}`}>
                    {visibilityLabel(thread)}
                  </span>
                  <span className={`${styles.quickType} ${inputTypeBadgeClass(thread.input_type)}`}>
                    {inputTypeLabel(thread.input_type)}
                  </span>
                </div>
              </div>

              <p className={styles.quickSummary}>{summaryLine(thread)}</p>

              {thread.content && (
                <p className={styles.quickNote}>{thread.content}</p>
              )}

              <div className={styles.quickActions}>
                <button
                  type="button"
                  className={styles.quickActionBtn}
                  disabled={!!actionBusyByThread[thread.id]}
                  onClick={() => handleReact(thread.id)}
                >
                  👍 React
                </button>
                <button
                  type="button"
                  className={styles.quickActionBtn}
                  disabled={!!actionBusyByThread[thread.id]}
                  onClick={() => handleComment(thread.id)}
                >
                  💬 Comment
                </button>
                {(thread.input_type === "IDEA" || thread.input_type === "TASK_SOURCE") && (
                  <button
                    type="button"
                    className={styles.quickActionBtnPrimary}
                    disabled={!!thread.taskId || !!actionBusyByThread[thread.id]}
                    onClick={() => handleConvert(thread.id)}
                  >
                    🎯 Convert to Task
                  </button>
                )}
              </div>

              <div className={styles.quickIndicators}>
                {thread.taskId && (
                  <span className={styles.quickIndicatorOk}>Converted to task ✔️</span>
                )}
                <span>{thread.stats?.reactionsCount ?? 0} reactions</span>
                <span>{thread.stats?.commentsCount ?? 0} comments</span>
                <Link href={`/threads/${thread.id}`} className={styles.quickOpenLink}>
                  Open
                </Link>
              </div>
            </article>
          ))}
        </div>
      )}
    </>
  );
}
