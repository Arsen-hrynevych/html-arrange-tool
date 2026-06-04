import { z } from "zod";

export const htmlAssistantResultSchema = z.object({
  html: z.string().min(1),
  summary: z.string().min(1),
});

export type HtmlAssistantResult = z.infer<typeof htmlAssistantResultSchema>;

const htmlAssistantResponseSchema = z.object({
  choices: z.array(
    z.object({
      message: z.object({
        content: z.string().nullable(),
      }),
    })
  ),
});

function buildAssistantPrompt(html: string, instruction: string, slideName?: string) {
  return [
    "You edit HTML slides for a presentation app.",
    "Return only a JSON object with the keys html and summary.",
    "html must contain the full updated HTML after applying the user's request.",
    "summary must be a short plain-English sentence describing the edit.",
    "Make the smallest viable change and preserve existing structure, ids, scripts, and styling unless the user explicitly asks for a broader rewrite.",
    "If the instruction is ambiguous, make a reasonable best-effort edit instead of refusing.",
    slideName ? `Slide name: ${slideName}` : null,
    "Current HTML:",
    html,
    "User instruction:",
    instruction,
  ]
    .filter(Boolean)
    .join("\n\n");
}

export async function applyHtmlInstruction(
  html: string,
  instruction: string,
  slideName?: string
): Promise<HtmlAssistantResult> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is not set.");
  }

  const model = process.env.OPENAI_MODEL ?? "gpt-4.1-mini";
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      temperature: 0.2,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content:
            "You are a precise HTML editor that returns valid JSON only. Do not wrap the response in markdown.",
        },
        {
          role: "user",
          content: buildAssistantPrompt(html, instruction, slideName),
        },
      ],
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`OpenAI request failed (${response.status}): ${errorText}`);
  }

  const payload = htmlAssistantResponseSchema.parse(await response.json());
  const content = payload.choices[0]?.message.content;

  if (!content) {
    throw new Error("OpenAI returned an empty response.");
  }

  return htmlAssistantResultSchema.parse(JSON.parse(content));
}
