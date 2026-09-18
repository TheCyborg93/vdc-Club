# VDC Club

Digitale Vorstands- und Vereinszentrale des Vestischen Darts Club.

## Stack
- Next.js 16
- React 19
- TypeScript
- Responsive Dark UI
- Neon PostgreSQL (folgt)
- Vercel Deployment (folgt)

## Module
Dashboard, Mitglieder, Mannschaften, Vorstand & Rollen, Aufgaben, Kalender, Sitzungen, Beschlüsse, Finanzen, Dokumente, Vereinsstatistik und Einstellungen.

## Lokal
```bash
npm install
npm run dev
```


## Papierkorb

Normales Löschen verschiebt unterstützte Datensätze zunächst in den Admin-Papierkorb. Dort können Administratoren sie wiederherstellen oder nach Eingabe von `LÖSCHEN` endgültig entfernen.

Unterstützt werden Aufgaben, Dokumente, manuelle Kalendertermine, geplante Sitzungen, unbenutzte Sondertrainings, Trainingspausen, unbenutzte Trainingssaisons, unbenutzte Sponsoren und vollständig leere lokale Mannschaften. Historische oder fachlich schützenswerte Daten bleiben archiviert, storniert oder deaktiviert statt hart gelöscht.

## VDC-Fachsystem-Synchronisation

Die Club-App ist die zentrale Vereins- und Vorstandsoberfläche. Für die geschützten Integrationen werden in Vercel ausschließlich Server-Secrets verwendet:

- `VDC_TC_SYNC_TOKEN` ↔ `vdc-tc`: `VDC_CLUB_SYNC_TOKEN`
- `VDC_TURNIER_SYNC_TOKEN` ↔ `vdc-turnier`: `VDC_CLUB_SYNC_TOKEN`
- `VDC_TRAINING_SYNC_TOKEN` ↔ `vdc-training-app`: `VDC_CLUB_SYNC_TOKEN`

Die Werte werden niemals in Git gespeichert. Nach Änderungen an Vercel-Environment-Variablen ist ein neues Deployment erforderlich.
