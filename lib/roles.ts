export const officialRoleDefinitions = [
  {
    key: "chair",
    label: "1. Vorstand",
    description: "Vereinsführung, Koordination und Sitzungsleitung.",
  },
  {
    key: "vice_chair",
    label: "2. Vorstand",
    description: "Stellvertretende Vereinsführung und Unterstützung des 1. Vorstands.",
  },
  {
    key: "treasurer",
    label: "Kassenwart",
    description: "Finanzen, Beiträge, Kassenführung und finanzielle Auswertungen.",
  },
  {
    key: "media_director",
    label: "Medienwart",
    description: "Kommunikation, Medien, Sponsoren und Außendarstellung des Vereins.",
  },
  {
    key: "sport_director",
    label: "Sportwart",
    description: "Sportbetrieb, Mannschaften, Training und sportliche Organisation.",
  },
  {
    key: "secretary",
    label: "Schriftführer",
    description: "Sitzungen, Protokolle, Dokumente und Beschlüsse.",
  },
  {
    key: "team_captain",
    label: "Team Captain",
    description: "Mannschaftsbezogene Organisation, Termine und sportliche Informationen.",
  },
  {
    key: "board",
    label: "Vorstand",
    description: "Vollzugriff auf die Vereinsverwaltung einschließlich Mitglieder, Rollen, Finanzen und Organisation.",
  },
  {
    key: "admin",
    label: "EDV-Wart (Administrator)",
    description: "Technische Administration und Vollzugriff auf VDC Club.",
  },
] as const;

export type OfficialRoleKey = typeof officialRoleDefinitions[number]["key"];

export const officialRoleKeys = officialRoleDefinitions.map((role) => role.key) as OfficialRoleKey[];

const priority = new Map<string, number>(
  officialRoleDefinitions.map((role, index) => [role.key, index]),
);

const officialLabels = Object.fromEntries(
  officialRoleDefinitions.map((role) => [role.key, role.label]),
) as Record<string, string>;

const legacyRoleLabels: Record<string, string> = {
  tournament_director: "Turnierleitung",
};

export function isOfficialRole(role: string): role is OfficialRoleKey {
  return priority.has(role);
}

export function rolePriority(role: string) {
  return priority.get(role) ?? Number.MAX_SAFE_INTEGER;
}

export function roleLabel(role: string) {
  return officialLabels[role] ?? legacyRoleLabels[role] ?? role;
}

export function sortedOfficialRoles(roles: string[]) {
  return [...new Set(roles)]
    .filter(isOfficialRole)
    .sort((a, b) => rolePriority(a) - rolePriority(b));
}

export function primaryRoleLabel(roles: string[]) {
  const official = sortedOfficialRoles(roles);
  if (official.length) return roleLabel(official[0]);

  const legacy = roles.find((role) => legacyRoleLabels[role]);
  return legacy ? roleLabel(legacy) : "Vereinszugang";
}
