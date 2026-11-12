# Reponse — page de suivi des appels d'offres (reciproque)

Page web de suivi des appels d'offres sélectionnés chaque matin par la
pipeline de veille de reciproque. La pipeline vit dans un dépôt privé ; ce
dépôt public ne contient que la page.

**Page :** https://reciproque.github.io/vao-pages/
(accès sur identifiant, comptes créés dans Supabase).

## Fonctionnement

Trois fichiers, sans étape de build : [`web/index.html`](web/index.html)
(structure), [`web/style.css`](web/style.css) (styles) et
[`web/app.js`](web/app.js) (code). La page lit directement les tables
Supabase : rien n'est régénéré, les nouvelles annonces apparaissent dès que
la pipeline a tourné.

Trois onglets :
- **Appels d'offres** : un seul tableau pour toutes les sources (BOAMP, TED,
  PLACE, AWS, Simap, SafeTender, FTS), avec une colonne « Source » ;
- **Veille ciblée** : relevés des profils acheteurs surveillés (Dematis,
  achatpublic, sites d'institutions), avec une case « Vue » par profil ;
- **Statistiques** : par jour de publication, annonces collectées, uniques,
  sélectionnées, retenues et jugées pertinentes, toutes sources réunies puis
  pour chacune.

Dans l'onglet « Appels d'offres » :
- **Annonces affichées** : celles retenues par la pipeline (hors note LLM 0),
  plus celles déjà évaluées par l'équipe.
- **Tri** : par défaut, date de publication la plus récente d'abord ; à date
  égale, note LLM, puis nombre de pôles, puis score. Les en-têtes proposent
  aussi un tri par date de publication, date limite, proximité sémantique et
  note LLM (décroissant, puis croissant, puis retour au tri par défaut ; les
  annonces sans valeur toujours en dernier).
- **Saisie** : case « Vue » et évaluation de l'équipe (non pertinent,
  partiellement pertinent, pertinent).
- **Filtres** : généraux (vues, date limite passée, date de publication
  minimale, recherche texte), plus des filtres par colonne dans les en-têtes,
  communs à toutes les sources : source, département, entité publique
  (PLACE), pays, tags, nombre de
  tags, descripteurs et libellés CPV, type de marché, procédure, note LLM,
  évaluation. Les valeurs proposées viennent des annonces chargées, avec un
  choix « Non renseigné ». Plusieurs valeurs d'un même filtre s'additionnent
  (OU), des filtres différents se cumulent (ET). « Réinitialiser les filtres »
  remet à zéro les filtres et le tri de colonne.
- **Procédures** : libellés harmonisés par la pipeline, affichés tels quels.
  « Type de marché » ne montre que les catégories BOAMP, les concours, les
  préinformations et les rectificatifs.
- **Avis étrangers** (TED, Simap, FTS) : objet et description traduits
  automatiquement quand l'avis est proche du profil.
- **Colonnes à valeurs multiples** (jointes par la pipeline) :
  `descripteur_libelle` et `libelles_cpv` séparés par « ; » (leurs valeurs
  contiennent des virgules), `code_departement`, `pays` et `regions` séparés
  par « , ».

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
Cmd + Shift + R. Après chaque modification de `style.css` ou `app.js`,
augmenter leur numéro de version (`?v=N`) dans `index.html`.

Pour tester en local :

```bash
python3 -m http.server 8000 --directory web   # puis http://localhost:8000
```
