-- Widens calendar_connections.provider to allow a second provider
-- (Microsoft Graph / Outlook), alongside Google from migration 0006.
-- calendar_busy_blocks needs no change at all — it's already
-- provider-agnostic (keyed by connection_id, read by owner_id), so a
-- host's Google and Microsoft busy blocks combine automatically in
-- getExternalBusyBlocks() with zero code changes there.
alter table calendar_connections drop constraint calendar_connections_provider_check;
alter table calendar_connections add constraint calendar_connections_provider_check
  check (provider in ('google', 'microsoft'));
