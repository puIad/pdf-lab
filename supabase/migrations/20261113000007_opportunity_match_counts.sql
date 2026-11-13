-- Phase 6 Part 6.8 (DEC-014): how many of its market's signals speak about an opportunity's problem.
-- Shown as "7 of 31 discussions in this market mention this problem". Null on rows saved before
-- this part and on candidates built from quick-idea phrases (their count is phrase rows, not discussions).
alter table opportunities add column if not exists matching_signals int;
alter table opportunities add column if not exists market_signal_count int;
