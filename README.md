# Veille appels d'offres — page de suivi (reciproque)

Page web de suivi des appels d'offres sélectionnés chaque matin par la
pipeline de veille de reciproque (sources BOAMP et TED). La pipeline vit dans
un dépôt privé ; ce dépôt public ne contient que la page.

**Page :** https://reciproque.github.io/vao-pages/
(accès sur identifiant, comptes créés dans Supabase).

## Fonctionnement

Fichier unique [`web/index.html`](web/index.html), sans étape de build. Elle
lit directement les tables Supabase `annonces_boamp` et `annonces_ted` (un
onglet par source) : rien n'est régénéré, les nouvelles annonces apparaissent
dès que la pipeline a tourné.

- **Annonces affichées** : celles retenues par la pipeline (hors note LLM 0),
  plus celles déjà évaluées par l'équipe.
- **Tri** : date de publication la plus récente d'abord ; à date égale, note
  LLM, puis nombre de pôles, puis score.
- **Saisie** : case « Vue » et évaluation de l'équipe (non pertinent,
  partiellement pertinent, pertinent).
- **Filtres** : communs aux deux onglets (vues, date limite passée, date de
  publication minimale, recherche texte).

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
