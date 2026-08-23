-- The database linter flags extensions installed directly in `public`:
-- they pollute the schema and complicate future permission boundaries.
-- Move btree_gist into a dedicated `extensions` schema instead. Safe for
-- the bookings_no_overlap EXCLUDE constraint — `extensions` is on the
-- default search_path in Supabase projects, so operator resolution is
-- unaffected.
create schema if not exists extensions;
alter extension btree_gist set schema extensions;
