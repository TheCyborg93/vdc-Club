import type { Permission } from "@/lib/access";

export type NavGroup =
  | "Übersicht"
  | "Verein"
  | "Sportbetrieb"
  | "Vorstandsarbeit"
  | "Finanzen"
  | "Partner"
  | "Administration";

export type NavItem = {
  href: string;
  label: string;
  short: string;
  group: NavGroup;
  permission?: Permission;
};

export const navigation: NavItem[] = [
  { href: "/", label: "Vereinszentrale", short: "VD", group: "Übersicht" },

  { href: "/verein", label: "Vereinsprofil", short: "VP", group: "Verein", permission: "members.read" },
  { href: "/mitglieder", label: "Mitglieder", short: "MI", group: "Verein", permission: "members.read" },
  { href: "/vorstand", label: "Vorstand & Funktionen", short: "VO", group: "Verein", permission: "members.read" },

  { href: "/mannschaften", label: "Mannschaften", short: "MA", group: "Sportbetrieb", permission: "teams.read" },
  { href: "/kalender", label: "Kalender", short: "KA", group: "Sportbetrieb", permission: "calendar.read" },
  { href: "/statistik", label: "Vereinsstatistik", short: "ST", group: "Sportbetrieb", permission: "statistics.read" },

  { href: "/aufgaben", label: "Aufgaben", short: "AU", group: "Vorstandsarbeit", permission: "tasks.read" },
  { href: "/sitzungen", label: "Sitzungen", short: "SI", group: "Vorstandsarbeit", permission: "meetings.read" },
  { href: "/beschluesse", label: "Beschlüsse", short: "BE", group: "Vorstandsarbeit", permission: "resolutions.read" },
  { href: "/dokumente", label: "Dokumente", short: "DO", group: "Vorstandsarbeit", permission: "documents.read" },

  { href: "/finanzen", label: "Finanzen & Beiträge", short: "FI", group: "Finanzen", permission: "finance.read" },

  { href: "/sponsoren", label: "Sponsoren", short: "SP", group: "Partner", permission: "sponsors.read" },

  { href: "/admin", label: "Admin-Übersicht", short: "AD", group: "Administration", permission: "settings.manage" },
  { href: "/admin/benutzer", label: "Benutzer & Rollen", short: "BR", group: "Administration", permission: "settings.manage" },
  { href: "/admin/integrationen", label: "Integrationen", short: "IN", group: "Administration", permission: "settings.manage" },
  { href: "/admin/status", label: "Systemstatus", short: "SY", group: "Administration", permission: "settings.manage" },
  { href: "/admin/audit", label: "Audit-Log", short: "AL", group: "Administration", permission: "settings.manage" },
];

export const groups: NavGroup[] = [
  "Übersicht",
  "Verein",
  "Sportbetrieb",
  "Vorstandsarbeit",
  "Finanzen",
  "Partner",
  "Administration",
];
