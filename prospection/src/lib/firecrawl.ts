const EMAIL_REGEX = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
const EXCLUDED_DOMAINS = ["sentry.io", "wixpress.com", "example.com"];

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
