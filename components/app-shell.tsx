"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ReactNode, useEffect, useMemo, useState } from "react";
import { logoutAction } from "@/app/auth/actions";
import { groups, navigation } from "@/lib/navigation";
import { hasPermission } from "@/lib/access";
import { primaryRoleLabel } from "@/lib/roles";
import { NavIcon } from "@/components/nav-icon";

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

function SearchIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="11" cy="11" r="6.5" />
      <path d="m16 16 4.5 4.5" />
    </svg>
  );
}

function BellIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M6.5 16.5h11l-1.2-2V10a4.3 4.3 0 0 0-8.6 0v4.5l-1.2 2Z" />
      <path d="M10 19h4" />
    </svg>
  );
}

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
  const [collapsed, setCollapsed] = useState(false);
  const [notificationsOpen,setNotificationsOpen] = useState(false);

  useEffect(()=>{
    setCollapsed(window.localStorage.getItem("vdc-sidebar-collapsed")==="1");
  },[]);

  useEffect(()=>{
    window.localStorage.setItem("vdc-sidebar-collapsed",collapsed ? "1" : "0");
  },[collapsed]);

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

  const primaryRole = primaryRoleLabel(user.roles);

  const currentItem = [...visibleNavigation]
    .sort((a, b) => b.href.length - a.href.length)
    .find((item) => item.href === "/" ? pathname === "/" : pathname.startsWith(item.href));

  const currentGroup=currentItem?.group ?? "Dashboard";

  function toggleNavigation() {
    if (window.matchMedia("(max-width: 920px)").matches) {
      setOpen((value)=>!value);
    } else {
      setCollapsed((value)=>!value);
    }
    setNotificationsOpen(false);
  }

  return (
    <div className={`app-shell ${collapsed ? "sidebar-collapsed" : ""}`}>
      <aside className={`sidebar ${open ? "is-open" : ""}`}>
        <Link href="/" className="brand" onClick={()=>setOpen(false)} aria-label="VDC Dashboard">
          <div className="brand-logo">
            <img src="/vdc-logo.svg" alt="" />
          </div>
          <div className="brand-copy">
            <strong>VDC</strong>
            <span>Vestischer Dart Club e.V.</span>
          </div>
        </Link>

        <div className="sidebar-identity">
          <span>Vereinszentrale</span>
          <strong>Saison 2026/27</strong>
        </div>

        <nav className="nav" aria-label="Hauptnavigation">
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
                      title={collapsed ? item.label : undefined}
                    >
                      <span className="nav-icon"><NavIcon href={item.href} /></span>
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
            <button type="submit" className="logout-button" title="Abmelden">
              <span className="logout-symbol">↪</span>
              <span className="logout-label">Abmelden</span>
            </button>
          </form>
        </div>
      </aside>

      <div className="content-shell">
        <header className="topbar">
          <div className="topbar-left">
            <button
              className="menu-button"
              onClick={toggleNavigation}
              aria-label={collapsed ? "Navigation ausklappen" : "Navigation einklappen"}
            >
              <span />
              <span />
              <span />
            </button>

            <div className="topbar-title">
              <span>{currentGroup}</span>
              <strong>{currentItem?.label ?? "Dashboard"}</strong>
            </div>
          </div>

          <div className="topbar-actions">
            <form action="/suche" method="get" className="topbar-search">
              <SearchIcon />
              <input
                name="q"
                placeholder="Mitglieder, Termine, Dokumente suchen …"
                aria-label="Globale Suche"
              />
              <button type="submit" aria-label="Suchen">Suchen</button>
            </form>

            <div className="topbar-popover-wrap">
              <button
                type="button"
                className={`notification-button ${notifications.unread ? "has-unread" : ""}`}
                onClick={() => {
                  setNotificationsOpen((value)=>!value);
                }}
                aria-label="Hinweise"
              >
                <BellIcon />
                {notifications.unread > 0 && (
                  <b>{notifications.unread > 99 ? "99+" : notifications.unread}</b>
                )}
              </button>

              {notificationsOpen && (
                <div className="topbar-popover notification-popover">
                  <div className="notification-popover-head">
                    <div>
                      <span className="popover-eyebrow">Persönlich</span>
                      <strong>Hinweise</strong>
                    </div>
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

                  <Link
                    href="/hinweise"
                    className="notification-popover-all"
                    onClick={()=>setNotificationsOpen(false)}
                  >
                    Alle Hinweise anzeigen
                  </Link>
                </div>
              )}
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
