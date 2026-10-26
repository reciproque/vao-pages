// --- Configuration Supabase (Project Settings → API Keys) -------------------
const SUPABASE_URL = "https://ebwifdmbdialwdsplhsl.supabase.co";
const SUPABASE_CLE_PUBLIQUE = "sb_publishable_PTTFRwEG-DEVQZYMbWqxaQ_kH6pDJda";

// Colonnes match_* de tagging.CLUSTERS (présentes dans toutes les tables) :
// libellé et couleur du badge. À garder synchronisé avec tagging.CLUSTERS.
const COULEURS_TAGS = {
  match_prestations: ["Prestations", "#42a016"],
  match_numerique_multimedia: ["Numérique / Multimédia", "#1e65b5"],
  match_museo_sceno: ["Muséo / Scéno", "#c7208a"],
  match_secteurs_transverses: ["Secteurs transverses", "#cd6409"],
  match_institutions: ["Institutions", "#931cae"],
};

// Colonnes lues dans toutes les tables.
const COLONNES_COMMUNES = [
  "idweb", "objet", "nomacheteur", "dateparution", "datelimitereponse",
  "url_avis", "score_similarite", "total_poles",
  "analyse_pertinence", "analyse_note", "vue", "note_humaine",
  "annotation_par", "annotation_le", ...Object.keys(COULEURS_TAGS),
];

const TAILLE_PAGE = 1000; // limite par défaut de l'API Supabase

const client = supabase.createClient(SUPABASE_URL, SUPABASE_CLE_PUBLIQUE);

const $ = (id) => document.getElementById(id);

// --- Utilitaires d'affichage ------------------------------------------------

function el(balise, proprietes = {}, enfants = []) {
  const noeud = document.createElement(balise);
  Object.assign(noeud, proprietes);
  for (const enfant of [].concat(enfants)) {
    if (enfant != null) noeud.append(enfant);
  }
  return noeud;
}

// Contenu d'une case (ou d'une ligne de case) sans valeur.
const VIDE = "_";
const tiret = () => el("span", { className: "vide", textContent: VIDE });

const DATE_SEULE = /^\d{4}-\d{2}-\d{2}$/;

function formaterDate(valeur, avecHeure = false) {
  if (!valeur) return "";
  // Date sans heure (AAAA-MM-JJ) : lue en heure locale, affichée sans heure.
  if (DATE_SEULE.test(valeur)) {
    const [a, m, j] = valeur.split("-");
    return `${j}/${m}/${a}`;
  }
  const date = new Date(valeur);
  if (isNaN(date)) return String(valeur);
  const options = { day: "2-digit", month: "2-digit", year: "numeric" };
  if (avecHeure) Object.assign(options, { hour: "2-digit", minute: "2-digit" });
  return date.toLocaleString("fr-FR", options);
}

// Date du jour (heure locale) au format AAAA-MM-JJ.
function aujourdhui() {
  const d = new Date();
  return [d.getFullYear(), d.getMonth() + 1, d.getDate()]
    .map((n) => String(n).padStart(2, "0")).join("-");
}

// Rouge (0) -> vert (5).
const couleurNote = (note) => `hsl(${(Math.max(0, Math.min(5, note)) / 5) * 120}, 70%, 42%)`;

function badgeNote(note) {
  const badge = el("span", { className: "badge-note", textContent: `${note}/5` });
  badge.style.background = couleurNote(note);
  return badge;
}

// Colonne à valeurs multiples jointes par la pipeline -> liste de valeurs.
// Séparateurs : " ; " pour descripteur_libelle et libelles_cpv (leurs valeurs
// contiennent des virgules), ", " pour code_departement et pays.
function decouper(valeur, separateur) {
  return (valeur || "").split(separateur).map((v) => v.trim()).filter(Boolean);
}

// Texte entièrement en majuscules -> seule la première lettre reste en majuscule.
function adoucirMajuscules(texte) {
  if (!texte || texte !== texte.toLocaleUpperCase("fr") || texte === texte.toLocaleLowerCase("fr")) return texte;
  const minuscules = texte.toLocaleLowerCase("fr");
  return minuscules.charAt(0).toLocaleUpperCase("fr") + minuscules.slice(1);
}

function lienSur(url) {
  try {
    const u = new URL(url);
    return u.protocol === "http:" || u.protocol === "https:" ? u.href : null;
  } catch {
    return null;
  }
}

// --- Libellés TED -----------------------------------------------------------

