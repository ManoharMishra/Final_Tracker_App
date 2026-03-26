"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useUserContext } from "@/lib/context/user-context";
import styles from "./page.module.css";

type Role = "OWNER" | "ADMIN" | "MEMBER";
type ActorRole = Role;
type TeamOption = { id: string; name: string };

interface InviteForm {
  role: Role;
  teamId: string;
  maxUses: string;
  expiresAt: string;
}

function getErrorMessage(payload: unknown, fallback: string): string {
  if (payload && typeof payload === "object") {
    const error = "error" in payload ? payload.error : null;
    if (typeof error === "string") {
      return error;
    }
    if (error && typeof error === "object" && "message" in error && typeof error.message === "string") {
      return error.message;
    }
  }

  return fallback;
}

const EMPTY_INVITE: InviteForm = {
  role: "MEMBER",
  teamId: "",
  maxUses: "",
  expiresAt: "",
};

const ROLE_DESCRIPTIONS: Record<Role, string> = {
  OWNER:
    "Full control of the organization, including role management, member access, and organization settings.",
  ADMIN:
    "Can manage members and day-to-day workspace operations, but does not have owner-level control.",
  MEMBER:
    "Can collaborate on assigned work and discussions, without organization-wide management permissions.",
};

export default function InviteMemberPage() {
  const { initialized, user_id, org_id } = useUserContext();
  const [form, setForm] = useState<InviteForm>(EMPTY_INVITE);
  const [actorRole, setActorRole] = useState<ActorRole | null>(null);
  const [actorTeamIds, setActorTeamIds] = useState<string[]>([]);
  const [actorTeamNames, setActorTeamNames] = useState<string[]>([]);
  const [teamOptions, setTeamOptions] = useState<TeamOption[]>([]);
  const [roleLoading, setRoleLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [inviteLink, setInviteLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!initialized) return;

    let active = true;

    async function fetchActorRole() {
      setRoleLoading(true);
      try {
        const res = await fetch("/api/org/me", { cache: "no-store" });
        const json = await res.json();
        if (!res.ok) {
          throw new Error(getErrorMessage(json, "Failed to determine your role"));
        }
        const role = json?.data?.role;
        const teams = Array.isArray(json?.data?.teams)
          ? (json.data.teams as Array<{ id: string; name: string }>)
          : [];
        if (!active) return;
        if (role === "OWNER" || role === "ADMIN" || role === "MEMBER") {
          setActorRole(role);
          setActorTeamIds(teams.map((t) => t.id));
          setActorTeamNames(teams.map((t) => t.name));
          if (role !== "OWNER") {
            setTeamOptions(teams.map((t) => ({ id: t.id, name: t.name })));
          }
        } else {
          setActorRole(null);
          setError("Could not determine your role.");
        }
      } catch (err: unknown) {
        if (!active) return;
        setActorRole(null);
        setError(err instanceof Error ? err.message : "Failed to determine your role");
      } finally {
        if (active) setRoleLoading(false);
      }
    }

    void fetchActorRole();
    return () => {
      active = false;
    };
  }, [initialized]);

  useEffect(() => {
    if (!initialized || actorRole !== "OWNER") return;

    let active = true;
    async function fetchTeams() {
      try {
        const res = await fetch("/api/org/teams", { cache: "no-store" });
        const json = await res.json();
        if (!res.ok) {
          throw new Error(getErrorMessage(json, "Failed to load teams"));
        }
        const teams = Array.isArray(json?.data?.teams)
          ? (json.data.teams as Array<{ id: string; name: string }>)
          : [];
        if (!active) return;
        setTeamOptions(teams.map((t) => ({ id: t.id, name: t.name })));
      } catch {
        if (!active) return;
        setTeamOptions([]);
      }
    }

    void fetchTeams();
    return () => {
      active = false;
    };
  }, [initialized, actorRole]);

  const allowedRoles = useMemo<Role[]>(() => {
    if (actorRole === "OWNER") return ["OWNER", "ADMIN", "MEMBER"];
    if (actorRole === "ADMIN") return ["ADMIN", "MEMBER"];
    if (actorRole === "MEMBER") return ["MEMBER"];
    return [];
  }, [actorRole]);

  useEffect(() => {
    if (allowedRoles.length === 0) return;
    setForm((prev) => {
      const nextRole = allowedRoles.includes(prev.role) ? prev.role : allowedRoles[0];
      const nextTeamId =
        actorRole === "ADMIN" || actorRole === "MEMBER"
          ? (actorTeamIds[0] ?? "")
          : prev.teamId;

      if (nextRole === prev.role && nextTeamId === prev.teamId) {
        return prev;
      }

      return {
        ...prev,
        role: nextRole,
        teamId: nextTeamId,
      };
    });
  }, [allowedRoles, form.role, actorRole, actorTeamIds]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setCopied(false);
    setStatus(null);

    if (form.maxUses && (!Number.isInteger(Number(form.maxUses)) || Number(form.maxUses) <= 0)) {
      setError("Max uses must be a whole number greater than 0");
      return;
    }

    if (form.expiresAt) {
      const expiresAt = new Date(form.expiresAt);
      if (Number.isNaN(expiresAt.getTime())) {
        setError("Expiry date must be valid");
        return;
      }
      if (expiresAt.getTime() <= Date.now()) {
        setError("Expiry date must be in the future");
        return;
      }
    }

    if (!initialized) {
      setError("Session is still loading. Please wait a moment and try again.");
      return;
    }

    if (!user_id || !org_id) {
      setError("No active session found. Please log in again.");
      return;
    }

    if (!actorRole) {
      setError("Your role is still loading. Please wait and try again.");
      return;
    }

    if (!allowedRoles.includes(form.role)) {
      setError("You are not allowed to create invites for the selected role.");
      return;
    }

    if ((actorRole === "ADMIN" || actorRole === "MEMBER") && actorTeamIds.length === 0) {
      setError(`${actorRole} must belong to a team before creating invites.`);
      return;
    }

    if ((actorRole === "ADMIN" || actorRole === "MEMBER") && !form.teamId) {
      setError("Please select one of your teams.");
      return;
    }

    if ((actorRole === "ADMIN" || actorRole === "MEMBER") && !actorTeamIds.includes(form.teamId)) {
      setError("You can only create invites for your own teams.");
      return;
    }

    if (actorRole === "OWNER" && form.role === "ADMIN" && !form.teamId) {
      setError("Please select a team for the ADMIN invite.");
      return;
    }

    setSubmitting(true);
    setError(null);
    setInviteLink(null);

    const body: Record<string, unknown> = { role: form.role };
    if (actorRole === "ADMIN" || actorRole === "MEMBER") {
      body.teamId = form.teamId;
    } else if (actorRole === "OWNER" && form.teamId) {
      body.teamId = form.teamId;
    }
    if (form.maxUses) body.maxUses = parseInt(form.maxUses, 10);
    if (form.expiresAt) body.expiresAt = new Date(form.expiresAt).toISOString();

    try {
      const res = await fetch("/api/invite/create", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-user-id": user_id,
          "x-org-id": org_id,
        },
        body: JSON.stringify(body),
      });

      const json = await res.json();
      const payload = json.data ?? json;
      if (!res.ok) {
        throw new Error(getErrorMessage(json, "Failed to create invite"));
      }

      setInviteLink(payload.invite_link ?? payload.token ?? null);
      setStatus("Invite link generated. Share it with the person you want to add.");
      setForm(EMPTY_INVITE);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setSubmitting(false);
    }
  }

  async function copyInviteLink() {
    if (!inviteLink) return;

    try {
      await navigator.clipboard.writeText(inviteLink);
      setCopied(true);
      setStatus("Invite link copied to clipboard.");
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setError("Could not copy the invite link. Copy it manually instead.");
    }
  }

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <h1>Invite Member</h1>
        <Link href="/org/members" className={styles.backLink}>
          Back to Members
        </Link>
      </div>

      <div className={styles.card}>
        <p className={styles.intro}>
          Generate a shareable invite link for a new organization member. The invited person can open the link, create an account, and join with the selected role.
        </p>

        <form onSubmit={onSubmit} className={styles.form}>
          {error && (
            <div className={styles.error} role="alert" aria-live="assertive">
              {error}
            </div>
          )}

          {status && (
            <div className={styles.success} role="status" aria-live="polite">
              {status}
            </div>
          )}

          <label className={styles.label} htmlFor="role">
            Role
          </label>
          <select
            id="role"
            value={form.role}
            className={styles.input}
            aria-describedby="role-help"
            disabled={roleLoading || allowedRoles.length === 0}
            onChange={(e) => setForm((prev) => ({ ...prev, role: e.target.value as Role }))}
          >
            {allowedRoles.map((role) => (
              <option key={role} value={role}>
                {role === "OWNER" ? "Owner" : role === "ADMIN" ? "Admin" : "Member"}
              </option>
            ))}
          </select>
          <p id="role-help" className={styles.helpText}>
            Choose the role that will be assigned after the invite is accepted.
          </p>
          {actorRole && (
            <p className={styles.policyText}>
              {actorRole === "OWNER" && "Policy: OWNER can invite OWNER, ADMIN, or MEMBER."}
              {actorRole === "ADMIN" && "Policy: ADMIN can invite ADMIN or MEMBER (not OWNER), only within their own team."}
              {actorRole === "MEMBER" && "Policy: MEMBER can invite MEMBER only, and only within their own team."}
            </p>
          )}

          {(actorRole === "ADMIN" || actorRole === "MEMBER") && (
            <p className={styles.teamScopeText}>
              Team scope: <strong>{actorTeamNames.length > 0 ? actorTeamNames.join(", ") : "Not assigned"}</strong>
            </p>
          )}

          {(actorRole === "ADMIN" || actorRole === "MEMBER") && (
            <>
              <label className={styles.label} htmlFor="teamIdSelf">
                Team *
              </label>
              <select
                id="teamIdSelf"
                className={styles.input}
                value={form.teamId}
                onChange={(e) =>
                  setForm((prev) => ({
                    ...prev,
                    teamId: e.target.value,
                  }))
                }
              >
                <option value="">Select your team</option>
                {teamOptions.map((team) => (
                  <option key={team.id} value={team.id}>
                    {team.name}
                  </option>
                ))}
              </select>
            </>
          )}

          {actorRole === "OWNER" && (
            <>
              <label className={styles.label} htmlFor="teamId">
                Team {form.role === "ADMIN" ? "*" : "(optional)"}
              </label>
              <select
                id="teamId"
                className={styles.input}
                value={form.teamId}
                onChange={(e) =>
                  setForm((prev) => ({
                    ...prev,
                    teamId: e.target.value,
                  }))
                }
              >
                <option value="">Select team</option>
                {teamOptions.map((team) => (
                  <option key={team.id} value={team.id}>
                    {team.name}
                  </option>
                ))}
              </select>
              {form.role === "ADMIN" && (
                <p className={styles.helpText}>Admin invites require a team assignment.</p>
              )}
            </>
          )}

          <div className={styles.roleGuide} aria-live="polite">
            <p className={styles.roleGuideTitle}>Role permissions</p>
            <ul className={styles.roleList}>
              <li>
                <strong>Owner:</strong> {ROLE_DESCRIPTIONS.OWNER}
              </li>
              <li>
                <strong>Admin:</strong> {ROLE_DESCRIPTIONS.ADMIN}
              </li>
              <li>
                <strong>Member:</strong> {ROLE_DESCRIPTIONS.MEMBER}
              </li>
            </ul>
            <p className={styles.selectedRoleText}>
              Selected role: <strong>{form.role}</strong> - {ROLE_DESCRIPTIONS[form.role]}
            </p>
          </div>

          <label className={styles.label} htmlFor="maxUses">
            Max uses (optional)
          </label>
          <input
            id="maxUses"
            type="number"
            min="1"
            placeholder="Unlimited"
            className={styles.input}
            value={form.maxUses}
            aria-describedby="max-uses-help"
            onChange={(e) => setForm((prev) => ({ ...prev, maxUses: e.target.value }))}
          />
          <p id="max-uses-help" className={styles.helpText}>
            Leave empty if the invite link should keep working until it expires or is disabled.
          </p>

          <label className={styles.label} htmlFor="expiresAt">
            Expiry date (optional)
          </label>
          <input
            id="expiresAt"
            type="datetime-local"
            className={styles.input}
            value={form.expiresAt}
            aria-describedby="expiry-help"
            onChange={(e) => setForm((prev) => ({ ...prev, expiresAt: e.target.value }))}
          />
          <p id="expiry-help" className={styles.helpText}>
            Leave empty if the invite should not expire automatically.
          </p>

          <button
            type="submit"
            className={styles.primaryBtn}
            disabled={submitting || roleLoading || allowedRoles.length === 0}
          >
            {submitting ? "Generating..." : "Generate Invite Link"}
          </button>

          {!initialized && (
            <p className={styles.helpText}>Checking your session...</p>
          )}
        </form>

        {inviteLink && (
          <section className={styles.result} aria-labelledby="generated-invite-title">
            <h2 id="generated-invite-title" className={styles.resultTitle}>
              Generated Invite Link
            </h2>
            <p className={styles.resultLabel}>
              Share this link with the new member.
            </p>
            <a
              href={inviteLink}
              target="_blank"
              rel="noreferrer"
              className={styles.linkText}
            >
              {inviteLink}
            </a>
            <div className={styles.resultActions}>
              <button type="button" className={styles.secondaryBtn} onClick={copyInviteLink}>
                {copied ? "Copied" : "Copy link"}
              </button>
              <a
                href={inviteLink}
                target="_blank"
                rel="noreferrer"
                className={styles.linkButton}
              >
                Open link
              </a>
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
