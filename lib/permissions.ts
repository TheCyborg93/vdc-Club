import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";

export type Permission =
  | "members.read" | "members.write"
  | "teams.read" | "teams.write"
  | "tasks.read" | "tasks.write"
  | "meetings.read" | "meetings.write"
  | "resolutions.read" | "resolutions.write"
  | "finance.read" | "finance.write"
  | "documents.read" | "documents.write"
  | "statistics.read"
  | "settings.manage";

const rolePermissions: Record<string, Permission[] | ["*"]> = {
  admin: ["*"],
  board: [
    "members.read", "teams.read", "tasks.read", "tasks.write",
    "meetings.read", "resolutions.read", "documents.read", "statistics.read",
  ],
  chair: [
    "members.read", "members.write", "teams.read", "teams.write",
    "tasks.read", "tasks.write", "meetings.read", "meetings.write",
    "resolutions.read", "resolutions.write", "finance.read",
    "documents.read", "documents.write", "statistics.read",
  ],
  vice_chair: [
    "members.read", "members.write", "teams.read", "teams.write",
    "tasks.read", "tasks.write", "meetings.read", "meetings.write",
    "resolutions.read", "resolutions.write", "documents.read",
    "documents.write", "statistics.read",
  ],
  treasurer: ["members.read", "finance.read", "finance.write", "documents.read", "documents.write"],
  secretary: [
    "members.read", "tasks.read", "tasks.write", "meetings.read", "meetings.write",
    "resolutions.read", "resolutions.write", "documents.read", "documents.write",
  ],
  sport_director: ["members.read", "teams.read", "teams.write", "tasks.read", "tasks.write", "statistics.read"],
  team_captain: ["members.read", "teams.read", "tasks.read", "statistics.read"],
  tournament_director: ["members.read", "tasks.read", "tasks.write", "documents.read"],
};

export function hasPermission(roles: string[], permission: Permission) {
  return roles.some((role) => {
    const permissions = rolePermissions[role] ?? [];
    return permissions[0] === "*" || (permissions as Permission[]).includes(permission);
  });
}

export async function requirePermission(permission: Permission) {
  const user = await requireUser();
  if (!hasPermission(user.roles, permission)) redirect("/?error=forbidden");
  return user;
}
