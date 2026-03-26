"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import styles from "./teams.module.css";

type Team = {
  id: string;
  name: string;
  slug: string;
  createdAt: string;
  memberCount: number;
};

type Member = {
  userId: string;
  name: string;
  email: string;
  role: "OWNER" | "ADMIN" | "MEMBER";
  teamIds: string[];
  teamNames: string[];
};

type Payload = {
  teams: Team[];
  members: Member[];
};

function getErrorMessage(payload: unknown, fallback: string): string {
  if (payload && typeof payload === "object") {
    const err = "error" in payload ? payload.error : null;
    if (typeof err === "string") return err;
    if (err && typeof err === "object" && "message" in err && typeof err.message === "string") {
      return err.message;
    }
  }
  return fallback;
}

export default function OrgTeamsPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  const [teams, setTeams] = useState<Team[]>([]);
  const [members, setMembers] = useState<Member[]>([]);

  const [newTeamName, setNewTeamName] = useState("");
  const [creating, setCreating] = useState(false);

  const [renamingTeamId, setRenamingTeamId] = useState<string | null>(null);
  const [renameDrafts, setRenameDrafts] = useState<Record<string, string>>({});

  const [movingUserId, setMovingUserId] = useState<string | null>(null);
  const [pendingTeamSelection, setPendingTeamSelection] = useState<Record<string, string[]>>({});

  const teamsById = useMemo(() => {
    const map = new Map<string, Team>();
    for (const team of teams) map.set(team.id, team);
    return map;
  }, [teams]);

  async function loadData() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/org/teams", { cache: "no-store" });
      const json = await res.json();
      if (!res.ok) {
        throw new Error(getErrorMessage(json, "Failed to load teams"));
      }

      const data = (json.data ?? {}) as Partial<Payload>;
      setTeams(Array.isArray(data.teams) ? data.teams : []);
      const nextMembers = Array.isArray(data.members) ? data.members : [];
      setMembers(nextMembers);
      setPendingTeamSelection(
        Object.fromEntries(nextMembers.map((member) => [member.userId, member.teamIds ?? []]))
      );
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadData();
  }, []);

  async function handleCreateTeam(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setStatus(null);

    const name = newTeamName.trim();
    if (name.length < 2) {
      setError("Team name must be at least 2 characters.");
      return;
    }

    setCreating(true);
    try {
      const res = await fetch("/api/org/teams", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const json = await res.json();
      if (!res.ok) {
        throw new Error(getErrorMessage(json, "Failed to create team"));
      }

      setNewTeamName("");
      setStatus("Team created.");
      await loadData();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setCreating(false);
    }
  }

  async function handleRenameTeam(teamId: string) {
    const nextName = (renameDrafts[teamId] ?? "").trim();
    if (nextName.length < 2) {
      setError("Team name must be at least 2 characters.");
      return;
    }

    setRenamingTeamId(teamId);
    setError(null);
    setStatus(null);
    try {
      const res = await fetch(`/api/org/teams/${encodeURIComponent(teamId)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: nextName }),
      });
      const json = await res.json();
      if (!res.ok) {
        throw new Error(getErrorMessage(json, "Failed to rename team"));
      }

      setStatus("Team renamed.");
      await loadData();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setRenamingTeamId(null);
    }
  }

  async function handleMoveMember(userId: string, teamIds: string[]) {
    if (teamIds.length === 0) {
      setError("Select at least one team.");
      return;
    }

    setMovingUserId(userId);
    setError(null);
    setStatus(null);

    try {
      const res = await fetch("/api/org/teams/members", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, teamIds }),
      });
      const json = await res.json();
      if (!res.ok) {
        throw new Error(getErrorMessage(json, "Failed to move member"));
      }

      setStatus("Member team assignments updated.");
      await loadData();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setMovingUserId(null);
    }
  }

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <h1 className={styles.title}>Team Management</h1>
        <p className={styles.subtitle}>
          Create departments, rename teams, and assign members to teams.
        </p>
      </header>

      {error && <div className={styles.error}>{error}</div>}
      {status && <div className={styles.success}>{status}</div>}

      <section className={styles.card}>
        <h2 className={styles.cardTitle}>Create Team</h2>
        <form className={styles.inlineForm} onSubmit={handleCreateTeam}>
          <input
            className={styles.input}
            type="text"
            value={newTeamName}
            placeholder="e.g. Product Engineering"
            onChange={(e) => setNewTeamName(e.target.value)}
            disabled={creating}
          />
          <button className={styles.primaryBtn} type="submit" disabled={creating}>
            {creating ? "Creating..." : "Create Team"}
          </button>
        </form>
      </section>

      <section className={styles.card}>
        <h2 className={styles.cardTitle}>Teams</h2>
        {loading ? (
          <p className={styles.muted}>Loading teams...</p>
        ) : teams.length === 0 ? (
          <p className={styles.muted}>No teams found.</p>
        ) : (
          <div className={styles.list}>
            {teams.map((team) => (
              <div key={team.id} className={styles.listItem}>
                <div className={styles.teamMeta}>
                  <strong>{team.name}</strong>
                  <span>{team.memberCount} members</span>
                </div>
                <div className={styles.renameRow}>
                  <input
                    className={styles.input}
                    type="text"
                    value={renameDrafts[team.id] ?? team.name}
                    onChange={(e) =>
                      setRenameDrafts((prev) => ({
                        ...prev,
                        [team.id]: e.target.value,
                      }))
                    }
                    disabled={renamingTeamId === team.id}
                  />
                  <button
                    className={styles.secondaryBtn}
                    type="button"
                    onClick={() => void handleRenameTeam(team.id)}
                    disabled={renamingTeamId === team.id}
                  >
                    {renamingTeamId === team.id ? "Saving..." : "Rename"}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className={styles.card}>
        <h2 className={styles.cardTitle}>Move Members Between Teams</h2>
        {loading ? (
          <p className={styles.muted}>Loading members...</p>
        ) : members.length === 0 ? (
          <p className={styles.muted}>No members found.</p>
        ) : (
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th>Role</th>
                <th>Current Teams</th>
                <th>Assign Teams</th>
                <th>Apply</th>
              </tr>
            </thead>
            <tbody>
              {members.map((member) => (
                <tr key={member.userId}>
                  <td>{member.name}</td>
                  <td>{member.email}</td>
                  <td>{member.role}</td>
                  <td>{member.teamNames.length > 0 ? member.teamNames.join(", ") : "Not assigned"}</td>
                  <td>
                    <div className={styles.teamChecklist}>
                      {teams.map((team) => {
                        const selected = pendingTeamSelection[member.userId] ?? [];
                        const checked = selected.includes(team.id);
                        return (
                          <label key={`${member.userId}-${team.id}`} className={styles.teamCheckItem}>
                            <input
                              type="checkbox"
                              checked={checked}
                              disabled={movingUserId === member.userId}
                              onChange={(e) => {
                                setPendingTeamSelection((prev) => {
                                  const current = prev[member.userId] ?? [];
                                  const next = e.target.checked
                                    ? [...current, team.id]
                                    : current.filter((id) => id !== team.id);
                                  return {
                                    ...prev,
                                    [member.userId]: next,
                                  };
                                });
                              }}
                            />
                            <span>{team.name}</span>
                          </label>
                        );
                      })}
                    </div>
                  </td>
                  <td>
                    <button
                      type="button"
                      className={styles.secondaryBtn}
                      disabled={movingUserId === member.userId || teams.length === 0}
                      onClick={() =>
                        void handleMoveMember(member.userId, pendingTeamSelection[member.userId] ?? [])
                      }
                    >
                      {movingUserId === member.userId ? "Applying..." : "Apply"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section className={styles.note}>
        <p>
          Note: ADMIN sees only assigned teams and non-owner members in those teams. ADMIN and MEMBER invite links are restricted to their own teams.
        </p>
      </section>
    </div>
  );
}
