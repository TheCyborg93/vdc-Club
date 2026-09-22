-- Details für namentliche Abstimmungen
ALTER TABLE resolutions
  ADD COLUMN IF NOT EXISTS vote_details text;
