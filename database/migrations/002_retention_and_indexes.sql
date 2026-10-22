-- Migration 002 is intentionally empty.
-- The previous draft referenced round_history and submissions tables that do
-- not exist in the current PostgreSQL schema. Do not run replay deletion until
-- a reviewed migration, archive, and restore drill exist.
-- Qualifier indexes are created by backend/internal/repository/qualifier_records.go.
SELECT 1;
