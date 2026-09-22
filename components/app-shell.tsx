"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import {
  Activity,
  Archive,
  Bell,
  BookOpen,
  Building2,
  CalendarDays,
  ChartNoAxesCombined,
  ChevronRight,
  ClipboardList,
  DatabaseZap,
  FileText,
  Files,
  Handshake,
  History,
  LayoutDashboard,
  ListChecks,
  LogOut,
  Menu,
  Plug,
  Presentation,
  Search,
  Settings,
  ShieldCheck,
  Target,
  Trash2,
  UserCog,
  Users,
  UsersRound,
  WalletCards,
  X,
  type LucideIcon,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { css } from "styled-system/css";
import { logoutAction } from "@/app/auth/actions";
import { groups, navigation } from "@/lib/navigation";
import { hasPermission } from "@/lib/access";
import { primaryRoleLabel } from "@/lib/roles";

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

const shell = css({
  minH: "100dvh",
  background: "bg",
  color: "fg",
});

const sidebar = css({
  position: "fixed",
  inset: "0 auto 0 0",
  zIndex: "overlay",
  display: "flex",
  w: "[300px]",
  flexDirection: "column",
  borderRight: "1px solid",
  borderColor: "surface.border",
  background: "surface.bg",
  boxShadow: "lg",
  transform: "translateX(-100%)",
  transitionDuration: "normal",
  transitionProperty: "width, transform",
  transitionTimingFunction: "standard",
  lg: {
    w: "[252px]",
    transform: "translateX(0)",
    boxShadow: "none",
  },
});

const sidebarOpen = css({
  transform: "translateX(0)",
});

const sidebarCollapsed = css({
  lg: { w: "[76px]" },
  "& [data-shell-label]": { lg: { display: "none" } },
  "& [data-shell-brand-copy]": { lg: { display: "none" } },
  "& [data-shell-group-title]": { lg: { visibility: "hidden", h: "4" } },
  "& [data-shell-nav-item]": { lg: { justifyContent: "center", px: "2" } },
  "& [data-shell-user-meta]": { lg: { display: "none" } },
});

const brand = css({
  display: "flex",
  alignItems: "center",
  gap: "3",
  minH: "[74px]",
  px: "4",
  borderBottom: "1px solid",
  borderColor: "surface.border",
});

const logoWrap = css({
  display: "grid",
  flexShrink: 0,
  placeItems: "center",
  w: "10",
  h: "10",
});

const brandCopy = css({
  minW: "0",
  "& strong": { display: "block", fontSize: "sm", fontWeight: "950", letterSpacing: "-0.02em" },
  "& span": { display: "block", mt: "0.5", color: "fg.muted", fontSize: "xs", whiteSpace: "nowrap" },
});

const nav = css({
  flex: "1",
  overflowY: "auto",
  p: "3",
});

const navGroup = css({ mb: "4" });
const navGroupTitle = css({
  px: "2",
  pb: "1.5",
  color: "fg.subtle",
  fontSize: "[10px]",
  fontWeight: "900",
  letterSpacing: "0.13em",
  textTransform: "uppercase",
});

const navItem = css({
  display: "flex",
  alignItems: "center",
  gap: "2.5",
  minH: "10",
  my: "0.5",
  px: "2.5",
  borderRadius: "l2",
  border: "1px solid transparent",
  color: "fg.muted",
  fontSize: "sm",
  fontWeight: "700",
  transitionDuration: "fast",
  transitionProperty: "background, border-color, color, transform",
  _hover: {
    background: "surface.raised",
    borderColor: "surface.border",
    color: "fg",
    transform: "translateX(1px)",
  },
});

const navItemActive = css({
  background: "brand.subtle",
  borderColor: "brand.border",
  color: "fg",
  boxShadow: "inset 3px 0 {colors.vdcRed}",
});

const navIcon = css({
  display: "grid",
  flexShrink: 0,
  placeItems: "center",
  w: "8",
  h: "8",
  borderRadius: "l1",
  color: "fg.muted",
});

const navIconActive = css({ color: "brand.hover" });
const navLabel = css({ flex: "1", minW: "0" });
const navChevron = css({ flexShrink: 0, color: "fg.subtle" });

const sidebarFooter = css({
  mt: "auto",
  p: "3",
  borderTop: "1px solid",
  borderColor: "surface.border",
});

