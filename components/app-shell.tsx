"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ReactNode, useMemo, useState } from "react";
import { logoutAction } from "@/app/auth/actions";
import { groups, navigation } from "@/lib/navigation";
import { hasPermission } from "@/lib/access";

type ShellUser = {
  displayName: string;
  email: string;
  roles: string[];
};

const roleLabels: Record<string, string> = {
  admin: "Administrator",
  board: "Vorstand",
  chair: "1. Vorsitz",
  vice_chair: "2. Vorsitz",
  treasurer: "Kassierer",
  secretary: "Schriftführer",
  sport_director: "Sportwart",
  team_captain: "Team Captain",
  tournament_director: "Turnierleitung",
};

export function AppShell({
  children,
  user,
}: {
  children: ReactNode;
  user: ShellUser;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  const initials = useMemo(() => {
    return user.displayName
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase())
      .join("") || "VD";
  }, [user.displayName]);

  const visibleNavigation = navigation.filter(
    (item) => !item.permission || hasPermission(user.roles, item.permission),
  );

  const primaryRole = user.roles.includes("admin")
    ? "Administrator"
    : roleLabels[user.roles[0] ?? ""] ?? "Vereinszugang";

  const currentItem = [...visibleNavigation]
    .sort((a, b) => b.href.length - a.href.length)
    .find((item) => item.href === "/" ? pathname === "/" : pathname.startsWith(item.href));

  return (
    <div className="app-shell">
      <aside className={`sidebar ${open ? "is-open" : ""}`}>
        <div className="brand">
          <div className="brand-mark" aria-hidden="true">
            <span>VDC</span>
            <i />
          </div>
          <div className="brand-copy">
            <strong>Vestischer Dart Club</strong>
            <span>e.V. · Club Office</span>
          </div>
        </div>

        <div className="sidebar-identity">
          <span>Vereinszentrale</span>
          <strong>Saison 2026/27</strong>
        </div>

        <nav className="nav">
          {groups.map((group) => {
            const items = visibleNavigation.filter((item) => item.group === group);
            if (!items.length) return null;

            return (
              <div className="nav-group" key={group}>
                <div className="nav-group-title">
                  <span>{group}</span>
                  <i />
                </div>

                {items.map((item) => {
                  const active = item.href === "/"
                    ? pathname === "/"
                    : pathname.startsWith(item.href);

                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      className={`nav-item ${active ? "active" : ""}`}
                      onClick={() => setOpen(false)}
                    >
                      <span className="nav-icon">{item.short}</span>
                      <span className="nav-label">{item.label}</span>
                      <span className="nav-chevron">›</span>
                    </Link>
                  );
                })}
              </div>
            );
          })}
        </nav>

        <div className="sidebar-footer">
          <div className="user-row">
            <div className="avatar">{initials}</div>
            <div className="user-meta">
              <strong>{user.displayName}</strong>
              <span>{primaryRole}</span>
            </div>
          </div>

          <form action={logoutAction}>
            <button type="submit" className="logout-button">Abmelden</button>
          </form>

          <div className="club-signature">VDC · MARL · 2026/27</div>
        </div>
      </aside>

      <div className="content-shell">
        <header className="topbar">
          <div className="topbar-left">
            <button
              className="menu-button"
              onClick={() => setOpen((value) => !value)}
              aria-label="Navigation öffnen"
            >
              <span />
              <span />
              <span />
            </button>

            <div className="topbar-title">
              <span className="eyebrow">VDC // CLUB OFFICE</span>
              <strong>{currentItem?.label ?? "Vereinszentrale"}</strong>
            </div>
          </div>

          <div className="topbar-actions">
            <div className="system-live"><i /> LIVE</div>
            <div className="topbar-user">
              <div className="avatar avatar-small">{initials}</div>
              <div>
                <strong>{user.displayName}</strong>
                <span>{primaryRole}</span>
              </div>
            </div>
          </div>
        </header>

        <main className="page-content">{children}</main>

        <nav className="mobile-nav">
          {visibleNavigation.slice(0, 5).map((item) => {
            const active = item.href === "/"
              ? pathname === "/"
              : pathname.startsWith(item.href);

            return (
              <Link key={item.href} href={item.href} className={active ? "active" : ""}>
                <span>{item.short}</span>
                <small>{item.label}</small>
              </Link>
            );
          })}
        </nav>
      </div>

      {open && (
        <button
          className="sidebar-backdrop"
          onClick={() => setOpen(false)}
          aria-label="Navigation schließen"
        />
      )}
    </div>
  );
}
