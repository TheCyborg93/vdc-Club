import type { ReactNode } from "react";
import { requirePermission } from "@/lib/permissions";

export default async function AdminLayout({ children }: { children: ReactNode }) {
  await requirePermission("settings.manage");
  return children;
}
