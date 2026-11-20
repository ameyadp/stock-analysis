-- People who installed the app: name, email and location only, as entered on the sign-up form.
-- One row per email; signing up again (e.g. on another device) updates the name and location.
CREATE TABLE registrations (
	id INTEGER PRIMARY KEY,
	name TEXT NOT NULL,
	email TEXT NOT NULL UNIQUE,
	location TEXT NOT NULL,
	created_at TEXT NOT NULL,  -- UTC ISO timestamp of first sign-up
	updated_at TEXT NOT NULL   -- UTC ISO timestamp of latest sign-up
);
