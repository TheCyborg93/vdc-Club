# VDC Design System 1.0

## Ziel

VDC Club nutzt ein einheitliches, mobiles und sportliches Vereinsdesign. Das Design orientiert sich am VDC-Logo und am Einsatz im Vereinsalltag auf Handy, Tablet und Desktop.

## Verbindlicher Styling-Stack

Nur diese Bausteine sind für UI und Styling vorgesehen:

- Panda CSS
- Park UI
- Ark UI
- VDC Design Tokens
- VDC UI Kit
- Lucide
- Motion
- Rive

Nicht verwenden:

- Tailwind CSS
- shadcn/ui
- styled-components
- Emotion
- MUI
- Chakra UI
- zusätzliche globale CSS-Dateien
- styled-jsx

Die CI prüft diese Regel mit `npm run stylecheck`.

## Styling-Quelle

Die einzige CSS-Datei ist:

- `app/panda.css`

Sie definiert nur die Panda-Layer.

Alle visuellen Regeln liegen in:

- `theme/vdc-tokens.ts`
- `theme/vdc-recipes.ts`
- `theme/vdc-global.ts`
- `theme/vdc-meeting-global.ts`
- `theme/vdc-minutes-global.ts`
- `theme/vdc-finance-global.ts`
- `theme/vdc-club-global.ts`
- `theme/vdc-sport-global.ts`
- `theme/vdc-admin-global.ts`
- `theme/vdc-content-global.ts`

## Markenrichtung

- Grundfläche: tiefes Anthrazit / Schwarz
- Text: warmes Weiß
- Hauptakzent: VDC-Rot
- Linien und neutrale Flächen: metallische Grautöne
- Kein Türkis als primäre Markenfarbe
- Erfolg: Grün
- Warnung: Gelb
- Kritisch: Rot
- Information: Blau

## UX-Grundsätze

1. Mobile-first.
2. Kein horizontales Scrollen in normalen Arbeitsansichten.
3. Desktop nutzt eine ein-/ausklappbare linke Sidebar.
4. Mobil nutzt eine kompakte Topbar mit Drawer-Navigation.
5. Wichtige Arbeit steht vor Historie und Nebeninformationen.
6. Komplexe Details werden in Ark-Accordion/Collapsible/Drawer-Strukturen ausgelagert.
7. Kleine Aktionen dürfen kompakt sein, müssen auf Mobilgeräten aber ausreichende Touch-Ziele besitzen.
8. Kritische Aktionen verwenden Ark Alert Dialogs statt `window.confirm()`.
9. Motion bleibt subtil und respektiert `prefers-reduced-motion`.
10. Rive wird nur für gezielte Markenmomente genutzt.

## VDC UI Kit

Zentrale Komponenten liegen unter `components/ui`:

- VdcButton
- VdcCard
- VdcBadge
- VdcInput
- VdcDialog
- VdcTabs
- VdcPageHeader
- VdcStat
- VdcEmptyState
- VdcActionBar
- MotionSurface
- VdcRiveMark

Neue Seiten sollen zuerst diese Komponenten nutzen. Eigene Panda-`css()`-Blöcke sind nur für echte layoutspezifische Anforderungen vorgesehen.

## Responsive Stufen

- Handy: eine Hauptspalte, große Touch-Ziele, Drawer-Navigation
- Tablet: eigene Zwischenstufe für Sitzung, Vorstand und Turnierbetrieb
- Desktop: Sidebar, kompakte Tabellen und dichtere Informationsdarstellung

## Spezialmodule

### Sitzungen

Live-Sitzungen nutzen eine fokussierte Arbeitsansicht mit:

- TOP-Navigation
- großem Fokusbereich
- Check-/Status-Rail
- klarer Aktionsleiste
- möglichst wenig Ablenkung

### Protokolle

Protokoll, Prüfung und Korrektur nutzen eine eigene Panda-Schicht. Die Druckansicht bleibt hell und dokumentartig.

### Finanzen

Plan, Ist und Rest sollen sichtbar zusammengehören. Überfällige Beiträge und Budgetüberschreitungen werden als Handlungsbedarf hervorgehoben.

### Vorstand

Laufende Arbeit kommt vor Rollenreihenfolge und Historie.

## Neue UI-Regeln

Bei neuen Features:

1. Bestehende VDC-Komponente wiederverwenden.
2. Falls nötig, UI Kit erweitern.
3. Design Tokens verwenden.
4. Keine neue CSS-Datei anlegen.
5. Keine neue Styling-Bibliothek hinzufügen.
6. Mobile Darstellung zuerst prüfen.
7. `npm run stylecheck` und `npm run build` müssen grün sein.
