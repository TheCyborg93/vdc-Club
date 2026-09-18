import type { Permission } from "@/lib/access";

export type NavItem = {
  href: string;
  label: string;
  short: string;
  group: "Übersicht" | "Verein" | "Organisation" | "Finanzen" | "Auswertung" | "System";
  permission?: Permission;
};

export const navigation: NavItem[] = [
  { href: "/", label: "Dashboard", short: "DB", group: "Übersicht" },
  { href: "/mitglieder", label: "Mitglieder", short: "MI", group: "Verein", permission: "members.read" },
  { href: "/mannschaften", label: "Mannschaften", short: "MA", group: "Verein", permission: "teams.read" },
  { href: "/vorstand", label: "Vorstand & Rollen", short: "VR", group: "Verein", permission: "members.read" },
  { href: "/aufgaben", label: "Aufgaben", short: "AU", group: "Organisation", permission: "tasks.read" },
  { href: "/kalender", label: "Kalender", short: "KA", group: "Organisation", permission: "tasks.read" },
  { href: "/sitzungen", label: "Sitzungen", short: "SI", group: "Organisation", permission: "meetings.read" },
  { href: "/beschluesse", label: "Beschlüsse", short: "BE", group: "Organisation", permission: "resolutions.read" },
  { href: "/finanzen", label: "Finanzen", short: "FI", group: "Finanzen", permission: "finance.read" },
  { href: "/dokumente", label: "Dokumente", short: "DO", group: "Organisation", permission: "documents.read" },
  { href: "/statistik", label: "Vereinsstatistik", short: "ST", group: "Auswertung", permission: "statistics.read" },
  { href: "/einstellungen", label: "Einstellungen", short: "ES", group: "System", permission: "settings.manage" },
];

export const groups = ["Übersicht", "Verein", "Organisation", "Finanzen", "Auswertung", "System"] as const;