// Codes pays TED (ISO 3166-1 alpha-3) -> alpha-2, pour Intl.DisplayNames.
const PAYS_ALPHA2 = {
  ALB: "AL", AND: "AD", AUT: "AT", BEL: "BE", BGR: "BG", BIH: "BA", CHE: "CH",
  CYP: "CY", CZE: "CZ", DEU: "DE", DNK: "DK", ESP: "ES", EST: "EE", FIN: "FI",
  FRA: "FR", GBR: "GB", GEO: "GE", GRC: "GR", HRV: "HR", HUN: "HU", IRL: "IE",
  ISL: "IS", ITA: "IT", LIE: "LI", LTU: "LT", LUX: "LU", LVA: "LV", MDA: "MD",
  MKD: "MK", MLT: "MT", MNE: "ME", NLD: "NL", NOR: "NO", POL: "PL", PRT: "PT",
  ROU: "RO", SRB: "RS", SVK: "SK", SVN: "SI", SWE: "SE", TUR: "TR", UKR: "UA",
};
const NOMS_PAYS = new Intl.DisplayNames(["fr"], { type: "region" });

// "POL, DEU" -> "Pologne, Allemagne" (code brut si inconnu).
function nomsPays(codes) {
  return decouper(codes, ",").map(nomPays).join(", ");
}

function nomPays(code) {
  return PAYS_ALPHA2[code] ? NOMS_PAYS.of(PAYS_ALPHA2[code]) : code;
}

const TYPES_AVIS_TED = {
  "cn-standard": "Avis de marché",
  "cn-social": "Avis de marché (services sociaux)",
  "cn-desg": "Concours",
  "pin-cfc-standard": "Préinformation (mise en concurrence)",
  "pin-cfc-social": "Préinformation (services sociaux)",
};

const PROCEDURES_TED = {
  open: "Procédure ouverte",
  restricted: "Procédure restreinte",
  "neg-w-call": "Négociée avec mise en concurrence",
  "neg-wo-call": "Négociée sans mise en concurrence",
  "comp-dial": "Dialogue compétitif",
  "comp-tend": "Procédure concurrentielle avec négociation",
  innovation: "Partenariat d'innovation",
  "oth-single": "Autre procédure (une étape)",
  "oth-mult": "Autre procédure (plusieurs étapes)",
};

// --- Sources ----------------------------------------------------------------
// Les annonces des quatre tables sont réunies dans un seul tableau. Chaque
// source dit comment lire ses colonnes :
//   libelle        : nom affiché dans la colonne « Source » ;
//   table          : table Supabase lue et modifiée ;
//   colonnes       : colonnes lues en plus de COLONNES_COMMUNES ;
//   detailAcheteur : ligne grise sous l'acheteur ;
//   objet          : objet affiché ;
//   pays           : codes pays (ISO 3166-1 alpha-3), France pour les sources françaises ;
//   categories     : descripteurs (BOAMP) ou libellés CPV (TED), en liste ;
//   typeMarche, procedure : lignes de la colonne « Marché » (libellé, ou vide) ;
//   departements   : codes département, pour le filtre ;
//   description    : (facultatif) texte affiché, replié, sur une ligne sous l'annonce ;
//   recherche      : champs explorés par la recherche libre.

const FRANCE = ["FRA"];
const aucune = () => [];

const SOURCES = {
  boamp: {
    libelle: "BOAMP",
    table: "annonces_boamp",
    colonnes: ["code_departement", "famille_libelle", "descripteur_libelle", "procedure_libelle", "description"],
    detailAcheteur: (a) => a.code_departement,
    objet: (a) => a.objet,
    pays: () => FRANCE,
    categories: (a) => decouper(a.descripteur_libelle, ";"),
    typeMarche: (a) => a.famille_libelle,
    procedure: (a) => a.procedure_libelle,
    departements: (a) => decouper(a.code_departement, ","),
    // Extraite de l'avis complet ; absente si elle répète l'objet.
    description: (a) => a.description,
    recherche: (a) => [a.objet, a.nomacheteur, a.descripteur_libelle, a.description],
  },
  ted: {
    libelle: "TED",
    table: "annonces_ted",
    colonnes: ["objet_fr", "pays", "ville", "type_avis", "libelles_cpv", "procedure_libelle", "description", "description_fr"],
    detailAcheteur: (a) => a.ville,
    // Traduction automatique pour les avis non francophones, sinon l'objet d'origine.
    objet: (a) => a.objet_fr || a.objet,
    pays: (a) => decouper(a.pays, ","),
    categories: (a) => decouper(a.libelles_cpv, ";"),
    typeMarche: (a) => TYPES_AVIS_TED[a.type_avis] || a.type_avis,
    procedure: (a) => PROCEDURES_TED[a.procedure_libelle] || a.procedure_libelle,
    departements: aucune,
    // Description traduite pour les avis non francophones retenus, sinon l'originale
    // (avis francophones ; avis non retenus affichés pour leur évaluation par l'équipe).
    description: (a) => a.description_fr || a.description,
    recherche: (a) => [a.objet, a.objet_fr, a.nomacheteur, a.libelles_cpv, nomsPays(a.pays), a.description_fr || a.description],
  },
  place: {
    libelle: "PLACE",
    table: "annonces_place",
    colonnes: ["entite_publique", "procedure_libelle", "description"],
    detailAcheteur: (a) => a.entite_publique,
    // Intitulé de la consultation.
    objet: (a) => a.objet,
    pays: () => FRANCE,
    categories: aucune,
    typeMarche: () => null,
    procedure: (a) => a.procedure_libelle,
    departements: aucune,
    // Objet détaillé de la consultation ; absent s'il répète l'intitulé.
    description: (a) => a.description,
    recherche: (a) => [a.objet, a.nomacheteur, a.entite_publique, a.description],
  },
  aws: {
    libelle: "AWS",
    table: "annonces_aws",
    colonnes: ["rectificatif", "ville", "code_departement"],
    // Ville et département de l'acheteur (déduit de son code postal).
    detailAcheteur: (a) => [a.ville, a.code_departement && `(${a.code_departement})`].filter(Boolean).join(" "),
    objet: (a) => a.objet,
    pays: () => FRANCE,
    categories: aucune,
    typeMarche: (a) => (a.rectificatif ? "Avis rectificatif" : "Avis de marché"),
    procedure: () => null,
    departements: (a) => [a.code_departement],
    // Le mail d'alerte AWS ne donne pas de description ; « Publié le » est la date du mail.
    recherche: (a) => [a.objet, a.nomacheteur, a.ville],
  },
};
const ORDRE_SOURCES = Object.keys(SOURCES);

