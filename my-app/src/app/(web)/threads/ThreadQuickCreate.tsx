"use client";

import { useEffect, useMemo, useState } from "react";
import styles from "./ThreadQuickCreate.module.css";

type QuickType = "UPDATE" | "BLOCKER" | "IDEA";
type Urgency = "LOW" | "MEDIUM" | "HIGH";
type Impact = "LOW" | "MEDIUM" | "HIGH";
type Visibility = "ORG" | "TEAM" | "PRIVATE";

type UpdateChoice =
  | "TASK_COMPLETED"
  | "TASK_PROGRESS"
  | "MEETING"
  | "COORDINATION"
  | "OTHER";

type BlockerChoice =
  | "WAITING_ON_PERSON"
  | "RESOURCE_ISSUE"
  | "CLARITY_NEEDED"
  | "SYSTEM_ISSUE";

type OrgTeam = { id: string; name: string };
type OrgMember = { id: string; name: string; email: string };

type ThreadQuickCreateProps = {
  actorId: string;
  onCreated?: () => void;
};

function mapUpdateToWorkType(choice: UpdateChoice): "FEATURE" | "BUG" | "MEETING" | "OTHER" {
  if (choice === "MEETING") return "MEETING";
  if (choice === "TASK_PROGRESS") return "BUG";
  if (choice === "COORDINATION" || choice === "OTHER") return "OTHER";
  return "FEATURE";
}

function mapBlockerToType(choice: BlockerChoice): "CODE" | "DEPENDENCY" | "REQUIREMENT" {
  if (choice === "CLARITY_NEEDED") return "REQUIREMENT";
  if (choice === "SYSTEM_ISSUE") return "CODE";
  return "DEPENDENCY";
}

function summaryLabel(type: QuickType, update: UpdateChoice, blocker: BlockerChoice, urgency: Urgency, impact: Impact) {
  if (type === "UPDATE") {
    if (update === "TASK_COMPLETED") return "Completed: Task";
    if (update === "TASK_PROGRESS") return "Progress on: Activity";
    if (update === "MEETING") return "Attended: Meeting";
    if (update === "COORDINATION") return "Coordination update";
    return "Work update";
  }

  if (type === "BLOCKER") {
    if (blocker === "WAITING_ON_PERSON") return "Waiting on: Person";
    if (blocker === "RESOURCE_ISSUE") return `Issue: Resource (${urgency})`;
    if (blocker === "CLARITY_NEEDED") return "Needs clarity";
    return `Issue: System (${urgency})`;
  }

  return `Suggested improvement (${impact} impact)`;
}

