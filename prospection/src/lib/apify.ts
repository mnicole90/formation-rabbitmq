export interface LinkedinProfile {
  url: string;
  headline: string | null;
  about: string | null;
  isEmpty: boolean;
}

interface HarvestApiProfileItem {
  linkedinUrl?: string;
  publicUrl?: string;
  headline?: string | null;
  about?: string | null;
  experience?: unknown[];
}

function isPlaceholder(value: string | null | undefined): boolean {
  return !value || value.trim() === "" || value.trim() === "--";
}

export async function findLinkedinProfile(
  prenom: string,
  nom: string
): Promise<LinkedinProfile | null> {
  const token = process.env.APIFY_TOKEN;
  if (!token) throw new Error("APIFY_TOKEN is not set");

  const url = "https://api.apify.com/v2/acts/harvestapi~linkedin-profile-search/run-sync-get-dataset-items";

  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      searchQuery: `${prenom} ${nom}`,
      locations: ["Paris"],
      maxItems: 1,
    }),
  });

  if (!response.ok) {
    return null;
  }

  const items = (await response.json()) as HarvestApiProfileItem[];
  const first = items[0];
  if (!first) return null;

  const profileUrl = first.linkedinUrl ?? first.publicUrl;
  if (!profileUrl) return null;

  const headline = isPlaceholder(first.headline) ? null : (first.headline as string);
  const about = isPlaceholder(first.about) ? null : (first.about as string);
  const hasExperience = Array.isArray(first.experience) && first.experience.length > 0;

  return {
    url: profileUrl,
    headline,
    about,
    isEmpty: headline === null && about === null && !hasExperience,
  };
}
