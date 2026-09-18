import { ModulePage } from "@/components/module-page";

export default function Page() {
  return (
    <ModulePage
      kicker="System"
      title="Einstellungen"
      description="Vereinsdaten, Rollen, Integrationen und Systemeinstellungen zentral konfigurieren."
      primaryAction="Speichern"
      cards={[
        { label: "Integrationen", value: "0", hint: "noch nicht verbunden" },
        { label: "Rollen", value: "8", hint: "vorgesehen" },
        { label: "Saison", value: "2026/27", hint: "aktiv" },
        { label: "System", value: "Basis", hint: "Phase 1" },
      ]}
      sections={[
        { title: "Vereinsprofil", text: "Name, Logo, Saison und allgemeine Einstellungen." },
        { title: "Integrationen", text: "Hier kommen später VDC-TC, VDC-Turnier, VDC-Training sowie Neon und weitere Dienste hinzu." },
      ]}
    />
  );
}
