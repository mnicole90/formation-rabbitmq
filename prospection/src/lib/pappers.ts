export interface PappersSearchResult {
  siren: string;
  denomination: string;
  adresse: string;
  codePostal: string;
  activite: string;
}

export interface PappersDirigeant {
  nom: string;
  prenom: string;
  fonction: string | null;
}

export interface PappersFiche {
  siren: string;
  denomination: string;
  adresse: string;
  codePostal: string;
  activite: string;
  website: string | null;
  email: string | null;
  dirigeants: PappersDirigeant[];
}

const PAPPERS_BASE_URL = "https://api.pappers.fr/v2";

interface PappersRechercheResponse {
  resultats: Array<{
    siren: string;
    nom_entreprise: string;
    code_naf: string;
    siege: {
      adresse_ligne_1: string;
      code_postal: string;
    };
  }>;
}

function requireApiKey(): string {
  const apiKey = process.env.PAPPERS_API_KEY;
  if (!apiKey) throw new Error("PAPPERS_API_KEY is not set");
  return apiKey;
}

export async function searchBars75011(page: number): Promise<PappersSearchResult[]> {
  const apiKey = requireApiKey();

  const url = new URL(`${PAPPERS_BASE_URL}/recherche`);
  url.searchParams.set("api_token", apiKey);
  url.searchParams.set("code_naf", "56.30Z");
  url.searchParams.set("code_postal", "75011");
  url.searchParams.set("entreprise_cessee", "false");
  url.searchParams.set("par_page", "20");
  url.searchParams.set("page", String(page));

  const response = await fetch(url.toString());
  if (!response.ok) {
    throw new Error(`Pappers recherche failed: ${response.status} ${await response.text()}`);
  }

  const data = (await response.json()) as PappersRechercheResponse;

  return data.resultats.map((r) => ({
    siren: r.siren,
    denomination: r.nom_entreprise,
    adresse: r.siege.adresse_ligne_1,
    codePostal: r.siege.code_postal,
    activite: r.code_naf,
  }));
}

interface PappersEntrepriseResponse {
  siren: string;
  nom_entreprise: string;
  code_naf: string;
  sites_internet: string[];
  email: string | null;
  siege: {
    adresse_ligne_1: string;
    code_postal: string;
  };
  representants: Array<{
    nom: string;
    prenom: string;
    qualite: string | null;
  }>;
}

export async function getFiche(siren: string): Promise<PappersFiche> {
  const apiKey = requireApiKey();

  const url = new URL(`${PAPPERS_BASE_URL}/entreprise`);
  url.searchParams.set("api_token", apiKey);
  url.searchParams.set("siren", siren);
  url.searchParams.set("champs_supplementaires", "email,sites_internet");

  const response = await fetch(url.toString());
  if (!response.ok) {
    throw new Error(`Pappers entreprise failed: ${response.status} ${await response.text()}`);
  }

  const data = (await response.json()) as PappersEntrepriseResponse;

  return {
    siren: data.siren,
    denomination: data.nom_entreprise,
    adresse: data.siege.adresse_ligne_1,
    codePostal: data.siege.code_postal,
    activite: data.code_naf,
    website: data.sites_internet[0] ?? null,
    email: data.email,
    dirigeants: data.representants.map((r) => ({
      nom: r.nom,
      prenom: r.prenom,
      fonction: r.qualite,
    })),
  };
}