// Chargement par source : annonces, ligne « Dernière ingestion », erreur.
const etat = Object.fromEntries(ORDRE_SOURCES.map((cle) => [cle, {
  annonces: [], nouveautes: [], erreur: null, charge: false,
}]));
// Annonces de toutes les sources chargées, dans l'ordre de comparer.
let annonces = [];
// Filtres de colonne (clé du filtre -> Set des valeurs cochées) et tri de
// colonne ({ cle, sens } ou null) du tableau. Ils survivent au rechargement.
const affichage = { filtres: {}, tri: null };
let nbColonnes = 0; // pour le colspan de la ligne de description
// Descriptions dépliées ("source:idweb") : gardées ouvertes quand le tableau
// est redessiné (case « vue », évaluation, filtres).
const descriptionsOuvertes = new Set();

// --- Tri et filtres ---------------------------------------------------------

// Les plus récentes d'abord (dateparution, AAAA-MM-JJ). À date égale, même
// ordre que restitution.filtrer_trier_lignes : note LLM (sans note en dernier),
// puis nombre de pôles, puis score de similarité ; tout décroissant.
function comparer(a, b) {
  return (
    (b.dateparution || "").localeCompare(a.dateparution || "") ||
    (b.analyse_note ?? -1) - (a.analyse_note ?? -1) ||
    (b.total_poles ?? 0) - (a.total_poles ?? 0) ||
    (b.score_similarite ?? 0) - (a.score_similarite ?? 0)
  );
}

// Fin du délai de réponse en millisecondes, ou null si absente ou illisible.
// Date seule (TED) : l'avis reste ouvert jusqu'à la fin du jour limite.
function finDelai(limite) {
  if (!limite) return null;
  if (DATE_SEULE.test(limite)) {
    const [a, m, j] = limite.split("-").map(Number);
    return new Date(a, m - 1, j, 23, 59, 59, 999).getTime();
  }
  const date = new Date(limite).getTime();
  return isNaN(date) ? null : date;
}

function estExpiree(annonce) {
  const fin = finDelai(annonce.datelimitereponse);
  return fin != null && fin < Date.now();
}

const sourceDe = (annonce) => SOURCES[annonce.source];