const userRow = css({ display: "flex", alignItems: "center", gap: "2.5", minW: "0" });
const avatar = css({
  display: "grid",
  flexShrink: 0,
  placeItems: "center",
  w: "9",
  h: "9",
  borderRadius: "pill",
  background: "brand.subtle",
  border: "1px solid",
  borderColor: "brand.border",
  color: "brand.hover",
  fontSize: "xs",
  fontWeight: "950",
});

const userMeta = css({
  minW: "0",
  "& strong": { display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: "xs" },
  "& span": { display: "block", mt: "0.5", color: "fg.muted", fontSize: "[10px]" },
});

const logoutButton = css({
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  gap: "2",
  w: "full",
  mt: "3",
  h: "9",
  border: "1px solid",
  borderColor: "surface.border",
  borderRadius: "l1",
  background: "surface.raised",
  color: "fg.muted",
  fontSize: "xs",
  fontWeight: "800",
  cursor: "pointer",
  _hover: { borderColor: "brand.border", color: "fg" },
});

const contentShell = css({
  minH: "100dvh",
  transitionDuration: "normal",
  transitionProperty: "margin-left",
  lg: { ml: "[252px]" },
});
const contentShellCollapsed = css({ lg: { ml: "[76px]" } });

const topbar = css({
  position: "sticky",
  top: "0",
  zIndex: "sticky",
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  h: "[64px]",
  px: { base: "3", md: "5" },
  borderBottom: "1px solid",
  borderColor: "surface.border",
  background: "rgba(14,14,16,.88)",
  backdropFilter: "blur(18px)",
});

const topbarLeft = css({ display: "flex", alignItems: "center", gap: "3", minW: "0" });
const iconButton = css({
  display: "grid",
  placeItems: "center",
  flexShrink: 0,
  w: "9",
  h: "9",
  border: "1px solid",
  borderColor: "surface.border",
  borderRadius: "l1",
  background: "surface.raised",
  color: "fg.muted",
  cursor: "pointer",
  _hover: { borderColor: "brand.border", color: "fg" },
  _focusVisible: { outline: "none", boxShadow: "focus" },
});

const titleBlock = css({
  minW: "0",
  "& span": {
    display: "block",
    color: "brand.hover",
    fontSize: "[9px]",
    fontWeight: "900",
    letterSpacing: "0.11em",
    textTransform: "uppercase",
  },
  "& strong": {
    display: "block",
    overflow: "hidden",
    mt: "0.5",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    fontSize: { base: "sm", md: "md" },
    fontWeight: "900",
  },
});

const topbarActions = css({ display: "flex", alignItems: "center", gap: "2" });
const searchForm = css({
  display: { base: "none", md: "flex" },
  alignItems: "center",
  w: "[min(32vw,360px)]",
  h: "9",
  px: "3",
  border: "1px solid",
  borderColor: "surface.border",
  borderRadius: "l1",
  background: "surface.bg",
  color: "fg.muted",
  _focusWithin: { borderColor: "brand.border", boxShadow: "focus" },
  "& input": {
    flex: "1",
    minW: "0",
    ml: "2",
    border: "0",
    outline: "0",
    background: "transparent",
    color: "fg",
    fontSize: "xs",
  },
  "& input::placeholder": { color: "fg.subtle" },
  "& button": { display: "none" },
});

const notificationWrap = css({ position: "relative" });
const unreadDot = css({
  position: "absolute",
  top: "-1",
  right: "-1",
  display: "grid",
  placeItems: "center",
  minW: "4",
  h: "4",
  px: "1",
  borderRadius: "pill",
  background: "brand.solid",
  color: "warmWhite",
  fontSize: "[8px]",
  fontWeight: "950",
});

const notificationPanel = css({
  position: "absolute",
  top: "calc(100% + 8px)",
  right: "0",
  w: { base: "[min(92vw,380px)]", md: "[380px]" },
  overflow: "hidden",
  border: "1px solid",
  borderColor: "surface.border",
  borderRadius: "l3",
  background: "surface.raised",
  boxShadow: "lg",
});

const notificationHead = css({
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  p: "3.5",
  borderBottom: "1px solid",
  borderColor: "surface.border",
  "& span": { display: "block", color: "fg.muted", fontSize: "[9px]", textTransform: "uppercase", letterSpacing: "0.1em" },
  "& strong": { display: "block", mt: "0.5", fontSize: "sm" },
  "& b": { color: "brand.hover", fontSize: "sm" },
});

