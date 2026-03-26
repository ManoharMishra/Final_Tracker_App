"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useUserContext } from "@/lib/context/user-context";
import styles from "./web.module.css";

type OrgRole = "OWNER" | "ADMIN" | "MEMBER";

const NAV_ITEMS: { href: string; label: string; minRole?: OrgRole }[] = [
  { href: "/threads", label: "Threads" },
  { href: "/my-work", label: "My Work" },
  { href: "/org/members", label: "Members" },
  { href: "/org/team-view", label: "Team View" },
  { href: "/org/teams", label: "Teams", minRole: "ADMIN" },
];

const ROLE_RANK: Record<OrgRole, number> = { MEMBER: 0, ADMIN: 1, OWNER: 2 };

function isActivePath(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

export default function WebSidebarNav() {
  const pathname = usePathname();
  const router = useRouter();
  const { clearSession, user_id } = useUserContext();
  const [role, setRole] = useState<OrgRole | null>(null);

  useEffect(() => {
    if (!user_id) return;
    fetch("/api/org/me")
      .then((r) => r.json())
      .then((json: { data?: { role: OrgRole } }) => {
        if (json.data?.role) setRole(json.data.role);
      })
      .catch(() => undefined);
  }, [user_id]);

  async function handleLogout() {
    await clearSession();
    router.replace("/login");
  }

  const visibleItems = NAV_ITEMS.filter((item) => {
    if (!item.minRole) return true;
    if (!role) return false;
    return ROLE_RANK[role] >= ROLE_RANK[item.minRole];
  });

  return (
    <nav className={styles.nav} aria-label="Primary">
      {visibleItems.map((item) => {
        const active = isActivePath(pathname, item.href);

        return (
          <Link
            key={item.href}
            href={item.href}
            className={active ? styles.navLinkActive : styles.navLink}
            aria-current={active ? "page" : undefined}
          >
            {item.label}
          </Link>
        );
      })}

      <button
        type="button"
        className={styles.navButton}
        onClick={handleLogout}
      >
        Logout
      </button>
    </nav>
  );
}