# Mastery Conformance Results

**Date**: 2026-07-11

## TypeScript

- `src/lib/bkt/calculation.test.ts` covers the approved MCQ and SAQ correct/incorrect fixtures.
- The suite checks 100 deterministic seven-response sequences for each format.
- MCQ prior `0.30` + correct: posterior `0.6067415730`, result `0.6460674157`.
- MCQ prior `0.30` + incorrect: posterior `0.0540540541`, result `0.1486486486`.
- SAQ prior `0.30` + correct: posterior `0.7941176471`, result `0.8147058824`.

## PostgreSQL

`npx supabase test db` passed the local disposable-database integration cases:

- content trigger created one MCQ and two SAQ-part mappings;
- mapped correct MCQ produced `0.6460674157`;
- duplicate `client_attempt_id` produced no additional evidence;
- correction from correct to incorrect replayed to `0.1486486486` with one active source revision;
- full-credit SAQ part produced `0.8147058824` using the SAQ parameter set;
- all four pgTAP files passed, with 39 assertions before the separate 12-assertion security suite.

No production database was modified.
