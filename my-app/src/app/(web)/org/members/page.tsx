"use client";

import Link from "next/link";
import { useEffect, useState, useCallback, useRef } from "react";
import { useUserContext } from "@/lib/context/user-context";
import styles from "./members.module.css";

// ── Types ─────────────────────────────────────────────────────────────────

type Role = "OWNER" | "ADMIN" | "MEMBER";

interface Member {
  id: string; // membership id
  userId: string;
  name: string;
  email: string;
  role: Role;
  joinedAt: string;
}

interface Toast {
  id: number;
  message: string;
  type: "success" | "error";
}

function getApiErrorMessage(payload: unknown, fallback: string): string {
  if (payload && typeof payload === "object") {
    const error = "error" in payload ? payload.error : null;
    if (typeof error === "string") {
      return error;
    }

    if (
      error &&
      typeof error === "object" &&
      "message" in error &&
      typeof error.message === "string"
    ) {
      return error.message;
    }
  }

  return fallback;
}

function toDisplayMessage(value: unknown, fallback: string): string {
  if (typeof value === "string" && value.trim()) {
    return value;
  }

  if (value instanceof Error && value.message.trim()) {
    return value.message;
  }

  return getApiErrorMessage(value, fallback);
}

const TOAST_DURATION = 4000;

// ── Helpers ───────────────────────────────────────────────────────────────

function badgeClass(role: Role, s: typeof styles): string {
  if (role === "OWNER") return `${s.badge} ${s.badgeOwner}`;
  if (role === "ADMIN") return `${s.badge} ${s.badgeAdmin}`;
  return `${s.badge} ${s.badgeMember}`;
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

// ── Toast Stack ──────────────────────────────────────────────────────────

function ToastStack({
  toasts,
  onDismiss,
}: {
  toasts: Toast[];
  onDismiss: (id: number) => void;
}) {
  if (toasts.length === 0) return null;
  return (
    <div className={styles.toastStack} aria-live="polite">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={`${styles.toast} ${
            t.type === "success" ? styles.toastSuccess : styles.toastError
          }`}
          role="alert"
        >
          <span>{t.message}</span>
          <button
            type="button"
            className={styles.toastDismiss}
            aria-label="Dismiss"
            onClick={() => onDismiss(t.id)}
          >
            ✕
          </button>
        </div>
      ))}
    </div>
  );
}

// ── Table Skeleton ────────────────────────────────────────────────────────

