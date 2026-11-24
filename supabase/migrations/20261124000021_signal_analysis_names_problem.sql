-- Issue #103: extraction records whether a signal names a concrete problem.
-- null = analysed before this column existed; such a row is analysed again by the next run that
-- holds it, and until then only an outright "no problem is described" wording drops it.
alter table signal_analysis add column if not exists names_problem boolean;
