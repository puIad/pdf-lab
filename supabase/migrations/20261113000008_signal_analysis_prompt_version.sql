-- Phase 6 Part 6.9 (DEC-014): which extraction prompt produced an analysis row.
-- Null on rows written before batched extraction (prompt `extract-v1`, one call per signal).
alter table signal_analysis add column if not exists prompt_version text;