// Filtres de colonne. Chaque filtre :
//   cle           : identifiant unique ;
//   colonne       : colonne dont l'en-tête porte le bouton (voir afficherEntetes) ;
//   libelle       : texte du bouton et titre de la liste ;
//   valeurs       : valeurs de l'annonce (liste, éventuellement vide) ;
//   libelleValeur : (facultatif) texte affiché pour une valeur ;
//   ordre         : (facultatif) tri des valeurs, alphabétique par défaut ;
//   libelleVide   : (facultatif) choix des annonces sans valeur.
// Les valeurs proposées sont celles des annonces chargées.
const FILTRES = [
  { cle: "source", colonne: "source", libelle: "Source", valeurs: (a) => [a.source],
    libelleValeur: (cle) => SOURCES[cle]?.libelle ?? cle,
    ordre: (x, y) => ORDRE_SOURCES.indexOf(x) - ORDRE_SOURCES.indexOf(y) },
  { cle: "departement", colonne: "acheteur", libelle: "Département", valeurs: (a) => sourceDe(a).departements(a) },
  { cle: "entite_publique", colonne: "acheteur", libelle: "Entité publique", valeurs: (a) => [a.entite_publique] },
  { cle: "pays", colonne: "pays", libelle: "Pays", valeurs: (a) => sourceDe(a).pays(a), libelleValeur: nomPays },
  { cle: "tags", colonne: "objet", libelle: "Tags", libelleVide: "Sans tag",
    valeurs: (a) => Object.keys(COULEURS_TAGS).filter((colonne) => a[colonne]),
    libelleValeur: (colonne) => COULEURS_TAGS[colonne]?.[0] ?? colonne },
  // Nombre de badges affichés (= total_poles), 0 compris.
  { cle: "nb_tags", colonne: "objet", libelle: "Nombre de tags",
    valeurs: (a) => [Object.keys(COULEURS_TAGS).filter((colonne) => a[colonne]).length],
    libelleValeur: (n) => (n === "0" ? "Aucun tag" : n === "1" ? "1 tag" : `${n} tags`),
    ordre: (x, y) => Number(y) - Number(x) },
  { cle: "categorie", colonne: "categories", libelle: "Descripteur / CPV", valeurs: (a) => sourceDe(a).categories(a) },
  { cle: "type_marche", colonne: "marche", libelle: "Type de marché", valeurs: (a) => [sourceDe(a).typeMarche(a)] },
  { cle: "procedure", colonne: "marche", libelle: "Procédure", valeurs: (a) => [sourceDe(a).procedure(a)] },
  { cle: "note_llm", colonne: "analyse", libelle: "Note", libelleVide: "Sans note",
    valeurs: (a) => (a.analyse_note == null ? [] : [a.analyse_note]),
    libelleValeur: (note) => `${note}/5`, ordre: (x, y) => Number(y) - Number(x) },
  { cle: "evaluation", colonne: "evaluation", libelle: "Évaluation", libelleVide: "Non évaluée",
    valeurs: (a) => (a.note_humaine == null ? [] : [a.note_humaine]),
    libelleValeur: (note) => EVALUATIONS.find(([n]) => String(n) === note)?.[1].replace("\n", " ") ?? note,
    ordre: (x, y) => Number(y) - Number(x) },
];

// Tris de colonne. valeur : nombre ou texte comparable, null si absente
// (toujours en dernier).
const TRIS = [
  { cle: "publication", colonne: "dates", libelle: "Publication", valeur: (a) => a.dateparution || null },
  { cle: "limite", colonne: "dates", libelle: "Limite", valeur: (a) => finDelai(a.datelimitereponse) },
  { cle: "score", colonne: "score", libelle: "Trier", valeur: (a) => a.score_similarite ?? null },
  { cle: "note_llm", colonne: "analyse", libelle: "Trier", valeur: (a) => a.analyse_note ?? null },
];

const NON_RENSEIGNE = ""; // valeur cochée pour retenir les annonces sans valeur
const COLLATION = new Intl.Collator("fr", { numeric: true, sensitivity: "base" });

// Valeurs distinctes et non vides d'une annonce pour un filtre, en texte.
function valeursFiltre(filtre, annonce) {
  return [...new Set(filtre.valeurs(annonce).map((v) => String(v ?? "").trim()).filter(Boolean))];
}

// OU entre les valeurs cochées d'un filtre.
function passeFiltre(filtre, annonce, cochees) {
  const valeurs = valeursFiltre(filtre, annonce);
  return valeurs.length ? valeurs.some((v) => cochees.has(v)) : cochees.has(NON_RENSEIGNE);
}

function annoncesVisibles() {
  const { filtres, tri } = affichage;
  const masquerVues = $("masquer-vues").checked;
  const masquerExpirees = $("masquer-expirees").checked;
  const depuis = $("depuis").value; // AAAA-MM-JJ, comparable à dateparution
  const recherche = $("recherche").value.trim().toLowerCase();
  const filtresActifs = FILTRES.filter((f) => filtres[f.cle]?.size);

  const visibles = annonces.filter((a) =>
    !(masquerVues && a.vue) &&
    !(masquerExpirees && estExpiree(a)) &&
    !(depuis && (a.dateparution || "") < depuis) &&
    !(recherche && !sourceDe(a).recherche(a)
      .some((champ) => (champ || "").toLowerCase().includes(recherche))) &&
    filtresActifs.every((f) => passeFiltre(f, a, filtres[f.cle]))
  );
  if (!tri) return visibles; // déjà dans l'ordre de comparer

  // Tri stable : à valeur égale, l'ordre de comparer est conservé.
  const { valeur } = TRIS.find((t) => t.cle === tri.cle);
  const signe = tri.sens === "asc" ? 1 : -1;
  return visibles
    .map((a) => [a, valeur(a)])
    .sort(([, x], [, y]) => {
      if (x == null || y == null) return (x == null) - (y == null);
      return signe * (x < y ? -1 : x > y ? 1 : 0);
    })
    .map(([a]) => a);
}

// Un clic : décroissant, puis croissant, puis retour au tri par défaut.
function changerTri(cle) {
  const courant = affichage.tri;
  affichage.tri =
    courant?.cle !== cle ? { cle, sens: "desc" }
    : courant.sens === "desc" ? { cle, sens: "asc" }
    : null;
  afficher();
}

