import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { hasPermission, type Permission } from "@/lib/access";

export { hasPermission, type Permission };

export async function requirePermission(permission: Permission) {
  const user = await requireUser();
  if (!hasPermission(user.roles, permission)) redirect("/?error=forbidden");
  return user;
}
