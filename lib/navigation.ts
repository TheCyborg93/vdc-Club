export type NavItem = {
  href: string;
  label: string;
  short: string;
  group: "Übersicht" | "Verein" | "Organisation" | "Finanzen" | "Auswertung" | "System";
};

export const navigation: NavItem[] = [
  { href: "/", label: "Dashboard", short: "DB", group: "Übersicht" },
  { href: "/mitglieder", label: "Mitglieder", short: "MI", group: "Verein" },
  { href: "/mannschaften", label: "Mannschaften", short: "MA", group: "Verein" },
  { href: "/vorstand", label: "Vorstand & Rollen", short: "VR", group: "Verein" },
  { href: "/aufgaben", label: "Aufgaben", short: "AU", group: "Organisation" },
  { href: "/kalender", label: "Kalender", short: "KA", group: "Organisation" },
  { href: "/sitzungen", label: "Sitzungen", short: "SI", group: "Organisation" },
  { href: "/beschluesse", label: "Beschlüsse", short: "BE", group: "Organisation" },
  { href: "/finanzen", label: "Finanzen", short: "FI", group: "Finanzen" },
  { href: "/dokumente", label: "Dokumente", short: "DO", group: "Organisation" },
  { href: "/statistik", label: "Vereinsstatistik", short: "ST", group: "Auswertung" },
  { href: "/einstellungen", label: "Einstellungen", short: "ES", group: "System" }
];

export const groups = ["Übersicht", "Verein", "Organisation", "Finanzen", "Auswertung", "System"] as const;
