import type { Permission } from "@/lib/access";

export type NavGroup =
  | "Dashboard"
  | "Verein"
  | "Teams & Training"
  | "Organisation"
  | "Admin";

export type NavItem = {
  href: string;
  label: string;
  short: string;
  group: NavGroup;
  permission?: Permission;
};

export const navigation: NavItem[] = [
  { href: "/", label: "Dashboard", short: "DB", group: "Dashboard" },
  { href: "/anleitung", label: "Anleitung", short: "AN", group: "Dashboard" },

  { href: "/verein", label: "Vereinsprofil", short: "VP", group: "Verein", permission: "members.read" },
  { href: "/mitglieder", label: "Mitglieder", short: "MI", group: "Verein", permission: "members.read" },
  { href: "/vorstand", label: "Vorstand", short: "VO", group: "Verein", permission: "members.read" },
  { href: "/sponsoren", label: "Sponsoren", short: "SP", group: "Verein", permission: "sponsors.read" },
  { href: "/finanzen", label: "Finanzen", short: "FI", group: "Verein", permission: "finance.read" },

  { href: "/mannschaften", label: "Mannschaften", short: "MA", group: "Teams & Training", permission: "teams.read" },
  { href: "/training", label: "Training", short: "TR", group: "Teams & Training", permission: "training.read" },
  { href: "/kalender", label: "Termine", short: "KA", group: "Teams & Training", permission: "calendar.read" },
  { href: "/statistik", label: "Statistiken", short: "ST", group: "Teams & Training", permission: "statistics.read" },

  { href: "/aufgaben", label: "Aufgaben", short: "AU", group: "Organisation", permission: "tasks.read" },
  { href: "/sitzungen", label: "Sitzungen", short: "SI", group: "Organisation", permission: "meetings.read" },
  { href: "/beschluesse", label: "Beschlüsse", short: "BE", group: "Organisation", permission: "resolutions.read" },
  { href: "/dokumente", label: "Dokumente", short: "DO", group: "Organisation", permission: "documents.read" },
  { href: "/archiv", label: "Archiv", short: "AR", group: "Organisation", permission: "documents.read" },

  { href: "/admin", label: "Übersicht", short: "AD", group: "Admin", permission: "settings.manage" },
  { href: "/admin/benutzer", label: "Benutzer & Rollen", short: "BR", group: "Admin", permission: "settings.manage" },
  { href: "/admin/integrationen", label: "Integrationen", short: "IN", group: "Admin", permission: "settings.manage" },
  { href: "/admin/status", label: "Systemstatus", short: "SY", group: "Admin", permission: "settings.manage" },
  { href: "/admin/audit", label: "Audit-Log", short: "AL", group: "Admin", permission: "settings.manage" },
  { href: "/admin/daten", label: "Daten & Qualität", short: "DQ", group: "Admin", permission: "settings.manage" },
  { href: "/admin/papierkorb", label: "Papierkorb", short: "PK", group: "Admin", permission: "settings.manage" },
];

export const groups: NavGroup[] = [
  "Dashboard",
  "Verein",
  "Teams & Training",
  "Organisation",
  "Admin",
];
