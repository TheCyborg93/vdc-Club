import type { ReactNode } from "react";

function Svg({children}:{children:ReactNode}) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      {children}
    </svg>
  );
}

export function NavIcon({href}:{href:string}) {
  if (href==="/") {
    return <Svg><path d="M3 11.5 12 4l9 7.5"/><path d="M5.5 10.5V20h13v-9.5"/><path d="M9.5 20v-6h5v6"/></Svg>;
  }
  if (href.startsWith("/anleitung")) {
    return <Svg><path d="M5 4.5h6.5A2.5 2.5 0 0 1 14 7v12H7.5A2.5 2.5 0 0 0 5 21.5v-17Z"/><path d="M19 4.5h-2.5A2.5 2.5 0 0 0 14 7v12h2.5A2.5 2.5 0 0 1 19 21.5v-17Z"/><path d="M8 9h3M8 12h3"/></Svg>;
  }
  if (href.startsWith("/mitglieder")) {
    return <Svg><circle cx="9" cy="8" r="3"/><path d="M3.5 20c0-3 2.3-5.2 5.5-5.2s5.5 2.2 5.5 5.2"/><circle cx="17" cy="9" r="2.2"/><path d="M15.5 15.2c2.8-.2 5 1.5 5 4.3"/></Svg>;
  }
  if (href.startsWith("/vorstand")) {
    return <Svg><path d="M4 20h16"/><path d="M6 20v-7h12v7"/><path d="M8 13V9h8v4"/><path d="M12 4 5 8h14l-7-4Z"/></Svg>;
  }
  if (href.startsWith("/verein")) {
    return <Svg><circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="2.4"/><path d="M12 4v5.6M20 12h-5.6M12 20v-5.6M4 12h5.6"/></Svg>;
  }
  if (href.startsWith("/sponsoren")) {
    return <Svg><path d="m5 7 7-3 7 3v5c0 4-3 6.5-7 8-4-1.5-7-4-7-8V7Z"/><path d="M9.2 12.2 11 14l4-4"/></Svg>;
  }
  if (href.startsWith("/finanzen")) {
    return <Svg><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 9h18"/><path d="M7 14h4"/></Svg>;
  }
  if (href.startsWith("/mannschaften")) {
    return <Svg><path d="M8 4h8l2 3-2 4H8L6 7l2-3Z"/><path d="m8 11-3 9 7-3 7 3-3-9"/></Svg>;
  }
  if (href.startsWith("/training")) {
    return <Svg><path d="M5 7v10M19 7v10M3 9v6M21 9v6M8 12h8"/></Svg>;
  }
  if (href.startsWith("/kalender")) {
    return <Svg><rect x="4" y="5" width="16" height="15" rx="2"/><path d="M8 3v4M16 3v4M4 9h16"/><path d="M8 13h3M13 13h3M8 16h3"/></Svg>;
  }
  if (href.startsWith("/statistik")) {
    return <Svg><path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/></Svg>;
  }
  if (href.startsWith("/aufgaben")) {
    return <Svg><rect x="4" y="4" width="16" height="16" rx="2"/><path d="m8 10 2 2 5-5M8 16h8"/></Svg>;
  }
  if (href.startsWith("/sitzungen")) {
    return <Svg><path d="M4 7h16v11H4z"/><path d="M8 4v6M16 4v6M7 13h10M7 16h6"/></Svg>;
  }
  if (href.startsWith("/beschluesse")) {
    return <Svg><path d="M5 4h14v16H5z"/><path d="M8 8h8M8 12h8M8 16h5"/><path d="m15 15 1.5 1.5L20 13"/></Svg>;
  }
  if (href.startsWith("/dokumente")) {
    return <Svg><path d="M6 3h8l4 4v14H6z"/><path d="M14 3v5h5M9 12h6M9 16h6"/></Svg>;
  }
  if (href.startsWith("/archiv")) {
    return <Svg><path d="M4 7h16v13H4z"/><path d="M3 4h18v4H3z"/><path d="M9 12h6"/></Svg>;
  }
  if (href.startsWith("/admin/papierkorb")) {
    return <Svg><path d="M5 7h14M9 7V4h6v3M7 7l1 13h8l1-13M10 11v5M14 11v5"/></Svg>;
  }
  if (href.startsWith("/admin/integrationen")) {
    return <Svg><path d="M9 7V4M15 7V4M8 7h8v5a4 4 0 0 1-8 0V7Z"/><path d="M12 16v4M9 20h6"/></Svg>;
  }
  if (href.startsWith("/admin/status")) {
    return <Svg><path d="M3 12h4l2-5 4 10 2-5h6"/></Svg>;
  }
  if (href.startsWith("/admin/audit")) {
    return <Svg><circle cx="11" cy="11" r="7"/><path d="m16 16 5 5M8 11h6M11 8v6"/></Svg>;
  }
  if (href.startsWith("/admin/daten")) {
    return <Svg><path d="M4 5h16v14H4z"/><path d="M8 9h8M8 13h5M8 17h7"/></Svg>;
  }
  if (href.startsWith("/admin/benutzer")) {
    return <Svg><circle cx="9" cy="8" r="3"/><path d="M3.5 20c0-3 2.3-5.2 5.5-5.2"/><path d="M16 13v7M12.5 16.5h7"/></Svg>;
  }
  if (href.startsWith("/admin")) {
    return <Svg><circle cx="12" cy="12" r="3"/><path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6 7 7M17 17l1.4 1.4M18.4 5.6 17 7M7 17l-1.4 1.4"/></Svg>;
  }
  return <Svg><circle cx="12" cy="12" r="8"/></Svg>;
}
