export type Permission =
  | "members.read" | "members.write"
  | "teams.read" | "teams.write"
  | "tasks.read" | "tasks.write"
  | "calendar.read" | "calendar.write"
  | "meetings.read" | "meetings.write"
  | "resolutions.read" | "resolutions.write"
  | "finance.read" | "finance.write"
  | "sponsors.read" | "sponsors.write"
  | "documents.read" | "documents.write"
  | "statistics.read"
  | "settings.manage";

const rolePermissions: Record<string, Permission[] | ["*"]> = {
  admin: ["*"],
  board: [
    "members.read", "teams.read", "tasks.read", "tasks.write",
    "calendar.read", "meetings.read", "resolutions.read",
    "sponsors.read", "documents.read", "statistics.read",
  ],
  chair: [
    "members.read", "members.write", "teams.read", "teams.write",
    "tasks.read", "tasks.write", "calendar.read", "calendar.write",
    "meetings.read", "meetings.write", "resolutions.read", "resolutions.write",
    "finance.read", "sponsors.read", "sponsors.write",
    "documents.read", "documents.write", "statistics.read",
  ],
  vice_chair: [
    "members.read", "members.write", "teams.read", "teams.write",
    "tasks.read", "tasks.write", "calendar.read", "calendar.write",
    "meetings.read", "meetings.write", "resolutions.read", "resolutions.write",
    "sponsors.read", "sponsors.write",
    "documents.read", "documents.write", "statistics.read",
  ],
  treasurer: [
    "members.read", "calendar.read", "meetings.read",
    "finance.read", "finance.write", "sponsors.read", "sponsors.write",
    "documents.read", "documents.write",
  ],
  secretary: [
    "members.read", "tasks.read", "tasks.write", "calendar.read", "calendar.write",
    "meetings.read", "meetings.write", "resolutions.read", "resolutions.write",
    "sponsors.read", "documents.read", "documents.write",
  ],
  sport_director: [
    "members.read", "teams.read", "teams.write", "tasks.read", "tasks.write",
    "calendar.read", "calendar.write", "statistics.read",
  ],
  team_captain: ["members.read", "teams.read", "tasks.read", "calendar.read", "statistics.read"],
  tournament_director: ["members.read", "tasks.read", "tasks.write", "calendar.read", "calendar.write", "documents.read"],
};

export function hasPermission(roles: string[], permission: Permission) {
  return roles.some((role) => {
    const permissions = rolePermissions[role] ?? [];
    return permissions[0] === "*" || (permissions as Permission[]).includes(permission);
  });
}
