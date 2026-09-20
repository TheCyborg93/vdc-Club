import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import { after } from "next/server";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { getCurrentUser } from "@/lib/auth";
import { getNotifications } from "@/lib/notifications";
import { PwaInstallPrompt } from "@/components/pwa-install-prompt";
import { ensureIntegrationsFresh } from "@/lib/club-sync";
import "./globals.css";
import "./vdc-theme.css";

export const metadata: Metadata = {
  title: {
    default: "VDC Club",
    template: "%s · VDC Club",
  },
  applicationName: "VDC Club",
  description: "Digitale Vereinszentrale des Vestischen Dart Club e.V.",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    title: "VDC Club",
    statusBarStyle: "black-translucent",
  },
  icons: {
    icon: [
      { url: "/api/pwa-icon/192", sizes: "192x192", type: "image/png" },
      { url: "/api/pwa-icon/512", sizes: "512x512", type: "image/png" },
    ],
    apple: [
      { url: "/api/pwa-icon/180", sizes: "180x180", type: "image/png" },
    ],
  },
};

export const viewport: Viewport = {
  themeColor: "#08100f",
  colorScheme: "dark",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

const publicPaths = ["/login", "/setup", "/u"];

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const requestHeaders = await headers();
  const pathname = requestHeaders.get("x-vdc-pathname") ?? "/";
  const isPublic = publicPaths.some((path) => pathname === path || pathname.startsWith(path + "/"));
  const user = await getCurrentUser();

  if (!isPublic && !user) redirect("/login");

  if (!isPublic && user) {
    after(async () => {
      await ensureIntegrationsFresh(2).catch(()=>null);
    });
  }

  const notifications = !isPublic && user
    ? await getNotifications(user,{limit:6})
    : { items:[],unread:0 };

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
              memberId: user!.memberId,
            }}
            notifications={notifications}
          >
            {children}
          </AppShell>
        )}
        <PwaInstallPrompt />
      </body>
    </html>
  );
}
