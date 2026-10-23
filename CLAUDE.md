# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

Public repository holding only the web page of reciproque's public tender monitoring. It is deployed to GitHub Pages at https://reciproque.github.io/vao-pages/. The pipeline that fills the database (BOAMP, TED and PLACE ingestion, tagging, scoring, LLM rating) lives in the **private** repo `reciproque/veille-appels-offres-2`, together with the Supabase schema (`sql/schema_supabase.sql`). Never copy pipeline code, profile texts, prompts or secrets into this repo: everything here is public.

Code, identifiers, comments and UI text are in French; keep that convention.

## Commands

```bash
python3 -m http.server 8000 --directory web   # serve the page locally
```

There is no build, test suite or linter. `node --check web/app.js` is the only cheap syntax check.

`.github/workflows/pages.yml` deploys `web/` to GitHub Pages on pushes to `main` that touch it. Pages caches for up to 10 minutes, so a just-pushed change may need a hard refresh.

## Web page and Supabase security

The page is three plain files with no build step: `web/index.html` (markup), `web/style.css` and `web/app.js` (all the code), loaded as a classic script at the end of `<body>`. `index.html` loads them as `style.css?v=N` and `app.js?v=N`: bump `N` in both links whenever either file changes, otherwise browsers may combine a new `index.html` with a cached old file (GitHub Pages serves `max-age=600`). It loads `@supabase/supabase-js` (pinned) from jsdelivr and uses email/password auth. `app.js` contains the project URL and the **publishable** key, which is public by design. Never put a secret or `service_role` key there.

Access is enforced in Supabase, not in the page (schema kept in the private repo, applied by hand in the Supabase SQL editor):
- RLS is on, with policies `lecture` (SELECT) and `maj` (UPDATE) for `authenticated` only. `anon` has no grants.
- `authenticated` has column-level UPDATE on `vue` and `note_humaine` only. Any new column the page must write needs its own column grant, added in the private repo's schema.
- `note_humaine` is NULL or between 1 and 3 (1 non pertinent, 2 partiellement pertinent, 3 pertinent; the page shows these labels, not numbers).
- Trigger `tracer_annotation` fills `annotation_par` (JWT email) and `annotation_le` when `vue` or `note_humaine` changes.
- Public sign-ups are disabled; accounts are created in the Supabase dashboard.

## Data contract with the pipeline

- Tables `annonces_boamp`, `annonces_ted` and `annonces_place`, key `idweb`. The page shows `(rapporte = true AND (analyse_note IS NULL OR analyse_note > 0)) OR note_humaine IS NOT NULL`; it does not reimplement the pipeline's selection threshold.
- Sort: `dateparution` descending first, then LLM note, `total_poles`, score.
- `COULEURS_TAGS` lists the `match_*` tag columns, which are defined by the pipeline's clusters. The page selects them by name in every table: when the pipeline adds or removes a cluster, update `COULEURS_TAGS` here at the same time (a stale entry makes the query fail).
- "Dernière ingestion" uses the table's `MAX(dateparution)`, not `date_ingestion`.
- Multi-valued columns are joined by the pipeline: `descripteur_libelle` and `libelles_cpv` with `" ; "` (their values contain commas, e.g. « Porte automatique, portail » is one value: never split them on commas), `code_departement` and `pays` with `", "`. The page splits them with `decouper(valeur, separateur)`.

## Page structure and conventions

Each tab is an entry of `SOURCES` (table, extra columns, source-specific cells: TED shows the country via `Intl.DisplayNames`, the translated `objet_fr` falling back to `objet`, `libelles_cpv`, and `description_fr` falling back to `description`; PLACE shows the entité publique under the buyer, the buyer's `reference`, and the procedure). Every source may define `description`, rendered as a full-width second row under the tender, folded (`<details>`, "Lire la description"), with open ones remembered across re-renders. Everything else is shared: the selection query, sort, filters (common to all tabs), the "vue" checkbox, the team rating, and `enregistrer`, which writes to the table of the row's own source. All sources are loaded at login. Each tab has its own "Dernière ingestion" line and counter, and the active tab is kept in the URL hash (`#ted`). TED deadlines are date-only (`AAAA-MM-JJ`): they are displayed without a time and expire at the end of that day.

Column sorts and filters live in the table headers. Each header is `[texte, classe, colonne]` in `afficherEntetes`; the `colonne` key ties it to its sort buttons (`TRIS`, shared) and filter buttons (`FILTRES_COMMUNS` for tags, number of tags, LLM note and team rating, plus each source's `filtres`: departement, descripteur, famille, procedure for BOAMP; pays, cpv, type_avis, procedure for TED). A filter is `{ cle, colonne, libelle, valeurs(a), libelleValeur?, ordre?, libelleVide? }`; its choices are computed from the tab's loaded annonces with counts, plus a « Non renseigné » choice for annonces without a value. OR within a filter, AND across filters and with the common filters. A sort cycles décroissant → croissant → default (`comparer`), one at a time, stable, missing values last. Filter and sort state is per tab in `etat[cle].filtres` (key → `Set`) and `etat[cle].tri`, never in the DOM: `afficher` rebuilds the headers each time. The checkbox list is a `position: fixed` panel on `<body>` (so the table's horizontal scroll does not clip it), repositioned under its button by `data-filtre`. « Réinitialiser les filtres » clears the active tab's column filters and sort only.

Build DOM with `textContent` (tender text comes from BOAMP/TED and is untrusted) and only link `http(s)` URLs.