const notificationList = css({ display: "grid", maxH: "[420px]", overflowY: "auto" });
const notificationRow = css({
  display: "grid",
  gridTemplateColumns: "6px minmax(0,1fr)",
  gap: "2.5",
  p: "3",
  borderBottom: "1px solid",
  borderColor: "surface.border",
  _hover: { background: "surface.hover" },
  "& i": { w: "1.5", h: "1.5", mt: "1.5", borderRadius: "pill", background: "status.info" },
  "& strong": { display: "block", fontSize: "xs" },
  "& span": { display: "block", mt: "1", color: "fg.muted", fontSize: "[10px]", lineHeight: "1.45" },
});
const notificationCritical = css({ "& i": { background: "status.danger" } });
const notificationWarning = css({ "& i": { background: "status.warning" } });
const notificationEmpty = css({ p: "4", color: "fg.muted", fontSize: "xs" });
const notificationAll = css({
  display: "block",
  p: "3",
  color: "brand.hover",
  textAlign: "center",
  fontSize: "xs",
  fontWeight: "850",
  _hover: { background: "brand.subtle" },
});

const pageContent = css({
  w: "full",
  maxW: "[1540px]",
  mx: "auto",
  p: { base: "3", md: "5", xl: "6" },
});

const backdrop = css({
  position: "fixed",
  inset: "0",
  zIndex: "sticky",
  display: { base: "block", lg: "none" },
  border: "0",
  background: "rgba(0,0,0,.68)",
  backdropFilter: "blur(2px)",
});

const closeMobile = css({
  position: "absolute",
  top: "3",
  right: "3",
  display: { base: "grid", lg: "none" },
});

const iconMap: Array<[string, LucideIcon]> = [
  ["/admin/integrationen", Plug],
  ["/admin/benutzer", UserCog],
  ["/admin/status", Activity],
  ["/admin/audit", FileText],
  ["/admin/daten", DatabaseZap],
  ["/admin/papierkorb", Trash2],
  ["/admin", Settings],
  ["/vereinschronik", History],
  ["/mannschaften", UsersRound],
  ["/mitglieder", Users],
  ["/vorstand", ShieldCheck],
  ["/sponsoren", Handshake],
  ["/finanzen", WalletCards],
  ["/training", Target],
  ["/kalender", CalendarDays],
  ["/statistik", ChartNoAxesCombined],
  ["/aufgaben", ListChecks],
  ["/sitzungen", Presentation],
  ["/beschluesse", BookOpen],
  ["/umfragen", ClipboardList],
  ["/dokumente", Files],
  ["/archiv", Archive],
  ["/verein", Building2],
  ["/anleitung", BookOpen],
  ["/", LayoutDashboard],
];

function iconFor(href: string) {
  return iconMap.find(([prefix]) => prefix === "/" ? href === "/" : href.startsWith(prefix))?.[1] ?? FileText;
}

