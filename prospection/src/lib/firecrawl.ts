const EMAIL_REGEX = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
const EXCLUDED_DOMAINS = ["sentry.io", "wixpress.com", "example.com"];
const DIRECTORY_DOMAINS = [
  "pappers.fr",
  "societe.com",
  "annuaire-entreprises.data.gouv.fr",
  "infogreffe.fr",
  "verif.com",
  "manageo.fr",
  "kompass.com",
];

export function extractEmail(content: string): string | null {
  const matches = content.match(EMAIL_REGEX);
  if (!matches) return null;

  const valid = matches.find((email) => {
    const domain = email.split("@")[1]?.toLowerCase();
    return domain && !EXCLUDED_DOMAINS.includes(domain);
  });

  return valid ?? null;
}

interface FirecrawlScrapeResponse {
  success: boolean;
  data?: {
    markdown?: string;
  };
}

export async function findEmailOnWebsite(url: string): Promise<string | null> {
  const apiKey = process.env.FIRECRAWL_API_KEY;
  if (!apiKey) throw new Error("FIRECRAWL_API_KEY is not set");

  const response = await fetch("https://api.firecrawl.dev/v1/scrape", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ url, formats: ["markdown"] }),
  });

  if (!response.ok) {
    throw new Error(`Firecrawl scrape failed: ${response.status} ${await response.text()}`);
  }

  const data = (await response.json()) as FirecrawlScrapeResponse;
  if (!data.success || !data.data?.markdown) return null;

  return extractEmail(data.data.markdown);
}

function isDirectoryDomain(url: string): boolean {
  let hostname: string;
  try {
    hostname = new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return true;
  }

  return DIRECTORY_DOMAINS.some((domain) => hostname === domain || hostname.endsWith(`.${domain}`));
}

interface FirecrawlSearchResponse {
  success: boolean;
  data?: Array<{ url: string; title?: string; description?: string }>;
}

export async function findWebsiteUrl(
  denomination: string,
  adresse: string
): Promise<string | null> {
  const apiKey = process.env.FIRECRAWL_API_KEY;
  if (!apiKey) throw new Error("FIRECRAWL_API_KEY is not set");

  const response = await fetch("https://api.firecrawl.dev/v1/search", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query: `${denomination} ${adresse}`, limit: 5 }),
  });

  if (!response.ok) {
    throw new Error(`Firecrawl search failed: ${response.status} ${await response.text()}`);
  }

  const data = (await response.json()) as FirecrawlSearchResponse;
  const results = data.data ?? [];
  const match = results.find((r) => !isDirectoryDomain(r.url));

  return match?.url ?? null;
}
