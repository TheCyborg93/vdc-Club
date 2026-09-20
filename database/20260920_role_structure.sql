-- VDC Club · Official club role structure
-- Keeps internal role keys stable so existing user assignments continue to work.

INSERT INTO roles (key,name,description)
VALUES (
  'media_director',
  'Medienwart',
  'Medien, Kommunikation, Sponsoren und Vereinsdarstellung'
)
ON CONFLICT (key) DO UPDATE
SET name=EXCLUDED.name,description=EXCLUDED.description;

UPDATE roles SET name='1. Vorstand',description='Vereinsführung und Sitzungsleitung' WHERE key='chair';
UPDATE roles SET name='2. Vorstand',description='Stellvertretende Vereinsführung' WHERE key='vice_chair';
UPDATE roles SET name='Kassenwart',description='Finanzen, Beiträge und Kassenführung' WHERE key='treasurer';
UPDATE roles SET name='EDV-Wart (Administrator)',description='Technische Administration und Vollzugriff auf VDC Club' WHERE key='admin';
UPDATE roles SET name='Sportwart',description='Mannschaften, Sportbetrieb und Training' WHERE key='sport_director';
UPDATE roles SET name='Schriftführer',description='Sitzungen, Protokolle, Dokumente und Beschlüsse' WHERE key='secretary';
UPDATE roles SET name='Team Captain',description='Mannschaftsbezogene Funktionen' WHERE key='team_captain';
UPDATE roles SET name='Vorstand',description='Allgemeiner Vorstands-Zugriff' WHERE key='board';
