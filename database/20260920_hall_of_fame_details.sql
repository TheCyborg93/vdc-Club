-- VDC Club · Erweiterte Hall of Fame

ALTER TABLE club_honors ADD COLUMN IF NOT EXISTS tournament_format text;

ALTER TABLE club_honors ADD COLUMN IF NOT EXISTS venue text;

ALTER TABLE club_honors ADD COLUMN IF NOT EXISTS final_score text;

ALTER TABLE club_honors ADD COLUMN IF NOT EXISTS high_finish integer CHECK (high_finish IS NULL OR high_finish BETWEEN 0 AND 170);

ALTER TABLE club_honors ADD COLUMN IF NOT EXISTS short_leg integer CHECK (short_leg IS NULL OR short_leg BETWEEN 9 AND 99);

ALTER TABLE club_honors ADD COLUMN IF NOT EXISTS average numeric(6,2) CHECK (average IS NULL OR average >= 0);

ALTER TABLE club_honors ADD COLUMN IF NOT EXISTS album_id uuid REFERENCES club_photo_albums(id) ON DELETE SET NULL;
