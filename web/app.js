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

// Date d'il y a `jours` jours (heure locale), au format AAAA-MM-JJ.
function ilYa(jours) {
  const d = new Date();
  d.setDate(d.getDate() - jours);
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

// --- Libellés Simap ---------------------------------------------------------

const TYPES_MARCHE_SIMAP = {
  construction: "Travaux",
  service: "Services",
  supply: "Fournitures",
};

const PROCEDURES_SIMAP = {
  open: "Procédure ouverte",
  selective: "Procédure sélective",
  invitation: "Procédure sur invitation",
  direct: "Procédure de gré à gré",
};

// --- Sources ----------------------------------------------------------------
// Les annonces des cinq tables sont réunies dans un seul tableau. Chaque
// source dit comment lire ses colonnes :
//   libelle        : nom affiché dans la colonne « Source » ;
//   table          : table Supabase lue et modifiée ;
//   colonnes       : colonnes lues en plus de COLONNES_COMMUNES ;
//   detailAcheteur : ligne grise sous l'acheteur ;
//   objet          : objet affiché ;
//   pays           : codes pays (ISO 3166-1 alpha-3), France pour les sources françaises ;
//   categories     : descripteurs (BOAMP) ou libellés CPV (TED, Simap), en liste ;
//   typeMarche, procedure : lignes de la colonne « Marché » (libellé, ou vide) ;
//   departements   : codes département, pour le filtre ;
//   description    : (facultatif) texte affiché, replié, sur une ligne sous l'annonce ;
//   recherche      : champs explorés par la recherche libre.

const FRANCE = ["FRA"];
const SUISSE = ["CHE"];
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
  simap: {
    libelle: "Simap",
    table: "annonces_simap",
    colonnes: ["objet_fr", "canton", "ville", "type_marche", "procedure_libelle", "libelles_cpv", "libelle_cpc", "description", "description_fr"],
    // Lieu d'exécution : ville et canton.
    detailAcheteur: (a) => [a.ville, a.canton && `(${a.canton})`].filter(Boolean).join(" "),
    // Traduction automatique pour les projets non francophones, sinon l'objet d'origine.
    objet: (a) => a.objet_fr || a.objet,
    pays: () => SUISSE,
    // Catégorie CPC à part : son libellé contient des « ; ».
    categories: (a) => [...decouper(a.libelles_cpv, ";"), a.libelle_cpc].filter(Boolean),
    typeMarche: (a) => TYPES_MARCHE_SIMAP[a.type_marche] || a.type_marche,
    procedure: (a) => PROCEDURES_SIMAP[a.procedure_libelle] || a.procedure_libelle,
    departements: aucune,
    // Comme TED : description traduite pour les projets non francophones retenus.
    description: (a) => a.description_fr || a.description,
    recherche: (a) => [a.objet, a.objet_fr, a.nomacheteur, a.ville, a.libelles_cpv, a.libelle_cpc, a.description_fr || a.description],
  },
};
const ORDRE_SOURCES = Object.keys(SOURCES);

