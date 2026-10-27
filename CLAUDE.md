# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

Public repository holding only the web page of reciproque's public tender monitoring. It is deployed to GitHub Pages at https://reciproque.github.io/vao-pages/. The pipeline that fills the database (BOAMP, TED, PLACE and AWS ingestion, tagging, scoring, LLM rating) lives in the **private** repo `reciproque/veille-appels-offres-2`, together with the Supabase schema (`sql/schema_supabase.sql`). Never copy pipeline code, profile texts, prompts or secrets into this repo: everything here is public.

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
- RLS is on, with policies `lecture` (SELECT) and `maj` (UPDATE) for `authenticated` only, on every row but refusing anonymous sessions. `anon` has no grants.
- `authenticated` has column-level UPDATE on `vue` and `note_humaine` only. Any new column the page must write needs its own column grant, added in the private repo's schema.
- `note_humaine` is NULL or between 1 and 3 (1 non pertinent, 2 partiellement pertinent, 3 pertinent; the page shows these labels, not numbers).
- Trigger `tracer_annotation` fills `annotation_par` (JWT email) and `annotation_le` when `vue` or `note_humaine` changes.
- Public sign-ups are disabled; accounts are created in the Supabase dashboard.

## Data contract with the pipeline

- Tables `annonces_boamp`, `annonces_ted`, `annonces_place` and `annonces_aws`, key `idweb` (plus `veille_profils` for the « Veille ciblée » tab, see below). Only the columns of `COLONNES_COMMUNES` are read in every table; anything else (`procedure_libelle` included: `annonces_aws` has none) goes in the source's `colonnes`. The page shows `(rapporte = true AND (analyse_note IS NULL OR analyse_note > 0)) OR note_humaine IS NOT NULL`; it does not reimplement the pipeline's selection threshold.
- Sort: `dateparution` descending first, then LLM note, `total_poles`, score.
- `COULEURS_TAGS` lists the `match_*` tag columns, which are defined by the pipeline's clusters. The page selects them by name in every table: when the pipeline adds or removes a cluster, update `COULEURS_TAGS` here at the same time (a stale entry makes the query fail).
- "Dernière ingestion" uses the table's `MAX(dateparution)`, not `date_ingestion`.
- Multi-valued columns are joined by the pipeline: `descripteur_libelle` and `libelles_cpv` with `" ; "` (their values contain commas, e.g. « Porte automatique, portail » is one value: never split them on commas), `code_departement` and `pays` with `", "`. The page splits them with `decouper(valeur, separateur)`.

## Page structure and conventions

All sources are shown in **one table** (no tabs), with a « Source » column. Each source is an entry of `SOURCES` that says how to read its own columns: `libelle` (BOAMP, TED, PLACE, AWS), `table`, extra `colonnes`, `detailAcheteur` (grey line under the buyer: BOAMP département, TED city, PLACE entité publique, AWS city and département), `objet` (TED: translated `objet_fr` falling back to `objet`), `pays` (alpha-3 codes, shown via `Intl.DisplayNames`; `FRANCE` for every non-TED source), `categories` (the « Descripteurs / Libellés CPV » column: BOAMP `descripteur_libelle`, TED `libelles_cpv`, empty elsewhere), `typeMarche` and `procedure` (the « Marché » column, TED codes mapped to French labels), `departements` (BOAMP, AWS), optional `description` (TED: `description_fr` falling back to `description`; AWS has none) and `recherche`. Buyer references (PLACE, AWS) are not shown. Every source may define `description`, rendered as a full-width second row under the tender, folded (`<details>`, "Lire la description"), with open ones remembered across re-renders. Everything else is shared: the selection query, sort, filters, the "vue" checkbox, the team rating, and `enregistrer`, which writes to the table of the row's own source (`annonce.source`, set at load time, never sent back). All sources are loaded in parallel at login (`etat[cle]`: annonces, « Dernière ingestion » line, error) and merged into `annonces`, sorted by `comparer`; the table is redrawn as each source arrives, and a source that fails to load shows an error line without hiding the others. There is one « Dernière ingestion » line per source. An old tab link (`#ted`) pre-checks that source in the « Source » filter. TED deadlines are date-only (`AAAA-MM-JJ`): they are displayed without a time and expire at the end of that day.

Column sorts and filters live in the table headers. Each header is `[texte, classe, colonne]` in `afficherEntetes`; the `colonne` key ties it to its sort buttons (`TRIS`) and filter buttons (`FILTRES`: source, departement, entite_publique, pays, tags, number of tags, categorie, type_marche, procedure, LLM note, team rating). Filters read values through the row's source (`sourceDe(a).pays(a)`…), so one filter spans all sources. A filter is `{ cle, colonne, libelle, valeurs(a), libelleValeur?, ordre?, libelleVide? }`; its choices and counts are computed from the displayed annonces, ignoring that filter's own selection (`annoncesFiltrees(sauf)`), so checking a value does not zero the others; checked values stay listed with 0, plus a « Non renseigné » choice for annonces without a value. OR within a filter, AND across filters. A sort cycles décroissant → croissant → default (`comparer`), one at a time, stable, missing values last. Filter and sort state is in `affichage.filtres` (key → `Set`) and `affichage.tri`, never in the DOM: `afficher` rebuilds the headers each time. The checkbox list is a `position: fixed` panel on `<body>` (so the table's horizontal scroll does not clip it), repositioned under its button by `data-filtre`. « Réinitialiser les filtres » clears the column filters and sort only.

The page has two tabs (`ONGLETS`, `choisirOnglet`, kept in the URL hash: none for « Appels d'offres », `#veille-ciblee`; an old per-source hash such as `#ted` still pre-checks that source). « Veille ciblée » is read-only: it reads `veille_profils` (written by the pipeline on Wednesdays and Sundays: one row per buyer profile and check day) over the last `JOURS_HISTORIQUE_VEILLE` (60) days, columns `id, jour, plateforme, nom, url, nb_offres, nouveautes, erreur` (column-level grant; `etat` is not readable). Rows are grouped by `url` (`resumerProfil`): offers in progress of the last successful check with the change since the previous one (`nb_offres` NULL for institution sites: « Non comptées »), every alert of the period with its day (the pipeline's leading « nom : » and the profile URL are stripped, other URLs become links), and the last check with « En erreur depuis le … » when the latest row has an error. Profiles with the most recent alerts come first.

Build DOM with `textContent` (tender text comes from BOAMP/TED and is untrusted) and only link `http(s)` URLs.