// --- Liste de cases à cocher d'un filtre --------------------------------------

// Liste ouverte : { cle, noeud }. Elle est posée sur <body> en position fixe,
// pour ne pas être coupée par le défilement horizontal du tableau.
let panneau = null;

function fermerPanneau() {
  if (!panneau) return;
  panneau.noeud.remove();
  panneau = null;
  for (const bouton of document.querySelectorAll(".bouton-filtre[aria-expanded=true]")) {
    bouton.setAttribute("aria-expanded", "false");
  }
}

function basculerPanneau(filtre, bouton) {
  const dejaOuvert = panneau?.cle === filtre.cle;
  fermerPanneau();
  if (!dejaOuvert) ouvrirPanneau(filtre, bouton);
}

function ouvrirPanneau(filtre, bouton) {
  const cochees = (affichage.filtres[filtre.cle] ??= new Set());

  // Nombre d'annonces chargées par valeur ; une valeur cochée absente des
  // annonces (après rechargement) reste proposée pour pouvoir la décocher.
  const nombres = new Map();
  for (const annonce of annonces) {
    const valeurs = valeursFiltre(filtre, annonce);
    for (const v of valeurs.length ? valeurs : [NON_RENSEIGNE]) nombres.set(v, (nombres.get(v) || 0) + 1);
  }
  for (const v of cochees) if (!nombres.has(v)) nombres.set(v, 0);

  const libelle = (v) => (v === NON_RENSEIGNE
    ? filtre.libelleVide || "Non renseigné"
    : filtre.libelleValeur?.(v) ?? v);
  const valeurs = [...nombres.keys()].filter((v) => v !== NON_RENSEIGNE)
    .sort(filtre.ordre || ((x, y) => COLLATION.compare(libelle(x), libelle(y))));
  if (nombres.has(NON_RENSEIGNE)) valeurs.push(NON_RENSEIGNE);

  const cases = valeurs.map((v) => {
    const caseValeur = el("input", { type: "checkbox", checked: cochees.has(v) });
    caseValeur.addEventListener("change", () => {
      if (caseValeur.checked) cochees.add(v);
      else cochees.delete(v);
      afficher();
    });
    return el("label", {}, [
      caseValeur,
      el("span", { textContent: libelle(v) }),
      el("span", { className: "nombre", textContent: String(nombres.get(v)) }),
    ]);
  });

  const toutDecocher = el("button", { type: "button", textContent: "Tout décocher" });
  toutDecocher.addEventListener("click", () => {
    cochees.clear();
    for (const caseValeur of noeud.querySelectorAll("input")) caseValeur.checked = false;
    afficher();
  });
  const fermer = el("button", { type: "button", textContent: "Fermer" });
  fermer.addEventListener("click", fermerPanneau);

  const noeud = el("div", { className: "panneau-filtre", role: "dialog", ariaLabel: `Filtrer : ${filtre.libelle}` }, [
    el("div", { className: "titre-panneau", textContent: filtre.libelle }),
    el("div", { className: "liste" }, cases.length ? cases : el("label", { className: "vide", textContent: "Aucune valeur" })),
    el("div", { className: "actions" }, [toutDecocher, fermer]),
  ]);
  document.body.append(noeud);
  panneau = { cle: filtre.cle, noeud };
  bouton.setAttribute("aria-expanded", "true");
  positionnerPanneau();
}

// Sous son bouton (retrouvé par sa clé : les en-têtes sont reconstruits à
// chaque affichage), sans déborder de la fenêtre.
function positionnerPanneau() {
  if (!panneau) return;
  const bouton = document.querySelector(`.bouton-filtre[data-filtre="${panneau.cle}"]`);
  if (!bouton) return fermerPanneau();
  const rect = bouton.getBoundingClientRect();
  const { noeud } = panneau;
  const haut = Math.max(8, Math.min(rect.bottom + 4, innerHeight - 200));
  noeud.style.top = `${haut}px`;
  noeud.style.maxHeight = `${innerHeight - haut - 8}px`;
  noeud.style.left = `${Math.max(8, Math.min(rect.left, innerWidth - noeud.offsetWidth - 8))}px`;
}

// Clic hors de la liste ou Échap : fermeture. Défilement, redimensionnement :
// la liste suit son bouton.
document.addEventListener("pointerdown", (evenement) => {
  if (panneau && !panneau.noeud.contains(evenement.target) && !evenement.target.closest?.(".bouton-filtre")) {
    fermerPanneau();
  }
});
document.addEventListener("keydown", (evenement) => {
  if (evenement.key === "Escape") fermerPanneau();
});
document.addEventListener("scroll", (evenement) => {
  if (panneau && !panneau.noeud.contains(evenement.target)) positionnerPanneau();
}, true);
addEventListener("resize", positionnerPanneau);

// --- Rendu ------------------------------------------------------------------

