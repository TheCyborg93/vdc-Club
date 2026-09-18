"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ReactNode, useState } from "react";
import { groups, navigation } from "@/lib/navigation";

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

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
            <div className="avatar">MB</div>
            <div><strong>Vorstand</strong><span>Administrator</span></div>
          </div>
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
