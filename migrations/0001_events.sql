-- Anonymous, opt-in usage events. One row per device per event per day.
CREATE TABLE events (
	day TEXT NOT NULL,      -- UTC date, YYYY-MM-DD
	event TEXT NOT NULL,    -- 'active' | 'opt_in' | 'setup_complete' | 'install'
	anon_id TEXT NOT NULL,  -- random UUID generated on the device
	version TEXT NOT NULL,  -- app version
	PRIMARY KEY (day, event, anon_id)
);

CREATE INDEX events_event_day ON events (event, day);