function celluleVue(annonce) {
  const caseVue = el("input", { type: "checkbox", checked: annonce.vue, title: "Marquer comme vue" });
  caseVue.addEventListener("change", () =>
    enregistrer(annonce, { vue: caseVue.checked }));
  return el("td", { className: "case-vue" }, caseVue);
}

// Évaluation de l'équipe (note_humaine, 1 à 3) : libellé et couleur.
const EVALUATIONS = [
  [3, "Pertinent", "hsl(120, 70%, 36%)"],
  [2, "Partiellement\npertinent", "hsl(35, 90%, 45%)"],
  [1, "Non pertinent", "hsl(0, 70%, 45%)"],
];

function celluleNoteEquipe(annonce) {
  const boutons = EVALUATIONS.map(([note, libelle, couleur]) => {
    const bouton = el("button", { type: "button", textContent: libelle });
    if (annonce.note_humaine === note) {
      bouton.classList.add("active");
      bouton.style.background = couleur;
      bouton.title = "Cliquer pour retirer la note";
    }
    // Cliquer sur la note déjà choisie l'efface.
    bouton.addEventListener("click", () => enregistrer(
      annonce, { note_humaine: annonce.note_humaine === note ? null : note }));
    return bouton;
  });

  const trace = annonce.annotation_par
    ? el("div", { className: "trace", textContent:
        `${annonce.annotation_par}, le ${formaterDate(annonce.annotation_le, true)}` })
    : null;

  return el("td", { className: "note-equipe" }, [el("div", { className: "notes" }, boutons), trace]);
}

// En-têtes [texte, classe, colonne] : la colonne relie l'en-tête à ses tris
// (TRIS) et à ses filtres (FILTRES). Reconstruits à chaque affichage depuis
// affichage : rien de l'état des filtres ne vit dans le DOM.
function afficherEntetes() {
  const entetes = [
    ["Source", "", "source"],
    ["Acheteur", "col-acheteur", "acheteur"],
    ["Pays", "", "pays"],
    ["Objet", "col-objet", "objet"],
    ["Descripteurs / Libellés CPV", "", "categories"],
    ["Marché", "", "marche"],
    ["Dates", "", "dates"],
    ["Proximité sémantique", "", "score"],
    ["Analyse LLM", "col-analyse", "analyse"],
    ["Évaluation", "", "evaluation"],
    ["Vue", "", "vue"],
  ];
  nbColonnes = entetes.length;
  $("entetes").replaceChildren(...entetes.map(([texte, classe, colonne]) => enteteColonne(texte, classe, colonne)));
}

function enteteColonne(texte, classe, colonne) {
  const { filtres, tri } = affichage;

  const boutonsTri = TRIS.filter((t) => t.colonne === colonne).map((t) => {
    const sens = tri?.cle === t.cle ? tri.sens : null;
    const fleche = sens === "desc" ? "↓" : sens === "asc" ? "↑" : "↕";
    const bouton = el("button", {
      type: "button", className: sens ? "actif" : "", textContent: `${t.libelle} ${fleche}`,
      title: sens === "desc" ? "Tri décroissant (cliquer : croissant)"
        : sens === "asc" ? "Tri croissant (cliquer : tri par défaut)"
        : "Trier (décroissant)",
    });
    bouton.addEventListener("click", () => changerTri(t.cle));
    return bouton;
  });

  let filtreActif = false;
  const boutonsFiltre = FILTRES.filter((f) => f.colonne === colonne).map((f) => {
    const nbCochees = filtres[f.cle]?.size || 0;
    filtreActif ||= nbCochees > 0;
    const bouton = el("button", {
      type: "button", className: `bouton-filtre${nbCochees ? " actif" : ""}`,
      textContent: nbCochees ? `${f.libelle} (${nbCochees}) ▾` : `${f.libelle} ▾`,
      title: `Filtrer par ${f.libelle.toLowerCase()}`,
    });
    bouton.dataset.filtre = f.cle;
    bouton.setAttribute("aria-haspopup", "dialog");
    bouton.setAttribute("aria-expanded", String(panneau?.cle === f.cle));
    bouton.addEventListener("click", () => basculerPanneau(f, bouton));
    return bouton;
  });

  const controles = [...boutonsTri, ...boutonsFiltre];
  return el("th", { className: `${classe}${filtreActif ? " filtre-actif" : ""}` }, [
    texte,
    controles.length ? el("div", { className: "controles" }, controles) : null,
  ]);
}

