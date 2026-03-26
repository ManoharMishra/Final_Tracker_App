"use client";

import { useEffect, useMemo, useState } from "react";
import styles from "./team-view.module.css";

type Team = {
  id: string;
  name: string;
  slug: string;
  memberCount: number;
};

type TeamMember = {
  teamId: string;
  userId: string;
  name: string;
  email: string;
  role: "OWNER" | "ADMIN" | "MEMBER";
  joinedAt: string;
};

type Payload = {
  teams: Team[];
  members: TeamMember[];
};

function getErrorMessage(payload: unknown, fallback: string): string {
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

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export default function TeamViewPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [teams, setTeams] = useState<Team[]>([]);
  const [members, setMembers] = useState<TeamMember[]>([]);

  useEffect(() => {
    let active = true;

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch("/api/org/team-view", { cache: "no-store" });
        const json = await res.json();
        if (!res.ok) {
          throw new Error(getErrorMessage(json, "Failed to load team view"));
        }

        if (!active) return;
        const data = (json.data ?? {}) as Partial<Payload>;
        setTeams(Array.isArray(data.teams) ? data.teams : []);
        setMembers(Array.isArray(data.members) ? data.members : []);
      } catch (err: unknown) {
        if (!active) return;
        setError(err instanceof Error ? err.message : "Unknown error");
      } finally {
        if (active) setLoading(false);
      }
    }

    void load();
    return () => {
      active = false;
    };
  }, []);

  const membersByTeam = useMemo(() => {
    const map = new Map<string, TeamMember[]>();
    for (const member of members) {
      const current = map.get(member.teamId) ?? [];
      current.push(member);
      map.set(member.teamId, current);
    }
    return map;
  }, [members]);

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <h1 className={styles.title}>Team View</h1>
        <p className={styles.subtitle}>
          View the members and roles for the teams you belong to.
        </p>
      </header>

      {error && <div className={styles.error}>{error}</div>}

      {loading ? (
        <div className={styles.card}>
          <p className={styles.muted}>Loading team members...</p>
        </div>
      ) : teams.length === 0 ? (
        <div className={styles.card}>
          <p className={styles.muted}>You are not assigned to any team yet.</p>
        </div>
      ) : (
        <div className={styles.stack}>
          {teams.map((team) => {
            const teamMembers = membersByTeam.get(team.id) ?? [];
            return (
              <section key={team.id} className={styles.card}>
                <div className={styles.teamHeader}>
                  <div>
                    <h2 className={styles.teamTitle}>{team.name}</h2>
                    <p className={styles.teamMeta}>Slug: {team.slug}</p>
                  </div>
                  <span className={styles.countBadge}>{team.memberCount} members</span>
                </div>

                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>Email</th>
                      <th>Role</th>
                      <th>Joined Team</th>
                    </tr>
                  </thead>
                  <tbody>
                    {teamMembers.length === 0 ? (
                      <tr>
                        <td colSpan={4} className={styles.emptyCell}>
                          No members found for this team.
                        </td>
                      </tr>
                    ) : (
                      teamMembers.map((member) => (
                        <tr key={`${team.id}-${member.userId}`}>
                          <td>{member.name}</td>
                          <td>{member.email}</td>
                          <td>{member.role}</td>
                          <td>{fmtDate(member.joinedAt)}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