export function AppShell({
  children,
  user,
  notifications,
}: {
  children: React.ReactNode;
  user: ShellUser;
  notifications: { items: ShellNotification[]; unread: number };
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);

  useEffect(() => {
    setCollapsed(window.localStorage.getItem("vdc-sidebar-collapsed") === "1");
  }, []);

  useEffect(() => {
    window.localStorage.setItem("vdc-sidebar-collapsed", collapsed ? "1" : "0");
  }, [collapsed]);

  useEffect(() => {
    setOpen(false);
    setNotificationsOpen(false);
  }, [pathname]);

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
  const currentGroup = currentItem?.group ?? "Dashboard";

  function toggleNavigation() {
    if (window.matchMedia("(max-width: 1023px)").matches) {
      setOpen((value) => !value);
    } else {
      setCollapsed((value) => !value);
    }
    setNotificationsOpen(false);
  }

  return (
    <div className={shell}>
      <aside className={[sidebar, open ? sidebarOpen : "", collapsed ? sidebarCollapsed : ""].filter(Boolean).join(" ")}>
        <Link href="/" className={brand} aria-label="VDC Dashboard">
          <span className={logoWrap}>
            <Image src="/vdc-logo.svg" alt="" width={40} height={40} priority />
          </span>
          <span className={brandCopy} data-shell-brand-copy>
            <strong>VDC Club</strong>
            <span>Vestischer Dart Club e.V.</span>
          </span>
        </Link>

        <button className={[iconButton, closeMobile].join(" ")} onClick={() => setOpen(false)} aria-label="Navigation schließen">
          <X size={17} />
        </button>

        <nav className={nav} aria-label="Hauptnavigation">
          {groups.map((group) => {
            const items = visibleNavigation.filter((item) => item.group === group);
            if (!items.length) return null;
            return (
              <div className={navGroup} key={group}>
                <div className={navGroupTitle} data-shell-group-title>{group}</div>
                {items.map((item) => {
                  const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
                  const Icon = iconFor(item.href);
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      data-shell-nav-item
                      className={[navItem, active ? navItemActive : ""].filter(Boolean).join(" ")}
                      title={collapsed ? item.label : undefined}
                    >
                      <span className={[navIcon, active ? navIconActive : ""].filter(Boolean).join(" ")}>
                        <Icon size={17} strokeWidth={1.8} />
                      </span>
                      <span className={navLabel} data-shell-label>{item.label}</span>
                      <ChevronRight className={navChevron} data-shell-label size={15} />
                    </Link>
                  );
                })}
              </div>
            );
          })}
        </nav>

        <div className={sidebarFooter}>
          <div className={userRow}>
            <div className={avatar}>{initials}</div>
            <div className={userMeta} data-shell-user-meta>
              <strong>{user.displayName}</strong>
              <span>{primaryRole}</span>
            </div>
          </div>
          <form action={logoutAction}>
            <button type="submit" className={logoutButton}>
              <LogOut size={15} />
              <span data-shell-label>Abmelden</span>
            </button>
          </form>
        </div>
      </aside>

      <div className={[contentShell, collapsed ? contentShellCollapsed : ""].filter(Boolean).join(" ")}>
        <header className={topbar}>
          <div className={topbarLeft}>
            <button className={iconButton} onClick={toggleNavigation} aria-label="Navigation umschalten">
              <Menu size={18} />
            </button>
            <div className={titleBlock}>
              <span>{currentGroup}</span>
              <strong>{currentItem?.label ?? "Dashboard"}</strong>
            </div>
          </div>

          <div className={topbarActions}>
            <form action="/suche" method="get" className={searchForm}>
              <Search size={15} />
              <input name="q" placeholder="Mitglieder, Termine, Dokumente …" aria-label="Globale Suche" />
              <button type="submit">Suchen</button>
            </form>

            <div className={notificationWrap}>
              <button
                className={iconButton}
                type="button"
                onClick={() => setNotificationsOpen((value) => !value)}
                aria-label="Hinweise"
                aria-expanded={notificationsOpen}
              >
                <Bell size={17} />
                {notifications.unread > 0 && (
                  <b className={unreadDot}>{notifications.unread > 99 ? "99+" : notifications.unread}</b>
                )}
              </button>

              <AnimatePresence>
                {notificationsOpen && (
                  <motion.div
                    className={notificationPanel}
                    initial={{ opacity: 0, y: -6, scale: 0.98 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: -4, scale: 0.985 }}
                    transition={{ duration: 0.16 }}
                  >
                    <div className={notificationHead}>
                      <div><span>Persönlich</span><strong>Hinweise</strong></div>
                      <b>{notifications.unread}</b>
                    </div>
                    <div className={notificationList}>
                      {notifications.items.length === 0 ? (
                        <span className={notificationEmpty}>Keine offenen Hinweise.</span>
                      ) : notifications.items.map((item) => (
                        <Link
                          href={item.href}
                          key={item.key}
                          className={[
                            notificationRow,
                            item.severity === "critical" ? notificationCritical : "",
                            item.severity === "warning" ? notificationWarning : "",
                          ].filter(Boolean).join(" ")}
                        >
                          <i />
                          <div>
                            <strong>{item.title}</strong>
                            <span>{item.detail}</span>
                          </div>
                        </Link>
                      ))}
                    </div>
                    <Link href="/hinweise" className={notificationAll}>Alle Hinweise anzeigen</Link>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
        </header>

        <main className={pageContent}>{children}</main>
      </div>

      {open && <button className={backdrop} onClick={() => setOpen(false)} aria-label="Navigation schließen" />}
    </div>
  );
}
