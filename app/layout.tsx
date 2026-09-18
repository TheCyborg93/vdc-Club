import type { Metadata } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { getCurrentUser } from "@/lib/auth";
import "./globals.css";
import "./vdc-theme.css";

export const metadata: Metadata = {
  title: "VDC Club",
  description: "Digitale Vereinszentrale des Vestischen Darts Club",
};

const publicPaths = ["/login", "/setup"];

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const requestHeaders = await headers();
  const pathname = requestHeaders.get("x-vdc-pathname") ?? "/";
  const isPublic = publicPaths.some((path) => pathname === path || pathname.startsWith(path + "/"));
  const user = await getCurrentUser();

  if (!isPublic && !user) redirect("/login");

  return (
    <html lang="de">
      <body>
        {isPublic ? (
          children
        ) : (
          <AppShell
            user={{
              displayName: user!.displayName,
              email: user!.email,
              roles: user!.roles,
            }}
          >
            {children}
          </AppShell>
        )}
      </body>
    </html>
  );
}
