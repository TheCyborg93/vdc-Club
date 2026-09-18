"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ReactNode, useMemo, useState } from "react";
import { logoutAction } from "@/app/auth/actions";
import { groups, navigation } from "@/lib/navigation";

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

  const primaryRole = user.roles.includes("admin")
    ? "Administrator"
    : roleLabels[user.roles[0] ?? ""] ?? "Vereinszugang";

  return (
    <div className="app-shell">
      <aside className={`sidebar ${open ? "is-open" : ""}`}>
        <div className="brand">
          <div className="brand-mark">VDC</div>
          <div>
            <strong>VDC Club</strong>
            <span>Vorstandsportal</span>
          </div>
        </div>

        <nav className="nav">
          {groups.map((group) => {
            const items = navigation.filter((item) => item.group === group);
            if (!items.length) return null;
            return (
              <div className="nav-group" key={group}>
                <div className="nav-group-title">{group}</div>
                {items.map((item) => {
                  const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      className={`nav-item ${active ? "active" : ""}`}
                      onClick={() => setOpen(false)}
                    >
                      <span className="nav-icon">{item.short}</span>
                      <span>{item.label}</span>
                    </Link>
                  );
                })}
              </div>
            );
          })}
        </nav>

        <div className="sidebar-footer">
          <div className="season-chip">Saison 2026/27</div>
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
        </div>
      </aside>

      <div className="content-shell">
        <header className="topbar">
          <button className="menu-button" onClick={() => setOpen((value) => !value)} aria-label="Navigation öffnen">
            ☰
          </button>
          <div>
            <span className="eyebrow">Vestischer Darts Club</span>
            <strong>Vereinszentrale</strong>
          </div>
          <div className="topbar-actions">
            <button className="ghost-button">Suche</button>
            <button className="primary-button">+ Neu</button>
          </div>
        </header>

        <main className="page-content">{children}</main>

        <nav className="mobile-nav">
          {navigation.slice(0, 5).map((item) => {
            const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
            return (
              <Link key={item.href} href={item.href} className={active ? "active" : ""}>
                <span>{item.short}</span>
                <small>{item.label}</small>
              </Link>
            );
          })}
        </nav>
      </div>

      {open && <button className="sidebar-backdrop" onClick={() => setOpen(false)} aria-label="Navigation schließen" />}
    </div>
  );
}
