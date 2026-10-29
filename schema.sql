-- Migration 1: atomic aggregate storage for the single-organization local demo.
-- Logical entities are documented in docs/MODEL.md; no derived balances persisted.
CREATE TABLE IF NOT EXISTS organization_state (
  id TEXT PRIMARY KEY CHECK(id='demo'),
  body TEXT NOT NULL CHECK(json_valid(body))
);
CREATE TABLE IF NOT EXISTS schema_migrations(version INTEGER PRIMARY KEY);
INSERT OR IGNORE INTO schema_migrations VALUES(1);
