export interface ProspectContext {
  denomination: string;
  activite: string;
  dirigeantPrenom: string;
  dirigeantNom: string;
  linkedinHeadline: string | null;
  linkedinAbout: string | null;
}

export interface GeneratedMessages {
  linkedinMessage: string;
  emailSubject: string;
  emailBody: string;
}

interface OpenRouterResponse {
  choices: Array<{ message: { content: string } }>;
}

function buildPrompt(ctx: ProspectContext): string {
  return `Tu rédiges des messages de prospection pour un réseau de bars partenaires.
Le service : on envoie des clients aux bars du réseau pour bien les remplir. Quand un
bar affiche complet, on le sait en temps réel et on redirige automatiquement le
surplus de clientèle vers les autres bars partenaires du réseau — pour le bar,
ça veut dire plus de monde aux heures creuses et jamais de clients perdus faute
de place.

Contexte :
- Bar : ${ctx.denomination}
- Activité : ${ctx.activite}
- Dirigeant : ${ctx.dirigeantPrenom} ${ctx.dirigeantNom}
- Profil LinkedIn : ${ctx.linkedinHeadline ?? "non disponible"}
- Bio LinkedIn : ${ctx.linkedinAbout ?? "non disponible"}

Rédige :
1. Un message LinkedIn court (3-4 phrases, ton chaleureux et pro) pour une demande de connexion. Si le profil ou la bio contiennent une information concrète (poste, passion, projet), personnalise le message en t'appuyant dessus. Sinon reste générique sur l'activité du bar (jamais l'adresse).
2. Un email de prospection (objet court + corps de 5-8 phrases) qui présente le principe du réseau (clients envoyés, redirection automatique du surplus vers les bars partenaires quand complet) et propose un échange rapide.

Réponds STRICTEMENT en JSON, sans texte autour, au format :
{"linkedinMessage": "...", "emailSubject": "...", "emailBody": "..."}`;
}

function stripCodeFences(raw: string): string {
  const match = raw.trim().match(/^```(?:json)?\s*([\s\S]*?)\s*```$/);
  return match ? match[1] : raw;
}

function parseGeneratedMessages(raw: string): GeneratedMessages {
  const parsed = JSON.parse(stripCodeFences(raw)) as Partial<GeneratedMessages>;

  if (
    typeof parsed.linkedinMessage !== "string" ||
    typeof parsed.emailSubject !== "string" ||
    typeof parsed.emailBody !== "string"
  ) {
    throw new Error(`Réponse LLM incomplète : ${raw}`);
  }

  return {
    linkedinMessage: parsed.linkedinMessage,
    emailSubject: parsed.emailSubject,
    emailBody: parsed.emailBody,
  };
}

export async function generateMessages(ctx: ProspectContext): Promise<GeneratedMessages> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new Error("OPENROUTER_API_KEY is not set");

  const model = process.env.OPENROUTER_MODEL ?? "anthropic/claude-sonnet-5";

  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      messages: [{ role: "user", content: buildPrompt(ctx) }],
    }),
  });

  if (!response.ok) {
    throw new Error(`OpenRouter request failed: ${response.status} ${await response.text()}`);
  }

  const data = (await response.json()) as OpenRouterResponse;
  const content = data.choices[0]?.message.content;
  if (!content) throw new Error("OpenRouter response has no content");

  return parseGeneratedMessages(content);
}