function TableSkeleton({ cols }: { cols: number }) {
  return (
    <>
      {Array.from({ length: 5 }).map((_, i) => (
        <tr key={i} className={styles.skeletonRow}>
          {Array.from({ length: cols }).map((_, j) => (
            <td key={j}>
              <span
                className={styles.skeletonCell}
                style={{ width: `${60 + ((i * 3 + j * 7) % 30)}%` }}
              />
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}

// ── Page Component ────────────────────────────────────────────────────────

export default function OrgMembersPage() {
  const { initialized, user_id } = useUserContext();
  // members
  const [members, setMembers] = useState<Member[]>([]);
  const [membersLoading, setMembersLoading] = useState(true);
  const [membersError, setMembersError] = useState<string | null>(null);

  // role change
  const [roleUpdating, setRoleUpdating] = useState<string | null>(null);
  const [removeLoading, setRemoveLoading] = useState<string | null>(null);

  // actor role (for showing actions)
  const [actorRole, setActorRole] = useState<Role | null>(null);
  const actorId = user_id ?? "";

  // toasts
  const toastCounter = useRef(0);
  const [toasts, setToasts] = useState<Toast[]>([]);

  function dismissToast(id: number) {
    setToasts((t) => t.filter((toast) => toast.id !== id));
  }

  function pushToast(message: unknown, type: Toast["type"] = "error") {
    const id = ++toastCounter.current;
    const normalizedMessage = toDisplayMessage(message, "Something went wrong");
    setToasts((t) => [...t, { id, message: normalizedMessage, type }]);
    setTimeout(
      () => setToasts((t) => t.filter((toast) => toast.id !== id)),
      TOAST_DURATION
    );
  }

  // ── Fetch members ───────────────────────────────────────────────────────

  const fetchMembers = useCallback(async () => {
    setMembersLoading(true);
    setMembersError(null);
    try {
      const res = await fetch("/api/org/members");
      const json = await res.json();
      if (!res.ok) {
        throw new Error(getApiErrorMessage(json, "Failed to load members"));
      }
      const memberList = json.data ?? json.members ?? [];
      setMembers(memberList);

      // derive actor's own role from the list
      const self = memberList.find(
        (m: Member) => m.userId === actorId
      );
      if (self) setActorRole(self.role);
    } catch (e: unknown) {
      setMembersError(toDisplayMessage(e, "Unknown error"));
    } finally {
      setMembersLoading(false);
    }
  }, [actorId]);

  useEffect(() => {
    if (!initialized) {
      return;
    }

    if (!actorId) {
      setMembersLoading(false);
      setMembersError("Session user not found. Please login first.");
      return;
    }

    fetchMembers();
  }, [initialized, actorId, fetchMembers]);

  // ── Change role (optimistic) ────────────────────────────────────────────

  async function handleRoleChange(member: Member, role: Role) {
    if (member.role === role) {
      return;
    }

    const confirmed = window.confirm(
      `Proceed with role change for ${member.name}?\n\n` +
        `Current role: ${member.role}\n` +
        `New role: ${role}\n\n` +
        "Risk: this changes member permissions immediately."
    );

    if (!confirmed) {
      return;
    }

    const snapshot = members;
    // Apply optimistically
    setMembers((ms) => ms.map((m) => (m.id === member.id ? { ...m, role } : m)));
    setRoleUpdating(member.id);
    try {
      const res = await fetch("/api/org/member/role", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ memberId: member.id, role }),
      });
      const json = await res.json();
      if (!res.ok) {
        setMembers(snapshot); // revert
        pushToast(getApiErrorMessage(json, "Failed to update role"));
      } else {
        pushToast(`${member.name} is now ${role}`, "success");
      }
      // No refetch — optimistic state is already correct on success
    } catch {
      setMembers(snapshot);
      pushToast("Network error updating role");
    } finally {
      setRoleUpdating(null);
    }
  }

  // ── Remove member (optimistic) ──────────────────────────────────────────

  async function handleRemove(memberId: string, name: string) {
    if (!confirm(`Remove ${name} from the organisation?`)) return;
    const snapshot = members;
    // Apply optimistically
    setMembers((ms) => ms.filter((m) => m.id !== memberId));
    setRemoveLoading(memberId);
    try {
      const res = await fetch("/api/org/member/remove", {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ memberId }),
      });
      const json = await res.json();
      if (!res.ok) {
        setMembers(snapshot); // revert
        pushToast(getApiErrorMessage(json, "Failed to remove member"));
      } else {
        pushToast(`${name} removed from the organisation`, "success");
      }
    } catch {
      setMembers(snapshot);
      pushToast("Network error removing member");
    } finally {
      setRemoveLoading(null);
    }
  }

  // ── Derived ─────────────────────────────────────────────────────────────

  const isManager = actorRole === "OWNER" || actorRole === "ADMIN";
  const rolePolicyText =
    actorRole === "OWNER"
      ? "Policy: OWNER can invite OWNER, ADMIN, or MEMBER."
      : actorRole === "ADMIN"
        ? "Policy: ADMIN can invite ADMIN or MEMBER (not OWNER), only within their own team."
        : actorRole === "MEMBER"
          ? "Policy: MEMBER can invite MEMBER only, and only within their own team."
          : null;

  // ── Render ──────────────────────────────────────────────────────────────

  return (
    <div className={styles.page}>
      {!actorId && (
        <div className={styles.error}>
          No active session found. Please login again.
        </div>
      )}

      <div className={styles.pageHeader}>
        <h1 className={styles.pageTitle}>Organisation Members</h1>
        {isManager && (
          <Link href="/org/members/invite" className={styles.btnPrimary}>
            + Invite Member
          </Link>
        )}
      </div>

      {rolePolicyText && (
        <div className={styles.policyCard} aria-live="polite">
          <p className={styles.policyTitle}>Role Policy</p>
          <p className={styles.policyText}>{rolePolicyText}</p>
        </div>
      )}

      {actorRole === "MEMBER" && (
        <div className={styles.policyCard} aria-live="polite">
          <p className={styles.policyTitle}>View Only</p>
          <p className={styles.policyText}>
            You can view all organization members and roles here, but only OWNER/ADMIN can edit roles or remove members.
          </p>
        </div>
      )}

      {/* ── Members table ─────────────────────────────────────────────── */}
      <div className={styles.card}>
        <div className={styles.cardHeader}>
          <h2 className={styles.cardTitle}>
            Members ({members.length})
          </h2>
        </div>

        {membersError && (
          <div className={styles.error}>{membersError}</div>
        )}

        {membersLoading ? (
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                {actorRole !== "MEMBER" && <th>Role</th>}
                <th>Joined</th>
                {isManager && <th>Actions</th>}
              </tr>
            </thead>
            <tbody>
              <TableSkeleton cols={isManager ? 5 : actorRole === "MEMBER" ? 3 : 4} />
            </tbody>
          </table>
        ) : members.length === 0 ? (
          <div className={styles.empty}>No members found.</div>
        ) : (
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                {actorRole !== "MEMBER" && <th>Role</th>}
                <th>Joined</th>
                {isManager && <th>Actions</th>}
              </tr>
            </thead>
            <tbody>
              {members.map((m) => {
                const isSelf = m.userId === actorId;
                const canModify =
                  isManager &&
                  !isSelf &&
                  !(actorRole === "ADMIN" && m.role === "OWNER");

                return (
                  <tr key={m.id}>
                    <td>{m.name}</td>
                    <td>{m.email}</td>
                    {actorRole !== "MEMBER" && (
                      <td>
                        {canModify ? (
                          <span className={styles.roleCell}>
                            <select
                              className={styles.roleSelect}
                              value={m.role}
                              disabled={roleUpdating === m.id}
                              onChange={(e) =>
                                handleRoleChange(m, e.target.value as Role)
                              }
                            >
                              {actorRole === "OWNER" && (
                                <option value="OWNER">OWNER</option>
                              )}
                              <option value="ADMIN">ADMIN</option>
                              <option value="MEMBER">MEMBER</option>
                            </select>
                            {roleUpdating === m.id && (
                              <span className={styles.spinner} />
                            )}
                          </span>
                        ) : (
                          <span className={badgeClass(m.role, styles)}>
                            {m.role}
                          </span>
                        )}
                      </td>
                    )}
                    <td>{fmtDate(m.joinedAt)}</td>
                    {isManager && (
                      <td>
                        <div className={styles.actionsCell}>
                          {canModify && (
                            <button
                              type="button"
                              className={styles.btnDanger}
                              disabled={removeLoading === m.id || roleUpdating === m.id}
                              onClick={() => handleRemove(m.id, m.name)}
                            >
                              {removeLoading === m.id ? (
                                <span className={styles.spinner} />
                              ) : (
                                "Remove"
                              )}
                            </button>
                          )}
                        </div>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      <ToastStack toasts={toasts} onDismiss={dismissToast} />
    </div>
  );
}