// Chargement par source : annonces, erreur.
const etat = Object.fromEntries(ORDRE_SOURCES.map((cle) => [cle, {
  annonces: [], erreur: null, charge: false,
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
// Les valeurs proposées et leurs nombres sont ceux des annonces affichées,
// sans tenir compte du filtre lui-même (voir ouvrirPanneau).
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

// Annonces qui passent les filtres du haut de page et les filtres de colonne,
// sauf celui de clé `sauf` (pour les nombres de sa liste), sans tri de colonne.
function annoncesFiltrees(sauf = null) {
  const { filtres } = affichage;
  const masquerVues = $("masquer-vues").checked;
  const masquerExpirees = $("masquer-expirees").checked;
  const depuis = $("depuis").value; // AAAA-MM-JJ, comparable à dateparution
  const recherche = $("recherche").value.trim().toLowerCase();
  const filtresActifs = FILTRES.filter((f) => f.cle !== sauf && filtres[f.cle]?.size);

  return annonces.filter((a) =>
    !(masquerVues && a.vue) &&
    !(masquerExpirees && estExpiree(a)) &&
    !(depuis && (a.dateparution || "") < depuis) &&
    !(recherche && !sourceDe(a).recherche(a)
      .some((champ) => (champ || "").toLowerCase().includes(recherche))) &&
    filtresActifs.every((f) => passeFiltre(f, a, filtres[f.cle]))
  );
}

function annoncesVisibles() {
  const { tri } = affichage;
  const visibles = annoncesFiltrees();
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

  // Nombre d'annonces affichées par valeur, en ignorant ce filtre-ci : cocher
  // une valeur ne fait pas tomber à 0 les autres valeurs de la liste. Une
  // valeur cochée absente de ces annonces reste proposée pour pouvoir la décocher.
  const nombres = new Map();
  for (const annonce of annoncesFiltrees(filtre.cle)) {
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
}

function reunirAnnonces() {
  annonces = ORDRE_SOURCES.flatMap((cle) => etat[cle].annonces).sort(comparer);
}

// Chaque source s'affiche dès qu'elle est chargée ; une erreur n'empêche pas
// l'affichage des autres.
async function chargerTout() {
  await Promise.all(ORDRE_SOURCES.map(async (cle) => {
    Object.assign(etat[cle], { annonces: [], erreur: null, charge: false });
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

// --- Veille ciblée ----------------------------------------------------------
// Relevés de la veille des profils acheteurs (table veille_profils, écrite par
// la pipeline les mercredis et dimanches) : un par profil (url) et par jour de
// vérification. La page n'y écrit que vue (case « Vue », cochée sur le dernier
// relevé réussi du profil) ; la colonne etat ne lui est pas accessible.

const TABLE_VEILLE = "veille_profils";
const JOURS_HISTORIQUE_VEILLE = 60;
const PLATEFORMES = {
  dematis: "Dematis (e-marchespublics.com)",
  achatpublic: "Salle des marchés (achatpublic.com)",
  institutions: "Site de l'institution",
};
const ORDRE_PLATEFORMES = Object.keys(PLATEFORMES);

const veille = { profils: [], villes: new Map(), erreur: null, charge: false, depuis: null };

// Relevés d'un profil (du plus récent au plus ancien) -> ce qu'affiche sa ligne.
// Les relevés remontent au dernier vu s'il est plus ancien que la période
// affichée (voir chargerVeille).
function resumerProfil(releves) {
  const [dernier] = releves;
  const reussis = releves.filter((r) => !r.erreur);
  // Erreur en cours : date du premier relevé de la série d'erreurs.
  const finSerie = releves.findIndex((r) => !r.erreur);
  const erreurDepuis = dernier.erreur ? releves[(finSerie === -1 ? releves.length : finSerie) - 1].jour : null;
  // Alertes de la pipeline, sans le « nom : » de tête ni l'adresse du profil
  // (déjà dans la colonne Institution). Le nom en tête est celui du jour de
  // l'alerte : un profil renommé depuis a un autre nom dans veille_profils,
  // d'où la coupe au premier « : » plutôt que sur le nom.
  const nouveautes = releves.flatMap((r) => (r.nouveautes || []).map((texte) => {
    const separateur = texte.split("\n")[0].indexOf(" : ");
    return {
      jour: r.jour,
      texte: (separateur === -1 ? texte : texte.slice(separateur + 3)).replaceAll(`  ${r.url}`, ""),
    };
  }));
  const profil = {
    nom: dernier.nom, plateforme: dernier.plateforme, url: dernier.url, releves, dernier,
    reussi: reussis[0] ?? null, vu: reussis.find((r) => r.vue) ?? null, erreurDepuis, nouveautes,
  };
  profil.bilan = bilanNouveautes(profil);
  return profil;
}

// Profils à voir d'abord, puis ceux aux nouveautés les plus récentes, puis par
// plateforme et nom.
function comparerProfils(a, b) {
  return (
    Number(!!b.bilan?.aVoir) - Number(!!a.bilan?.aVoir) ||
    (b.nouveautes[0]?.jour || "").localeCompare(a.nouveautes[0]?.jour || "") ||
    ORDRE_PLATEFORMES.indexOf(a.plateforme) - ORDRE_PLATEFORMES.indexOf(b.plateforme) ||
    COLLATION.compare(a.nom, b.nom)
  );
}

async function chargerVeille() {
  Object.assign(veille, { profils: [], villes: new Map(), erreur: null, charge: false });
  const jourDepuis = ilYa(JOURS_HISTORIQUE_VEILLE);
  try {
    // Dernier relevé vu de chaque profil : les nouveautés se comptent depuis
    // celui-là, même s'il est plus ancien que la période affichée.
    const { data: vus, error: erreurVus } = await client
      .from(TABLE_VEILLE)
      .select("url,jour")
      .eq("vue", true)
      .order("jour", { ascending: false })
      .range(0, TAILLE_PAGE - 1);
    if (erreurVus) throw erreurVus;
    const dernierVu = new Map();
    for (const { url, jour } of vus) if (!dernierVu.has(url)) dernierVu.set(url, jour);
    const premierJour = [jourDepuis, ...dernierVu.values()].sort()[0];

    // Ville : enregistrée une seule fois par profil, sur un relevé qui peut être
    // plus ancien que la période ; les autres relevés l'ont à NULL.
    const { data: villes, error: erreurVilles } = await client
      .from(TABLE_VEILLE)
      .select("url,ville")
      .not("ville", "is", null)
      .range(0, TAILLE_PAGE - 1);
    if (erreurVilles) throw erreurVilles;
    veille.villes = new Map(villes.map(({ url, ville }) => [url, ville]));

    const releves = [];
    for (let debut = 0; ; debut += TAILLE_PAGE) {
      const { data, error } = await client
        .from(TABLE_VEILLE)
        .select("id,jour,plateforme,nom,url,nb_offres,nouveautes,erreur,vue,vue_par,vue_le")
        .gte("jour", premierJour)
        .order("jour", { ascending: false })
        .order("id")
        .range(debut, debut + TAILLE_PAGE - 1);
      if (error) throw error;
      releves.push(...data);
      if (data.length < TAILLE_PAGE) break;
    }
    const parUrl = new Map();
    for (const r of releves) {
      if (!parUrl.has(r.url)) parUrl.set(r.url, []);
      parUrl.get(r.url).push(r);
    }
    veille.depuis = jourDepuis;
    veille.profils = [...parUrl.values()].map(resumerProfil).sort(comparerProfils);
    veille.charge = true;
  } catch (erreur) {
    veille.erreur = erreur.message;
  }
  afficherVeille();
}

function celluleOffres(profil) {
  const { reussi, dernier } = profil;
  if (!reussi) return el("td", {}, tiret());
  if (reussi.nb_offres == null) return el("td", { className: "gris", textContent: "Non comptées" });
  const contenu = [el("span", { textContent: String(reussi.nb_offres) })];
  // Profil en erreur : dernier nombre connu.
  if (dernier.erreur) contenu.push(el("div", { className: "gris", textContent: `au ${formaterDate(reussi.jour)}` }));
  return el("td", {}, contenu);
}

// Nombre d'annonces nouvelles d'une alerte : Dematis en signale plusieurs à la
// fois (« 2 nouvel(s) avis de marché (7 -> 9) »), achatpublic une par alerte.
function nombreAnnonces(texte) {
  return Number(texte.match(/^(\d+) nouvel/)?.[1] ?? 1);
}

const texteNouvelles = (n) => (n === 1 ? "1 nouvelle annonce" : `${n} nouvelles annonces`);

// Bilan en tête de la colonne Nouveautés : { aVoir, texte }, ou null sans
// relevé réussi. Les nouveautés sont celles des relevés réussis postérieurs au
// dernier coché « Vue ». Profil jamais vu : tout ce que la page affiche est
// nouveau (offres en cours, ou la page entière pour un site d'institution).
function bilanNouveautes(profil) {
  if (!profil.reussi) return null;
  const institution = profil.plateforme === "institutions";
  const { vu } = profil;
  if (!vu) {
    const n = profil.reussi.nb_offres;
    if (institution) return { aVoir: true, texte: "Changement détecté" };
    return n > 0 ? { aVoir: true, texte: texteNouvelles(n) } : { aVoir: false, texte: "Pas de nouveauté" };
  }
  // Alertes sans le « nom : » de tête (voir resumerProfil).
  const alertes = profil.nouveautes.filter((n) => n.jour > vu.jour).map((n) => n.texte);
  if (!alertes.length) return { aVoir: false, texte: "Pas de nouveauté" };
  if (institution) return { aVoir: true, texte: "Changement détecté" };
  return { aVoir: true, texte: texteNouvelles(alertes.reduce((total, texte) => total + nombreAnnonces(texte), 0)) };
}

// Case « Vue » : cochée tant qu'aucune alerte n'a suivi le dernier relevé vu ;
// une nouvelle annonce la décoche. La cocher marque vu le dernier relevé réussi
// (bilan « Pas de nouveauté » jusqu'à la prochaine alerte) ; la décocher retire
// la marque du relevé vu, le bilan repart alors du relevé vu précédent.
function celluleVueProfil(profil) {
  const { reussi, vu, bilan } = profil;
  if (!reussi) return el("td", { className: "case-vue" }, tiret());
  const cochee = !!vu && !bilan.aVoir;
  const caseVue = el("input", { type: "checkbox", checked: cochee, title: "Marquer les nouveautés comme vues" });
  caseVue.addEventListener("change", () => enregistrerVue(profil, caseVue.checked));
  const trace = cochee && vu.vue_par
    ? el("div", { className: "trace", textContent: `${vu.vue_par}, le ${formaterDate(vu.vue_le, true)}` })
    : null;
  return el("td", { className: "case-vue" }, [caseVue, trace]);
}

async function enregistrerVue(profil, vue) {
  const releve = vue ? profil.reussi : profil.vu;
  const { data, error } = await client
    .from(TABLE_VEILLE)
    .update({ vue })
    .eq("id", releve.id)
    .select("vue,vue_par,vue_le");
  if (error || !data?.length) {
    alert(`Enregistrement impossible : ${error?.message || "aucune ligne modifiée"}`);
  } else {
    Object.assign(releve, data[0]);
    // Même place dans le tableau : le tri n'est refait qu'au chargement.
    const i = veille.profils.indexOf(profil);
    veille.profils[i] = resumerProfil(profil.releves);
  }
  afficherVeille();
}

// Texte d'alerte -> nœuds, adresses http(s) transformées en liens.
function texteAvecLiens(texte) {
  return texte.split(/(https?:\/\/\S+)/).map((morceau, i) => {
    const url = i % 2 ? lienSur(morceau) : null;
    return url ? el("a", { href: url, target: "_blank", rel: "noopener", textContent: "lien" }) : morceau;
  });
}

function ligneProfil(profil) {
  const url = lienSur(profil.url);
  const { bilan } = profil;
  // Bilan, puis le détail daté de la période affichée.
  const nouveautes = [
    bilan ? el("div", { className: `bilan ${bilan.aVoir ? "avec-nouveaute" : "sans-nouveaute"}`, textContent: bilan.texte }) : null,
    ...profil.nouveautes.filter((n) => n.jour >= veille.depuis).map((n) => el("div", { className: "nouveaute" }, [
      el("span", { className: "jour", textContent: formaterDate(n.jour) }), ...texteAvecLiens(n.texte),
    ])),
  ].filter(Boolean);
  return el("tr", {}, [
    celluleVueProfil(profil),
    el("td", {}, [
      el("div", { className: "objet", textContent: profil.nom }),
      url ? el("a", { href: url, target: "_blank", rel: "noopener", textContent: "Voir la page" }) : null,
    ]),
    el("td", {}, veille.villes.get(profil.url) || tiret()),
    el("td", { textContent: PLATEFORMES[profil.plateforme] || profil.plateforme }),
    celluleOffres(profil),
    el("td", {}, nouveautes.length ? nouveautes : tiret()),
    el("td", {}, [
      el("div", { textContent: formaterDate(profil.dernier.jour) }),
      profil.dernier.erreur
        ? el("div", { className: "erreur-veille", textContent:
            `En erreur depuis le ${formaterDate(profil.erreurDepuis)} : ${profil.dernier.erreur}` })
        : null,
    ]),
  ]);
}

function afficherVeille() {
  if (veille.erreur) {
    $("compteur-veille").textContent = `Erreur de chargement : ${veille.erreur}`;
    $("lignes-veille").replaceChildren();
    return;
  }
  if (!veille.charge) {
    $("compteur-veille").textContent = "Chargement…";
    $("lignes-veille").replaceChildren();
    return;
  }
  const { profils } = veille;
  if (!profils.length) {
    $("compteur-veille").textContent = `Aucune vérification depuis ${JOURS_HISTORIQUE_VEILLE} jours.`;
    $("lignes-veille").replaceChildren();
    return;
  }
  const derniere = profils.map((p) => p.dernier.jour).sort().at(-1);
  const enErreur = profils.filter((p) => p.dernier.erreur).length;
  const aVoir = profils.filter((p) => p.bilan?.aVoir).length;
  $("compteur-veille").replaceChildren(
    `${profils.length} profils suivis — dernière vérification le `,
    el("strong", { textContent: formaterDate(derniere) }),
    ` — ${aVoir} avec des nouveautés à voir` + (enErreur ? `, ${enErreur} en erreur` : ""),
  );
  $("lignes-veille").replaceChildren(...profils.map(ligneProfil));
}

// --- Onglet « Statistiques » ------------------------------------------------
// Vue statistiques_quotidiennes (sql/schema_supabase.sql du dépôt de la
// pipeline) : par source et par jour de publication, annonces collectées
// (enregistrées en base), sélectionnées (rapporte, envoyées au LLM) et
// retenues (affichées, même règle que la page). Un graphique en barres
// empilées pour l'ensemble des sources (sélectionnées et retenues seulement),
// puis un par source (les trois étapes) ; les chiffres sont aussi dans un
// tableau replié sous les graphiques.

const VUE_STATISTIQUES = "statistiques_quotidiennes";
const JOURS_STATISTIQUES = 20;
// Étapes emboîtées, de la plus large à la plus étroite. Rampe d'un seul brun
// « cacao », du caramel au chocolat (validée : ordre de clarté, écarts
// visibles, contraste du plus clair sur fond blanc). La légende est construite
// à partir de cette liste.
const MESURES = [
  { cle: "recuperees", libelle: "Collectées", legende: "Collectées", titre: "Enregistrées en base après les filtres de collecte", couleur: "#d4a373" },
  { cle: "analysees_llm", libelle: "Sélectionnées", legende: "Sélectionnées (envoyées au LLM)", titre: "Retenues par le seuil de score, envoyées au LLM", couleur: "#9a5b2e" },
  { cle: "affichees", libelle: "Retenues", legende: "Retenues (affichées)", titre: "Visibles dans l'onglet Appels d'offres", couleur: "#4a2511" },
];
// Graphique « Toutes sources » : sans les collectées, qui écraseraient le reste.
const MESURES_TOTAL = MESURES.slice(1);
// Colonnes du tableau des chiffres : les trois étapes, plus les annonces notées
// « pertinent » par l'équipe (pas dans les graphiques).
const COLONNES_CHIFFRES = [
  ...MESURES,
  { cle: "pertinentes", libelle: "Pertinentes", titre: "Notées « pertinent » par l'équipe" },
];

const statistiques = { lignes: [], erreur: null, charge: false };

async function chargerStatistiques() {
  Object.assign(statistiques, { lignes: [], erreur: null, charge: false });
  try {
    const { data, error } = await client
      .from(VUE_STATISTIQUES)
      .select(`source,jour,${COLONNES_CHIFFRES.map(({ cle }) => cle).join(",")}`)
      .gte("jour", ilYa(JOURS_STATISTIQUES - 1))
      .range(0, TAILLE_PAGE - 1);
    if (error) throw error;
    statistiques.lignes = data;
    statistiques.charge = true;
  } catch (erreur) {
    statistiques.erreur = erreur.message;
  }
  afficherStatistiques();
}

const vides = () => Object.fromEntries(COLONNES_CHIFFRES.map(({ cle }) => [cle, 0]));

// Séries par jour (tous les jours de la période, y compris sans annonce) :
// { total: [mesures…], boamp: […], … }, dans l'ordre de `jours`.
function series(jours) {
  const index = new Map(jours.map((jour, i) => [jour, i]));
  const resultat = { total: jours.map(vides) };
  for (const cle of ORDRE_SOURCES) resultat[cle] = jours.map(vides);
  for (const ligne of statistiques.lignes) {
    const i = index.get(ligne.jour);
    if (i == null || !resultat[ligne.source]) continue;
    for (const { cle } of COLONNES_CHIFFRES) {
      resultat[ligne.source][i][cle] += ligne[cle];
      resultat.total[i][cle] += ligne[cle];
    }
  }
  return resultat;
}

const SVG = "http://www.w3.org/2000/svg";

function svg(balise, attributs = {}, enfants = []) {
  const noeud = document.createElementNS(SVG, balise);
  for (const [nom, valeur] of Object.entries(attributs)) noeud.setAttribute(nom, valeur);
  for (const enfant of [].concat(enfants)) if (enfant != null) noeud.append(enfant);
  return noeud;
}

// Axe vertical : { pas, maxY }, la borne la plus basse au-dessus de max parmi
// les pas « ronds » et entiers (1, 2, 2,5, 5 × 10^n) donnant 2 à 6 intervalles.
// À borne égale, le nombre d'intervalles le plus proche de 4. Ex. : 101 -> 120
// par 20 (et non 150 par 50), 177 -> 200 par 50, 217 -> 250 par 50.
function axeVertical(max) {
  max = Math.max(max, 1);
  const candidats = [];
  for (let puissance = 1; puissance <= max; puissance *= 10) {
    for (const m of [1, 2, 2.5, 5]) {
      const pas = m * puissance;
      const intervalles = Math.ceil(max / pas);
      if (Number.isInteger(pas) && intervalles >= 2 && intervalles <= 6) candidats.push({ pas, maxY: pas * intervalles, intervalles });
    }
  }
  candidats.sort((a, b) => a.maxY - b.maxY || Math.abs(a.intervalles - 4) - Math.abs(b.intervalles - 4));
  return candidats[0] ?? { pas: 1, maxY: Math.max(2, Math.ceil(max)) };
}

// Rectangle aux coins du haut arrondis (bout de barre), carré sur la base.
function barreArrondie(x, y, largeur, hauteur, rayon) {
  const r = Math.min(rayon, largeur / 2, hauteur);
  return `M${x},${y + hauteur}V${y + r}Q${x},${y} ${x + r},${y}H${x + largeur - r}` +
    `Q${x + largeur},${y} ${x + largeur},${y + r}V${y + hauteur}Z`;
}

// Segments disjoints d'une barre, de la base vers le haut : retenues,
// sélectionnées non retenues, puis (si `mesures` les contient) le reste des
// collectées. La barre mesure donc la plus large des étapes montrées. Les
// annonces évaluées par l'équipe sont affichées même non sélectionnées : le
// segment du milieu ne descend pas sous zéro.
function segments(valeurs, mesures) {
  const retenues = valeurs.affichees;
  const selection = Math.max(valeurs.analysees_llm - retenues, 0);
  return [
    { mesure: MESURES[2], n: retenues },
    { mesure: MESURES[1], n: selection },
    { mesure: MESURES[0], n: Math.max(valeurs.recuperees - retenues - selection, 0) },
  ].filter((segment) => mesures.includes(segment.mesure));
}

const hauteurBarre = (valeurs, mesures) => segments(valeurs, mesures).reduce((somme, s) => somme + s.n, 0);

const MARGES = { haut: 10, droite: 24, bas: 24, gauche: 40 };
const HAUTEUR_GRAPHIQUE = 190;

// mesures : étapes montrées (MESURES, ou MESURES_TOTAL) ; le titre compte la
// plus large sur la période.
function graphique(titre, jours, donnees, largeur, mesures = MESURES) {
  const large = mesures[0];
  const total = donnees.reduce((somme, v) => somme + v[large.cle], 0);
  const carte = el("div", { className: "graphique" }, [
    el("div", { className: "titre-graphique" }, [
      el("span", { textContent: titre }),
      el("span", { className: "gris", textContent:
        ` — ${total} annonce${total > 1 ? "s" : ""} ${large.libelle.toLowerCase().replace(/s$/, total > 1 ? "s" : "")}` }),
    ]),
  ]);
  const largeurTrace = largeur - MARGES.gauche - MARGES.droite;
  const hauteurTrace = HAUTEUR_GRAPHIQUE - MARGES.haut - MARGES.bas;
  const hauteurs = donnees.map((v) => hauteurBarre(v, mesures));
  const { pas, maxY } = axeVertical(Math.max(...hauteurs));
  const y = (n) => MARGES.haut + hauteurTrace * (1 - n / maxY);
  const bande = largeurTrace / jours.length;
  const largeurBarre = Math.min(24, bande * 0.7);
  // Une date toutes les `tous` barres, pour qu'elles ne se chevauchent pas.
  const tous = Math.ceil(jours.length / Math.max(1, Math.floor(largeurTrace / 48)));

  const fond = svg("g");
  const grille = svg("g");
  for (let n = 0; n <= maxY; n += pas) {
    grille.append(
      svg("line", { x1: MARGES.gauche, x2: largeur - MARGES.droite, y1: y(n), y2: y(n), class: n ? "grille" : "base" }),
      svg("text", { x: MARGES.gauche - 6, y: y(n), class: "graduation", "text-anchor": "end", "dominant-baseline": "middle" }, String(n)),
    );
  }
  const barres = svg("g");
  jours.forEach((jour, i) => {
    const x0 = MARGES.gauche + i * bande;
    const x = x0 + (bande - largeurBarre) / 2;
    const zone = svg("rect", { x: x0, y: MARGES.haut, width: bande, height: hauteurTrace, class: "zone-survol" });
    zone.addEventListener("pointerenter", (e) => montrerInfobulle(e, jour, donnees[i], mesures));
    zone.addEventListener("pointermove", placerInfobulle);
    zone.addEventListener("pointerleave", cacherInfobulle);
    fond.append(zone);

    // Segments jointifs, sans espace entre eux : chacun est dessiné de la base
    // jusqu'à son sommet cumulé, du plus haut au plus bas, chaque segment
    // recouvrant le bas du précédent (pas de liseré d'anticrénelage entre deux).
    const visibles = segments(donnees[i], mesures).filter((s) => s.n > 0);
    let cumul = visibles.reduce((somme, s) => somme + s.n, 0);
    visibles.slice().reverse().forEach((segment, j) => {
      const haut = y(cumul);
      const hauteur = y(0) - haut;
      barres.append(j === 0
        ? svg("path", { d: barreArrondie(x, haut, largeurBarre, hauteur, 4), fill: segment.mesure.couleur })
        : svg("rect", { x, y: haut, width: largeurBarre, height: hauteur, fill: segment.mesure.couleur }));
      cumul -= segment.n;
    });
    // Dates comptées depuis la plus récente, toujours affichée.
    if ((jours.length - 1 - i) % tous === 0) {
      barres.append(svg("text", { x: x0 + bande / 2, y: HAUTEUR_GRAPHIQUE - 6, class: "graduation", "text-anchor": "middle" },
        formaterDate(jour).slice(0, 5)));
    }
  });
  carte.append(svg("svg", {
    width: largeur, height: HAUTEUR_GRAPHIQUE, role: "img",
    "aria-label": `${titre} : annonces ${mesures.map((m) => m.libelle.toLowerCase()).join(", ")} par jour`,
  }, [fond, grille, barres]));
  return carte;
}

// --- Infobulle (une pour tous les graphiques) ---

function montrerInfobulle(evenement, jour, valeurs, mesures) {
  const bulle = $("infobulle-statistiques");
  bulle.replaceChildren(
    el("div", { className: "jour", textContent: formaterDate(jour) }),
    ...mesures.map(({ cle, libelle, couleur }) => {
      const trait = el("span", { className: "trait" });
      trait.style.background = couleur;
      return el("div", { className: "ligne-infobulle" }, [
        trait, el("strong", { textContent: String(valeurs[cle]) }), el("span", { className: "gris", textContent: libelle }),
      ]);
    }),
  );
  bulle.hidden = false;
  placerInfobulle(evenement);
}

function placerInfobulle(evenement) {
  const bulle = $("infobulle-statistiques");
  // Sous le pointeur, au-dessus s'il manque de place en bas ; jamais hors de la fenêtre.
  const x = Math.min(evenement.clientX + 14, window.innerWidth - bulle.offsetWidth - 8);
  const dessous = evenement.clientY + 14;
  const y = dessous + bulle.offsetHeight > window.innerHeight - 8 ? evenement.clientY - bulle.offsetHeight - 14 : dessous;
  bulle.style.left = `${x}px`;
  bulle.style.top = `${Math.max(y, 8)}px`;
}

function cacherInfobulle() {
  $("infobulle-statistiques").hidden = true;
}

// « 4,2 % », ou un tiret si le dénominateur est nul.
function pourcentage(n, total) {
  return total ? `${(100 * n / total).toLocaleString("fr-FR", { maximumFractionDigits: 1 })} %` : VIDE;
}

// Ratios de chaque ligne (colonne « Ratio ») : rien pour les collectées,
// sélectionnées / collectées, retenues / collectées et / sélectionnées,
// pertinentes / collectées et / retenues. [numérateur, dénominateur, précision].
const RATIOS = {
  recuperees: [],
  analysees_llm: [["analysees_llm", "recuperees", "des coll."]],
  affichees: [["affichees", "recuperees", "des coll."], ["affichees", "analysees_llm", "des sél."]],
  pertinentes: [["pertinentes", "recuperees", "des coll."], ["pertinentes", "affichees", "des ret."]],
};

// Tableau des chiffres, toutes sources réunies : une ligne par mesure
// (COLONNES_CHIFFRES), puis le total et les ratios de la période, puis une
// colonne par jour, le plus récent d'abord.
function tableauStatistiques(jours, total) {
  const totaux = total.reduce((t, v) => {
    for (const { cle } of COLONNES_CHIFFRES) t[cle] += v[cle];
    return t;
  }, vides());
  const ordre = jours.map((_, i) => i).reverse();
  const ratio = (cle) => RATIOS[cle].map(([n, d, precision]) => el("div", {}, [
    pourcentage(totaux[n], totaux[d]), el("span", { className: "gris", textContent: ` ${precision}` }),
  ]));
  $("entetes-statistiques").replaceChildren(el("tr", {}, [
    el("th", { textContent: "Toutes sources" }),
    el("th", { className: "nombre total", textContent: "Total" }),
    el("th", { className: "nombre ratio", textContent: "Ratio" }),
    ...ordre.map((i) => el("th", { className: "nombre", textContent: formaterDate(jours[i]).slice(0, 5) })),
  ]));
  $("lignes-statistiques").replaceChildren(...COLONNES_CHIFFRES.map(({ cle, libelle, titre }) => el("tr", {}, [
    el("td", { className: "mesure", textContent: libelle, title: titre }),
    el("td", { className: "nombre total", textContent: String(totaux[cle]) }),
    el("td", { className: "nombre ratio" }, ratio(cle)),
    ...ordre.map((i) => el("td", { className: "nombre", textContent: String(total[i][cle]) })),
  ])));
}

function afficherStatistiques() {
  const { erreur, charge } = statistiques;
  if (erreur || !charge) {
    $("compteur-statistiques").textContent = erreur ? `Erreur de chargement : ${erreur}` : "Chargement…";
    $("graphiques-statistiques").replaceChildren();
    return;
  }
  $("compteur-statistiques").textContent = `Par jour de publication, sur les ${JOURS_STATISTIQUES} derniers jours.`;
  $("legende-statistiques").replaceChildren(...MESURES.map(({ legende, couleur }) => {
    const carre = el("span", { className: "carre" });
    carre.style.background = couleur;
    return el("span", {}, [carre, legende]);
  }));
  const jours = Array.from({ length: JOURS_STATISTIQUES }, (_, i) => ilYa(JOURS_STATISTIQUES - 1 - i));
  const parSource = series(jours);
  tableauStatistiques(jours, parSource.total);

  // Graphiques dessinés à la largeur de l'onglet : seulement s'il est visible
  // (choisirOnglet les redessine à l'ouverture, et le redimensionnement aussi).
  const largeur = $("graphiques-statistiques").clientWidth;
  if (!largeur) return;
  $("graphiques-statistiques").replaceChildren(
    graphique("Toutes sources", jours, parSource.total, largeur, MESURES_TOTAL),
    ...ORDRE_SOURCES.map((cle) => graphique(SOURCES[cle].libelle, jours, parSource[cle], largeur)),
  );
}

window.addEventListener("resize", () => {
  if (!$("onglet-statistiques").hidden) afficherStatistiques();
});

// --- Onglets ----------------------------------------------------------------

const ONGLETS = ["annonces", "veille-ciblee", "statistiques"];

// Onglet retenu dans l'adresse (#veille-ciblee) : rechargement et lien partageable.
function choisirOnglet(cle) {
  for (const onglet of ONGLETS) $(`onglet-${onglet}`).hidden = onglet !== cle;
  for (const bouton of document.querySelectorAll(".onglets button")) {
    bouton.setAttribute("aria-selected", String(bouton.dataset.onglet === cle));
  }
  history.replaceState(null, "", cle === "annonces" ? location.pathname : `#${cle}`);
  fermerPanneau();
  if (cle === "statistiques") afficherStatistiques();
}

for (const bouton of document.querySelectorAll(".onglets button")) {
  bouton.addEventListener("click", () => choisirOnglet(bouton.dataset.onglet));
}

// --- Session ----------------------------------------------------------------

function viderDonnees() {
  for (const cle of ORDRE_SOURCES) {
    Object.assign(etat[cle], { annonces: [], erreur: null, charge: false });
  }
  annonces = [];
  Object.assign(veille, { profils: [], villes: new Map(), erreur: null, charge: false, depuis: null });
  Object.assign(statistiques, { lignes: [], erreur: null, charge: false });
}

async function afficherSelonSession(session) {
  $("connexion").hidden = !!session;
  $("application").hidden = !session;
  if (!session) return;
  $("email-utilisateur").textContent = session.user.email;
  // Ancien lien d'onglet par source (#ted) : la source est cochée dans le filtre « Source ».
  const ancre = location.hash.slice(1);
  if (SOURCES[ancre]) affichage.filtres.source = new Set([ancre]);
  choisirOnglet(ONGLETS.includes(ancre) ? ancre : "annonces");
  afficher();
  afficherVeille();
  afficherStatistiques();
  await Promise.all([chargerTout(), chargerVeille(), chargerStatistiques()]);
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
