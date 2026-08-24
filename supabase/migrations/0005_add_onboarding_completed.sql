-- Tracks whether a host has been through the guided first-run wizard
-- (/dashboard/onboarding: timezone/locale, first event type, weekly
-- availability). Defaults false so every newly auto-created profile
-- (see requireHostProfile()'s createDefaultProfile) starts unonboarded;
-- the wizard flips it to true when the host finishes or explicitly skips.
alter table profiles add column onboarding_completed boolean not null default false;
