-- New accounts get the LOTS agent mark; existing users keep the style they chose.
ALTER TABLE "user" ALTER COLUMN "avatarStyle" SET DEFAULT 'lots';
