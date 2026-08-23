-- Tracks the iCalendar SEQUENCE for each booking's .ics attachments.
-- Bumped on every reschedule (and read on cancellation) so a recipient's
-- calendar app treats a later .ics as an update to the same VEVENT rather
-- than a duplicate or a stale one it should ignore.
alter table bookings add column sequence int not null default 0;
