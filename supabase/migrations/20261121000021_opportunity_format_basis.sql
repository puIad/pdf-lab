-- Issue #87: a format the wording does not name may be suggested from the market's competitor
-- listings; the basis says so. Null = the format (or its absence) comes from the wording.
alter table opportunities add column if not exists format_basis text;