export default function ThreadQuickCreate({ actorId, onCreated }: ThreadQuickCreateProps) {
  const [type, setType] = useState<QuickType>("UPDATE");
  const [updateChoice, setUpdateChoice] = useState<UpdateChoice>("TASK_COMPLETED");
  const [blockerChoice, setBlockerChoice] = useState<BlockerChoice>("WAITING_ON_PERSON");
  const [urgency, setUrgency] = useState<Urgency>("MEDIUM");
  const [impact, setImpact] = useState<Impact>("MEDIUM");
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Visibility state
  const [visibility, setVisibility] = useState<Visibility>("ORG");
  const [selectedTeamId, setSelectedTeamId] = useState<string>("");
  const [selectedMemberIds, setSelectedMemberIds] = useState<string[]>([]);
  const [teams, setTeams] = useState<OrgTeam[]>([]);
  const [members, setMembers] = useState<OrgMember[]>([]);
  const [loadingMeta, setLoadingMeta] = useState(false);
  const [emailInput, setEmailInput] = useState("");
  const [emailError, setEmailError] = useState<string | null>(null);

  // Lazy-fetch teams/members when visibility changes
    const [memberPage, setMemberPage] = useState(0);
  useEffect(() => {
    if (visibility === "TEAM" && teams.length === 0) {
      setLoadingMeta(true);
      fetch("/api/org/me")
        .then((r) => r.json())
        .then((json: { data?: { teams?: OrgTeam[] } }) => {
          setTeams(json.data?.teams ?? []);
          if (json.data?.teams?.[0]) setSelectedTeamId(json.data.teams[0].id);
        })
        .catch(() => undefined)
        .finally(() => setLoadingMeta(false));
    }
    if (visibility === "PRIVATE" && members.length === 0) {
      setLoadingMeta(true);
      setEmailError(null);
      fetch("/api/org/members")
        .then((r) => r.json())
        .then((json: { data?: Array<{ userId?: string; id?: string; name?: string; email?: string }> }) => {
          const list: OrgMember[] = (json.data ?? [])
            .map((m) => ({
              id: m.userId ?? m.id ?? "",
              name: m.name ?? "",
              email: m.email ?? "",
            }))
            .filter((m) => m.id && m.id !== actorId);
          setMembers(list);
        })
        .catch(() => setEmailError("Failed to load members"))
        .finally(() => setLoadingMeta(false));
    }
  // intentionally only re-run when visibility changes
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visibility]);

  const summary = useMemo(
    () => summaryLabel(type, updateChoice, blockerChoice, urgency, impact),
    [type, updateChoice, blockerChoice, urgency, impact]
  );

    const MEMBERS_PER_PAGE = 4;
    const sortedMembers = useMemo(() => {
      return [...members].sort((a, b) => {
        const aIsOwner = a.role === "OWNER" ? 1 : 0;
        const bIsOwner = b.role === "OWNER" ? 1 : 0;
        return aIsOwner - bIsOwner;
      });
    }, [members]);

    const totalMemberPages = Math.ceil(sortedMembers.length / MEMBERS_PER_PAGE);
    const paginatedMembers = sortedMembers.slice(
      memberPage * MEMBERS_PER_PAGE,
      (memberPage + 1) * MEMBERS_PER_PAGE
    );
  function handleEmailAdd() {
    setEmailError(null);
    if (!emailInput.trim()) return;

    const emails = emailInput
      .split(/[,;\\s]+/)
      .map((e) => e.trim())
      .filter((e) => e.length > 0);

    const matched = members.filter((m) =>
      emails.some((e) => m.email.toLowerCase() === e.toLowerCase())
    );
    if (matched.length === 0) {
      setEmailError(`No members found with emails: ${emails.join(", ")}`);
      return;
    }

    const newIds = matched
      .map((m) => m.id)
      .filter((id) => !selectedMemberIds.includes(id));
    setSelectedMemberIds((prev) => [...prev, ...newIds]);
    setEmailInput("");
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!actorId || submitting) return;

    setSubmitting(true);
    setError(null);

    const content = note.trim() ? `${summary} - ${note.trim()}` : summary;

    const meta: Record<string, string> = {};
    if (type === "UPDATE") {
      meta.workType = mapUpdateToWorkType(updateChoice);
    }
    if (type === "BLOCKER") {
      meta.blockerType = mapBlockerToType(blockerChoice);
      meta.urgency = urgency;
    }
    if (type === "IDEA") {
      meta.ideaImpact = impact;
    }

    try {
      const res = await fetch("/api/threads", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          type,
          content,
          meta,
          visibility,
          team_id: visibility === "TEAM" ? selectedTeamId || undefined : undefined,
          participant_ids: visibility === "PRIVATE" ? selectedMemberIds : undefined,
        }),
      });

      const json = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(json?.error?.message ?? "Failed to create thread");
      }

      if (json?.data?.points && typeof window !== "undefined") {
        window.dispatchEvent(
          new CustomEvent("points-updated", {
            detail: {
              points: json.data.points.points,
              streak: json.data.points.streak,
              awarded: json.data.points.awarded,
            },
          })
        );
      }

      setNote("");
      onCreated?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create thread");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form className={styles.wrap} onSubmit={handleSubmit}>
      <p className={styles.heading}>Quick Create</p>

      <div className={styles.primaryActions}>
        <button
          type="button"
          className={type === "UPDATE" ? styles.actionBtnActive : styles.actionBtn}
          onClick={() => setType("UPDATE")}
        >
          Log Work
        </button>
        <button
          type="button"
          className={type === "BLOCKER" ? styles.actionBtnActive : styles.actionBtn}
          onClick={() => setType("BLOCKER")}
        >
          Report Blocker
        </button>
        <button
          type="button"
          className={type === "IDEA" ? styles.actionBtnActive : styles.actionBtn}
          onClick={() => setType("IDEA")}
        >
          Share Idea
        </button>
      </div>

      {type === "UPDATE" && (
        <>
          <span className={styles.groupLabel}>Work type</span>
          <div className={styles.chips}>
            {(["TASK_COMPLETED", "TASK_PROGRESS", "MEETING", "COORDINATION", "OTHER"] as UpdateChoice[]).map((opt) => (
              <button
                key={opt}
                type="button"
                className={updateChoice === opt ? styles.chipActive : styles.chip}
                onClick={() => setUpdateChoice(opt)}
              >
                {opt.replaceAll("_", " ")}
              </button>
            ))}
          </div>
        </>
      )}

      {type === "BLOCKER" && (
        <>
          <span className={styles.groupLabel}>Blocker type</span>
          <div className={styles.chips}>
            {(["WAITING_ON_PERSON", "RESOURCE_ISSUE", "CLARITY_NEEDED", "SYSTEM_ISSUE"] as BlockerChoice[]).map((opt) => (
              <button
                key={opt}
                type="button"
                className={blockerChoice === opt ? styles.chipActive : styles.chip}
                onClick={() => setBlockerChoice(opt)}
              >
                {opt.replaceAll("_", " ")}
              </button>
            ))}
          </div>

          <span className={styles.groupLabel}>Urgency</span>
          <div className={styles.chips}>
            {(["LOW", "MEDIUM", "HIGH"] as Urgency[]).map((opt) => (
              <button
                key={opt}
                type="button"
                className={urgency === opt ? styles.chipActive : styles.chip}
                onClick={() => setUrgency(opt)}
              >
                {opt}
              </button>
            ))}
          </div>
        </>
      )}

      {type === "IDEA" && (
        <>
          <span className={styles.groupLabel}>Impact</span>
          <div className={styles.chips}>
            {(["LOW", "MEDIUM", "HIGH"] as Impact[]).map((opt) => (
              <button
                key={opt}
                type="button"
                className={impact === opt ? styles.chipActive : styles.chip}
                onClick={() => setImpact(opt)}
              >
                {opt}
              </button>
            ))}
          </div>
        </>
      )}

      <input
        className={styles.noteInput}
        type="text"
        maxLength={120}
        placeholder="Optional note (one line)"
        value={note}
        onChange={(e) => setNote(e.target.value)}
      />

      <p className={styles.summary}>{summary}</p>

      {/* ── Visibility ─────────────────────────────────── */}
      <span className={styles.groupLabel}>Share with</span>
      <div className={styles.chips}>
        {(["ORG", "TEAM", "PRIVATE"] as Visibility[]).map((v) => (
          <button
            key={v}
            type="button"
            className={visibility === v ? styles.chipActive : styles.chip}
            onClick={() => {
              setVisibility(v);
              setSelectedMemberIds([]);
            }}
          >
            {v === "ORG" ? "🌐 Org" : v === "TEAM" ? "👥 Team" : "🔒 Private"}
          </button>
        ))}
      </div>

      {visibility === "TEAM" && (
        <>
          <span className={styles.groupLabel}>Select team</span>
          {loadingMeta && <p className={styles.summary}>Loading teams…</p>}
          {!loadingMeta && teams.length === 0 && (
            <p className={styles.summary}>No teams found. Contact your admin.</p>
          )}
          {!loadingMeta && teams.length > 0 && (
            <select
              className={styles.noteInput}
              value={selectedTeamId}
              onChange={(e) => setSelectedTeamId(e.target.value)}
            >
              {teams.map((t) => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
          )}
        </>
      )}

      {visibility === "PRIVATE" && (
        <>
          <span className={styles.groupLabel}>Share with members</span>

          {!loadingMeta && members.length > 0 && (
            <div className={styles.emailInputRow}>
              <input
                type="text"
                className={styles.noteInput}
                placeholder="Paste email(s) — separate with comma or semicolon"
                value={emailInput}
                onChange={(e) => {
                  setEmailInput(e.target.value);
                  setEmailError(null);
                }}
                onKeyPress={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    handleEmailAdd();
                  }
                }}
              />
              <button
                type="button"
                className={styles.emailAddBtn}
                onClick={handleEmailAdd}
                disabled={!emailInput.trim()}
              >
                Add
              </button>
            </div>
          )}
          {emailError && <p className={styles.error}>{emailError}</p>}

          {loadingMeta && <p className={styles.summary}>Loading members…</p>}
          {!loadingMeta && members.length === 0 && (
            <p className={styles.summary}>No other members found in your org.</p>
          )}
          {!loadingMeta && members.length > 0 && (
            <>
              <div className={styles.memberChecklist}>
                {paginatedMembers.map((m) => (
                <label key={m.id} className={styles.memberCheckItem}>
                  <input
                    type="checkbox"
                    checked={selectedMemberIds.includes(m.id)}
                    onChange={(e) =>
                      setSelectedMemberIds((prev) =>
                        e.target.checked ? [...prev, m.id] : prev.filter((x) => x !== m.id)
                      )
                    }
                  />
                  <span>{m.name || m.email}</span>
                  <span className={styles.memberEmail}>{m.email}</span>
                </label>
              )))} 
            </div>
          )}
              {totalMemberPages > 1 && (
                <div className={styles.memberPagination}>
                  <button
                    type="button"
                    className={styles.paginationBtn}
                    onClick={() => setMemberPage((p) => Math.max(0, p - 1))}
                    disabled={memberPage === 0}
                  >
                    ← Prev
                  </button>
                  <span className={styles.paginationInfo}>
                    {memberPage + 1} / {totalMemberPages}
                  </span>
                  <button
                    type="button"
                    className={styles.paginationBtn}
                    onClick={() => setMemberPage((p) => Math.min(totalMemberPages - 1, p + 1))}
                    disabled={memberPage === totalMemberPages - 1}
                  >
                    Next →
                  </button>
                </div>
              )}
          {visibility === "PRIVATE" && selectedMemberIds.length === 0 && !loadingMeta && members.length > 0 && (
            <p className={styles.summary}>⚠ Select at least one member to share with.</p>
          )}
        </>
      )}

      {error && <p className={styles.error}>{error}</p>}

      <div className={styles.submitRow}>
        <button
          className={styles.submitBtn}
          type="submit"
          disabled={
            submitting ||
            !actorId ||
            (visibility === "TEAM" && !selectedTeamId) ||
            (visibility === "PRIVATE" && selectedMemberIds.length === 0)
          }
        >
          {submitting ? "Posting..." : "Post Update"}
        </button>
      </div>
    </form>
  );
}