// Une ou deux lignes de tableau par annonce : l'annonce, puis sa description
// (si la source en a une) et le lien vers l'avis.
function lignesAnnonce(annonce) {
  const source = sourceDe(annonce);
  const ligne = el("tr");
  ligne.classList.toggle("vue", annonce.vue);

  const badges = Object.entries(COULEURS_TAGS)
    .filter(([colonne]) => annonce[colonne])
    .map(([, [libelle, couleur]]) => {
      const badge = el("span", { className: "badge", textContent: libelle });
      badge.style.background = couleur;
      return badge;
    });

  const analyse = annonce.analyse_note == null && !annonce.analyse_pertinence
    ? [tiret()]
    : [
        annonce.analyse_note != null ? badgeNote(annonce.analyse_note) : null,
        annonce.analyse_pertinence
          ? el("div", { textContent: annonce.analyse_pertinence, style: "margin-top:6px;line-height:1.35;" })
          : null,
      ];

  const url = lienSur(annonce.url_avis);

  ligne.append(
    el("td", {}, el("span", { className: "etiquette-source", textContent: source.libelle })),
    el("td", {}, [
      el("div", { textContent: annonce.nomacheteur || VIDE }),
      el("div", { className: "gris", textContent: source.detailAcheteur(annonce) || VIDE }),
    ]),
    el("td", { textContent: source.pays(annonce).map(nomPays).join(", ") || VIDE }),
    el("td", {}, [
      el("div", { className: "objet", textContent: adoucirMajuscules(source.objet(annonce)) || VIDE }),
      el("div", {}, badges.length ? badges : tiret()),
    ]),
    el("td", { textContent: source.categories(annonce).join(" ; ") || VIDE }),
    el("td", {}, [
      el("div", { textContent: source.typeMarche(annonce) || VIDE }),
      el("div", { className: "gris", textContent: source.procedure(annonce) || VIDE }),
    ]),
    el("td", {}, [
      el("div", { textContent: `Publié le ${formaterDate(annonce.dateparution) || VIDE}` }),
      el("div", { className: "limite", textContent: `Limite : ${formaterDate(annonce.datelimitereponse, true) || VIDE}` }),
    ]),
    el("td", { className: "score", textContent: (annonce.score_similarite ?? 0).toFixed(3) }),
    el("td", {}, analyse),
    celluleNoteEquipe(annonce),
    celluleVue(annonce),
  );

  const description = source.description?.(annonce);
  if (!description && !url) return [ligne];
  ligne.classList.add("annonce-avec-description");
  // Repliée par défaut : seul « Lire la description » est visible.
  let depliant = null;
  if (description) {
    const cle = `${annonce.source}:${annonce.idweb}`;
    depliant = el("details", { open: descriptionsOuvertes.has(cle) }, [
      el("summary", { textContent: "Lire la description" }),
      el("div", { className: "texte-description", textContent: description }),
    ]);
    depliant.addEventListener("toggle", () => {
      if (depliant.open) descriptionsOuvertes.add(cle);
      else descriptionsOuvertes.delete(cle);
    });
  }
  const lienAvis = url
    ? el("a", { className: "lien-avis", href: url, target: "_blank", rel: "noopener", textContent: "Voir l'avis" })
    : null;
  const ligneDescription = el("tr", { className: "description" },
    el("td", { colSpan: nbColonnes }, [depliant, lienAvis]));
  ligneDescription.classList.toggle("vue", annonce.vue);
  return [ligne, ligneDescription];
}

function afficher() {
  afficherEntetes(); // état des tris et filtres
  // Une ligne « Dernière ingestion » par source chargée.
  $("nouveautes").replaceChildren(...ORDRE_SOURCES
    .filter((cle) => etat[cle].nouveautes.length)
    .map((cle) => el("div", {}, [el("span", { className: "nom-source", textContent: SOURCES[cle].libelle }), ...etat[cle].nouveautes])));

  const erreurs = ORDRE_SOURCES.filter((cle) => etat[cle].erreur).map((cle) =>
    el("div", { className: "erreur", textContent: `Erreur de chargement ${SOURCES[cle].libelle} : ${etat[cle].erreur}` }));
  const enCours = ORDRE_SOURCES.filter((cle) => !etat[cle].charge && !etat[cle].erreur);
  if (enCours.length === ORDRE_SOURCES.length) {
    $("compteur").replaceChildren("Chargement…");
    $("lignes").replaceChildren();
    return;
  }
  const visibles = annoncesVisibles();
  const nbVues = annonces.filter((a) => a.vue).length;
  const chargement = enCours.length
    ? ` (chargement en cours : ${enCours.map((cle) => SOURCES[cle].libelle).join(", ")})`
    : "";
  $("compteur").replaceChildren(
    `${visibles.length} annonces affichées sur ${annonces.length} — ` +
    `${nbVues} vues, ${annonces.length - nbVues} non vues${chargement}`,
    ...erreurs,
  );
  $("lignes").replaceChildren(...visibles.flatMap(lignesAnnonce));
  positionnerPanneau(); // en-têtes reconstruits, largeurs de colonnes changées
}

// --- Données ----------------------------------------------------------------

