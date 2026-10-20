# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

Public repository holding only the web page of reciproque's public tender monitoring. It is deployed to GitHub Pages at https://reciproque.github.io/vao-pages/. The pipeline that fills the database (BOAMP and TED ingestion, tagging, scoring, LLM rating) lives in the **private** repo `reciproque/veille-appels-offres-2`, together with the Supabase schema (`sql/schema_supabase.sql`). Never copy pipeline code, profile texts, prompts or secrets into this repo: everything here is public.

Code, identifiers, comments and UI text are in French; keep that convention.

## Commands

```bash
python3 -m http.server 8000 --directory web   # serve the page locally
```

There is no build, test suite or linter. `node --check` on the extracted `<script>` is the only cheap syntax check.

`.github/workflows/pages.yml` deploys `web/` to GitHub Pages on pushes to `main` that touch it. Pages caches for up to 10 minutes, so a just-pushed change may need a hard refresh.

## Web page and Supabase security

`web/index.html` is a single file with no build step. It loads `@supabase/supabase-js` (pinned) from jsdelivr and uses email/password auth. It contains the project URL and the **publishable** key, which is public by design. Never put a secret or `service_role` key there.

Access is enforced in Supabase, not in the page (schema kept in the private repo, applied by hand in the Supabase SQL editor):
- RLS is on, with policies `lecture` (SELECT) and `maj` (UPDATE) for `authenticated` only. `anon` has no grants.
- `authenticated` has column-level UPDATE on `vue` and `note_humaine` only. Any new column the page must write needs its own column grant, added in the private repo's schema.
- `note_humaine` is NULL or between 1 and 3 (1 non pertinent, 2 partiellement pertinent, 3 pertinent; the page shows these labels, not numbers).
- Trigger `tracer_annotation` fills `annotation_par` (JWT email) and `annotation_le` when `vue` or `note_humaine` changes.
- Public sign-ups are disabled; accounts are created in the Supabase dashboard.

## Data contract with the pipeline

- Tables `annonces_boamp` and `annonces_ted`, key `idweb`. The page shows `(rapporte = true AND (analyse_note IS NULL OR analyse_note > 0)) OR note_humaine IS NOT NULL`; it does not reimplement the pipeline's selection threshold.
- Sort: `dateparution` descending first, then LLM note, `total_poles`, score.
- `COULEURS_TAGS` lists the `match_*` tag columns, which are defined by the pipeline's clusters. The page selects them by name in both tables: when the pipeline adds or removes a cluster, update `COULEURS_TAGS` here at the same time (a stale entry makes the query fail).
- "Dernière ingestion" uses the table's `MAX(dateparution)`, not `date_ingestion`.

## Page structure and conventions

Each tab is an entry of `SOURCES` (table, extra columns, source-specific cells: TED shows the country via `Intl.DisplayNames`, the translated `objet_fr` falling back to `objet`, `libelles_cpv`, and `description_fr` falling back to `description`). Both sources may define `description`, rendered as a full-width second row under the tender, folded (`<details>`, "Lire la description"), with open ones remembered across re-renders. Everything else is shared: the selection query, sort, filters (common to both tabs), the "vue" checkbox, the team rating, and `enregistrer`, which writes to the table of the row's own source. Both sources are loaded at login. Each tab has its own "Dernière ingestion" line and counter, and the active tab is kept in the URL hash (`#ted`). TED deadlines are date-only (`AAAA-MM-JJ`): they are displayed without a time and expire at the end of that day.

Build DOM with `textContent` (tender text comes from BOAMP/TED and is untrusted) and only link `http(s)` URLs.
