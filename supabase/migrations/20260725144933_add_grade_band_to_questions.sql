alter table public.questions
  add column if not exists grade_band text not null default 'junior';

alter table public.questions
  drop constraint if exists questions_grade_band_check;

alter table public.questions
  add constraint questions_grade_band_check
  check (grade_band in ('junior','senior'));

create index if not exists idx_questions_band_subject_status
  on public.questions (grade_band, subject, status, difficulty);
