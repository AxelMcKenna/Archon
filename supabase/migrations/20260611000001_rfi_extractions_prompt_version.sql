-- Track which prompt version produced each RFI vision extraction.
-- Plan + VE pipelines already record prompt_version on their audit rows;
-- this brings RFI in line now that its prompt lives in a versioned file.

alter table public.rfi_extractions
  add column if not exists prompt_version text;
