# Veille appels d'offres — page de suivi (reciproque)

Page web de suivi des appels d'offres sélectionnés chaque matin par la
pipeline de veille de Reciproque (sources BOAMP, TED et autres). La pipeline vit dans
un dépôt privé ; ce dépôt public ne contient que la page.

**Page :** https://reciproque.github.io/vao-pages/
(accès sur identifiant, comptes créés dans Supabase).

## Fonctionnement

Trois fichiers, sans étape de build : [`web/index.html`](web/index.html)
(structure), [`web/style.css`](web/style.css) (styles) et
[`web/app.js`](web/app.js) (code). Elle lit directement les tables Supabase (un
onglet par source) : rien n'est régénéré, les nouvelles annonces apparaissent
dès que la pipeline a tourné.

- **Annonces affichées** : celles retenues par la pipeline (hors note LLM 0),
  plus celles déjà évaluées par l'équipe.
- **Tri** : par défaut, date de publication la plus récente d'abord ; à date
  égale, note LLM, puis nombre de pôles, puis score. Les en-têtes proposent
  aussi un tri par date de publication, date limite, proximité sémantique et
  note LLM (décroissant, puis croissant, puis retour au tri par défaut ; les
  annonces sans valeur toujours en dernier).
- **Saisie** : case « Vue » et évaluation de l'équipe (non pertinent,
  partiellement pertinent, pertinent).
- **Filtres** : communs aux trois onglets (vues, date limite passée, date de
  publication minimale, recherche texte), plus des filtres par colonne propres
  à chaque onglet, dans les en-têtes : département, tags, descripteurs, type de
  marché, procédure, note LLM, évaluation (BOAMP) ; pays, tags, libellés CPV,
  type de marché, procédure, note LLM, évaluation (TED). Les valeurs proposées
  viennent des annonces chargées, avec un choix « Non renseigné ». Plusieurs
  valeurs d'un même filtre s'additionnent (OU), des filtres différents se
  cumulent (ET). « Réinitialiser les filtres » remet à zéro les filtres et le
  tri de colonne de l'onglet affiché.
- **Colonnes à valeurs multiples** (jointes par la pipeline) : `descripteur_libelle`
  et `libelles_cpv` séparés par « ; » (leurs valeurs contiennent des virgules),
  `code_departement` et `pays` séparés par « , ».

## Sécurité

La page contient l'URL du projet Supabase et sa clé **publishable**, publique
par conception. N'y mettre **jamais** une clé secrète ou `service_role`.
L'accès est contrôlé côté Supabase (RLS, rôle `authenticated` seulement,
modification limitée aux colonnes `vue` et `note_humaine`, inscriptions
publiques désactivées). Le schéma et les droits sont maintenus dans le dépôt
privé de la pipeline.

## Publication

[`.github/workflows/pages.yml`](.github/workflows/pages.yml) déploie `web/` à
chaque push sur `main` qui modifie ce dossier. GitHub Pages met la page en
cache jusqu'à 10 minutes : après un déploiement, recharger avec
Cmd + Shift + R.

Pour tester en local :

```bash
python3 -m http.server 8000 --directory web   # puis http://localhost:8000
```