// Dernière ingestion : date de parution la plus récente de la table (même
// curseur que veille.pipeline). Compte toutes les annonces collectées ce jour-là
// (comptage côté Supabase, sans les télécharger) et, parmi elles, celles affichées.
async function calculerNouveautes(cle) {
  const { table } = SOURCES[cle];
  const { data, error } = await client
    .from(table)
    .select("dateparution")
    .not("dateparution", "is", null)
    .order("dateparution", { ascending: false })
    .limit(1);
  const jour = data?.[0]?.dateparution;
  if (error || !jour) return [];
  const { count, error: erreurComptage } = await client
    .from(table)
    .select("idweb", { count: "exact", head: true })
    .eq("dateparution", jour);
  const retenues = etat[cle].annonces.filter((a) => a.dateparution === jour).length;
  const enGras = el("strong", { textContent: `${retenues} retenues` });
  // Date surlignée : c'est elle qu'on regarde pour savoir si la source est à jour.
  const debut = ["dernière ingestion le ", el("mark", { className: "date-ingestion", textContent: formaterDate(jour) }), " : "];
  return erreurComptage ? [...debut, enGras] : [...debut, `${count} annonces collectées, dont `, enGras];
}

async function charger(cle) {
  const source = SOURCES[cle];
  const colonnes = [...COLONNES_COMMUNES, ...source.colonnes].join(",");
  const resultat = [];
  for (let debut = 0; ; debut += TAILLE_PAGE) {
    const { data, error } = await client
      .from(source.table)
      .select(colonnes)
      // Annonces retenues par la pipeline (sauf note LLM à 0), plus celles déjà
      // notées par l'équipe.
      .or("and(rapporte.eq.true,or(analyse_note.is.null,analyse_note.gt.0)),note_humaine.not.is.null")
      .order("idweb")
      .range(debut, debut + TAILLE_PAGE - 1);
    if (error) throw error;
    resultat.push(...data);
    if (data.length < TAILLE_PAGE) break;
  }
  for (const annonce of resultat) annonce.source = cle; // jamais renvoyé à Supabase
  etat[cle].annonces = resultat;
  etat[cle].charge = true;
  etat[cle].nouveautes = await calculerNouveautes(cle);
}

function reunirAnnonces() {
  annonces = ORDRE_SOURCES.flatMap((cle) => etat[cle].annonces).sort(comparer);
}

// Chaque source s'affiche dès qu'elle est chargée ; une erreur n'empêche pas
// l'affichage des autres.
async function chargerTout() {
  await Promise.all(ORDRE_SOURCES.map(async (cle) => {
    Object.assign(etat[cle], { annonces: [], nouveautes: [], erreur: null, charge: false });
    try {
      await charger(cle);
    } catch (erreur) {
      etat[cle].erreur = erreur.message;
    }
    reunirAnnonces();
    afficher();
  }));
}

async function enregistrer(annonce, modifications) {
  const { data, error } = await client
    .from(sourceDe(annonce).table)
    .update(modifications)
    .eq("idweb", annonce.idweb)
    .select("vue,note_humaine,annotation_par,annotation_le");

  if (error || !data?.length) {
    alert(`Enregistrement impossible : ${error?.message || "aucune ligne modifiée"}`);
    afficher(); // revient à l'état en base
    return;
  }
  Object.assign(annonce, data[0]);
  afficher();
}

// --- Session ----------------------------------------------------------------

function viderDonnees() {
  for (const cle of ORDRE_SOURCES) {
    Object.assign(etat[cle], { annonces: [], nouveautes: [], erreur: null, charge: false });
  }
  annonces = [];
}

async function afficherSelonSession(session) {
  $("connexion").hidden = !!session;
  $("application").hidden = !session;
  if (!session) return;
  $("email-utilisateur").textContent = session.user.email;
  // Ancien lien d'onglet (#ted) : la source est cochée dans le filtre « Source ».
  const ancienOnglet = location.hash.slice(1);
  if (SOURCES[ancienOnglet]) {
    affichage.filtres.source = new Set([ancienOnglet]);
    history.replaceState(null, "", location.pathname);
  }
  afficher();
  await chargerTout();
}

$("connexion").addEventListener("submit", async (evenement) => {
  evenement.preventDefault();
  $("erreur-connexion").textContent = "";
  const { data, error } = await client.auth.signInWithPassword({
    email: $("email").value,
    password: $("mot-de-passe").value,
  });
  if (error) {
    $("erreur-connexion").textContent = "Email ou mot de passe incorrect.";
    return;
  }
  afficherSelonSession(data.session);
});

$("deconnexion").addEventListener("click", async () => {
  await client.auth.signOut();
  viderDonnees();
  afficherSelonSession(null);
});

for (const id of ["masquer-vues", "masquer-expirees", "depuis", "recherche"]) {
  $(id).addEventListener("input", afficher);
}

// Filtres et tri de colonne ; les filtres du haut de page restent.
$("reinitialiser").addEventListener("click", () => {
  Object.assign(affichage, { filtres: {}, tri: null });
  fermerPanneau();
  afficher();
});

client.auth.getSession().then(({ data }) => afficherSelonSession(data.session));
