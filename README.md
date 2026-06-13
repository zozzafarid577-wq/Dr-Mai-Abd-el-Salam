# Dr-Mai-Abd-el-Salam

Educational portal for Dr Mai Abd El Salam — a public marketing site, a
student portal, and a staff/admin portal, backed by Supabase and a set of
Vercel serverless functions in `api/`.

## Project layout

| Path                  | What it is                                                        |
| --------------------- | ----------------------------------------------------------------- |
| `index.html`, `*.html`| Public marketing site                                             |
| `portal/`             | Student portal (dashboard, courses, tests, flashcards, leaderboard…) |
| `drmai-staff-portal/` | Staff/admin portal (students, courses, question bank, tests…)     |
| `api/`                | Vercel serverless functions (admin actions, AI, email, RPC proxies) |
| `api/_lib/`           | Dependency-free helpers shared by the functions (unit-tested)     |
| `css/portal.css`      | Shared portal design system                                       |
| `js/`                 | Client helpers (`auth.js`, `portal-nav.js`)                       |
| `supabase-*.sql`      | Database setup + ordered migrations (`v2` … `v23`)                |
| `tests/`              | Vitest test suite for the API handlers + portal static checks     |

## Database setup

Run `supabase-setup.sql` first, then each `supabase-migration-vN.sql` in
order (v2 → v23) in the Supabase SQL editor.

Migration (`v19`) adds a public `lesson-media` storage bucket so admins
can upload recordings and lesson PDFs directly (instead of relying on
Google Drive links). Raise the storage file-size limit in Supabase if you
need to upload longer videos.

Migration (`v18`) adds `student_notes` — a private per-student notes pad
used by the new "My Scores & Notes" page (saved test results + a personal
notes area).

Migration (`v17`) lets one practice test belong to several
lessons via `practice_tests.module_ids` (a UUID array), so a test can
cover 2–3 lessons and appear under each of them for students. The single
`module_id` column is kept in sync with the first lesson for back-compat.

Migration (`v16`) adds a PDF attachment to practice tests
(`pdf_url` / `pdf_name` on `practice_tests`) plus a public `test-pdfs`
storage bucket, so a test can carry a printable/answer-key PDF that the
student can open at the end of the test. (Tests are linked to a lesson via
the existing `practice_tests.module_id` column.)

Earlier migration (`v13`) added:

- **Scheduled tests** — `open_at` / `close_at` on `practice_tests`. The
  `test_questions` read policy enforces `open_at` at the database level, so
  students cannot fetch a scheduled test's questions before it opens.
- **Flashcards** — student read access to published `question_bank` rows for
  their enrolled courses, plus a `flashcard_progress` table for per-student
  spaced-repetition (Leitner box) scheduling.
- **Leaderboard** — a `get_leaderboard(window_days)` `SECURITY DEFINER`
  function returning an aggregate, anonymity-preserving ranking (points,
  tests taken, average, and study streak).

## Features for staff

- **Question bank** with bulk authoring: paste plain-text MCQs, or generate
  drafts from a topic with AI, preview them, then save to the bank
  (`/api/import-questions-text`, `/api/generate-questions`).
- **Test builder** with optional scheduling (open/close window).
- Student management, PDF-to-quiz import, assignments, announcements.

## Tests

```bash
npm install
npm test          # vitest run
npm run test:watch
```

The suite covers every `api/` handler (auth/role checks, validation, success
and rollback paths) against an in-memory Supabase mock — no network or real
database — plus static checks over every portal page (inline-JS syntax,
duplicate/broken sidebar links). CI runs it on every pull request
(`.github/workflows/ci.yml`).

# Vercel redeploy trigger: 2026-05-30T22:37:40Z
