export type Permission =
  | "members.read" | "members.write"
  | "teams.read" | "teams.write"
  | "tasks.read" | "tasks.write"
  | "calendar.read" | "calendar.write"
  | "training.read" | "training.write"
  | "meetings.read" | "meetings.write"
  | "resolutions.read" | "resolutions.write"
  | "finance.read" | "finance.write"
  | "sponsors.read" | "sponsors.write"
  | "documents.read" | "documents.write"
  | "statistics.read"
  | "surveys.read" | "surveys.write"
  | "chronicle.read" | "chronicle.write"
  | "settings.manage";

export const rolePermissions: Record<string, Permission[] | ["*"]> = {
  admin: ["*"],
  board: ["*"],
  chair: [
    "members.read", "members.write", "teams.read", "teams.write",
    "tasks.read", "tasks.write", "calendar.read", "calendar.write",
    "training.read", "training.write", "meetings.read", "meetings.write", "resolutions.read", "resolutions.write",
    "finance.read", "sponsors.read", "sponsors.write",
    "documents.read", "documents.write", "statistics.read", "surveys.read", "surveys.write", "chronicle.read", "chronicle.write",
  ],
  vice_chair: [
    "members.read", "members.write", "teams.read", "teams.write",
    "tasks.read", "tasks.write", "calendar.read", "calendar.write",
    "training.read", "training.write", "meetings.read", "meetings.write", "resolutions.read", "resolutions.write",
    "sponsors.read", "sponsors.write",
    "documents.read", "documents.write", "statistics.read", "surveys.read", "surveys.write", "chronicle.read", "chronicle.write",
  ],
  treasurer: [
    "members.read", "calendar.read", "meetings.read",
    "finance.read", "finance.write", "sponsors.read", "sponsors.write",
    "documents.read", "documents.write", "surveys.read", "surveys.write", "chronicle.read",
  ],
  media_director: [
    "members.read", "tasks.read", "tasks.write",
    "calendar.read", "calendar.write", "meetings.read", "resolutions.read",
    "sponsors.read", "sponsors.write", "documents.read", "documents.write",
    "statistics.read", "surveys.read", "surveys.write", "chronicle.read", "chronicle.write",
  ],
  secretary: [
    "members.read", "tasks.read", "tasks.write", "calendar.read", "calendar.write",
    "meetings.read", "meetings.write", "resolutions.read", "resolutions.write",
    "sponsors.read", "documents.read", "documents.write", "surveys.read", "surveys.write", "chronicle.read", "chronicle.write",
  ],
  sport_director: [
    "members.read", "teams.read", "teams.write", "tasks.read", "tasks.write",
    "calendar.read", "calendar.write", "training.read", "training.write", "statistics.read", "surveys.read", "surveys.write", "chronicle.read", "chronicle.write",
  ],
  team_captain: ["members.read", "teams.read", "tasks.read", "calendar.read", "training.read", "statistics.read", "surveys.read", "surveys.write", "chronicle.read"],
  tournament_director: ["members.read", "tasks.read", "tasks.write", "calendar.read", "calendar.write", "documents.read"],
};

export function hasPermission(roles: string[], permission: Permission) {
  return roles.some((role) => {
    const permissions = rolePermissions[role] ?? [];
    return permissions[0] === "*" || (permissions as Permission[]).includes(permission);
  });
}


export const permissionLabels: Record<Permission,string> = {
  "members.read":"Mitglieder ansehen",
  "members.write":"Mitglieder bearbeiten",
  "teams.read":"Mannschaften ansehen",
  "teams.write":"Mannschaften bearbeiten",
  "tasks.read":"Aufgaben ansehen",
  "tasks.write":"Aufgaben bearbeiten",
  "calendar.read":"Kalender ansehen",
  "calendar.write":"Kalender bearbeiten",
  "training.read":"Training ansehen",
  "training.write":"Training & Anwesenheit verwalten",
  "meetings.read":"Sitzungen ansehen",
  "meetings.write":"Sitzungen bearbeiten",
  "resolutions.read":"Beschlüsse ansehen",
  "resolutions.write":"Beschlüsse bearbeiten",
  "finance.read":"Finanzen ansehen",
  "finance.write":"Finanzen bearbeiten",
  "sponsors.read":"Sponsoren ansehen",
  "sponsors.write":"Sponsoren bearbeiten",
  "documents.read":"Dokumente ansehen",
  "documents.write":"Dokumente bearbeiten",
  "statistics.read":"Statistik ansehen",
  "surveys.read":"Umfragen ansehen",
  "surveys.write":"Umfragen erstellen und verwalten",
  "chronicle.read":"Vereinschronik ansehen",
  "chronicle.write":"Vereinschronik verwalten",
  "settings.manage":"Administration verwalten",
};

export function permissionsForRole(role: string) {
  return rolePermissions[role] ?? [];
}
