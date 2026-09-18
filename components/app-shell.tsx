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
  memberId: string | null;
};

type ShellNotification = {
  key: string;
  title: string;
  detail: string;
  href: string;
  severity: "critical" | "warning" | "info";
  read: boolean;
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
  notifications,
}: {
  children: ReactNode;
  user: ShellUser;
  notifications: { items: ShellNotification[]; unread: number };
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [notificationsOpen,setNotificationsOpen] = useState(false);
  const [quickOpen,setQuickOpen] = useState(false);

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

  const quickActions = [
    hasPermission(user.roles,"members.write") ? { href:"/mitglieder", label:"Mitglied" } : null,
    hasPermission(user.roles,"tasks.write") ? { href:"/aufgaben", label:"Aufgabe" } : null,
    hasPermission(user.roles,"meetings.write") ? { href:"/sitzungen", label:"Sitzung" } : null,
    hasPermission(user.roles,"documents.write") ? { href:"/dokumente", label:"Dokument" } : null,
    hasPermission(user.roles,"calendar.write") ? { href:"/kalender", label:"Termin" } : null,
  ].filter((item): item is { href:string; label:string } => Boolean(item));

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
            <form action="/suche" method="get" className="topbar-search">
              <input name="q" placeholder="Suchen …" aria-label="Globale Suche" />
              <button type="submit" aria-label="Suchen">⌕</button>
            </form>

            {quickActions.length > 0 && (
              <div className="topbar-popover-wrap">
                <button
                  type="button"
                  className="quick-action-button"
                  onClick={() => {
                    setQuickOpen((value)=>!value);
                    setNotificationsOpen(false);
                  }}
                >
                  + Neu
                </button>
                {quickOpen && (
                  <div className="topbar-popover quick-actions-popover">
                    <span className="popover-eyebrow">Schnell anlegen</span>
                    {quickActions.map((item)=>(
                      <Link key={item.label} href={item.href} onClick={()=>setQuickOpen(false)}>
                        <strong>{item.label}</strong><span>›</span>
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            )}

            <div className="topbar-popover-wrap">
              <button
                type="button"
                className={`notification-button ${notifications.unread ? "has-unread" : ""}`}
                onClick={() => {
                  setNotificationsOpen((value)=>!value);
                  setQuickOpen(false);
                }}
                aria-label="Hinweise"
              >
                <span>!</span>
                {notifications.unread > 0 && <b>{notifications.unread > 99 ? "99+" : notifications.unread}</b>}
              </button>

              {notificationsOpen && (
                <div className="topbar-popover notification-popover">
                  <div className="notification-popover-head">
                    <div><span className="popover-eyebrow">Persönlich</span><strong>Hinweise</strong></div>
                    <b>{notifications.unread}</b>
                  </div>

                  <div className="notification-popover-list">
                    {notifications.items.length===0 ? (
                      <span className="notification-popover-empty">Keine offenen Hinweise.</span>
                    ) : notifications.items.map((item)=>(
                      <Link
                        href={item.href}
                        className={`notification-popover-row notification-${item.severity} ${item.read ? "is-read" : ""}`}
                        key={item.key}
                        onClick={()=>setNotificationsOpen(false)}
                      >
                        <i />
                        <div>
                          <strong>{item.title}</strong>
                          <span>{item.detail}</span>
                        </div>
                      </Link>
                    ))}
                  </div>

                  <Link href="/hinweise" className="notification-popover-all" onClick={()=>setNotificationsOpen(false)}>
                    Alle Hinweise anzeigen
                  </Link>
                </div>
              )}
            </div>

            {user.roles.includes("admin") && (
              <Link href="/admin" className="admin-topbar-link">ADMIN</Link>
            )}
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
