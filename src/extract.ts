// Fact extraction using Claude Haiku

import Anthropic from "@anthropic-ai/sdk";
import { execSync } from "child_process";

function getApiKey(): string {
  // Try env first
  if (process.env.ANTHROPIC_API_KEY) return process.env.ANTHROPIC_API_KEY;
  // Try 1Password — load service account token from file, pass explicitly to op
  try {
    const saToken = execSync("cat /home/openclaw/.openclaw-dj/projects/.op-service-account", { encoding: "utf8" }).trim();
    const key = execSync(
      `OP_SERVICE_ACCOUNT_TOKEN='${saToken}' op item get 'Kiro API' --vault OpenClaw --reveal --fields label=credential`,
      { encoding: "utf8", shell: "/bin/bash" }
    ).trim();
    if (key) {
      process.env.ANTHROPIC_API_KEY = key; // cache for subsequent calls
      return key;
    }
  } catch (e) {
    console.error("1Password lookup failed:", e);
  }
  throw new Error("No Kiro API token found. Set ANTHROPIC_API_KEY or store in 1Password as 'Kiro API'.");
}

export interface ExtractedFact {
  fact: string;
  type: "preference" | "correction" | "inferred" | "explicit" | "goal";
  confidence: number;
}

export async function extractFacts(conversation: string): Promise<ExtractedFact[]> {
  const apiKey = getApiKey();
  const client = new Anthropic({
    apiKey,
    baseURL: "http://localhost:9000",
    defaultHeaders: { "Authorization": `Bearer ${apiKey}` },
  });

  const prompt = `You are a fact extraction engine. Read this conversation and extract key facts about the person (Dj Padzensky, a VP of Engineering in San Diego).

Extract 2-8 facts focusing on:
- Preferences (how they like things done, tools they prefer/dislike)
- Corrections (things they clarified or corrected)
- Decisions (what they decided to build or do)
- Goals (explicit targets or intentions)
- Inferred facts (reasonable conclusions from context)
- Technical context (systems, architectures, configurations they use)

ONLY extract facts that are genuinely meaningful and would be useful to remember long-term.
Do NOT extract transient operational details (e.g. "ran a command", "fixed a bug").
Do NOT extract facts already obvious from the system context.

Output ONLY a JSON array (no markdown, no explanation):
[
  {
    "fact": "exact statement about the person",
    "type": "preference|correction|inferred|explicit|goal",
    "confidence": 0.5-0.95
  }
]

If there are no meaningful facts to extract, output: []

Conversation:
${conversation}`;

  try {
    const response = await client.messages.create({
      model: "claude-haiku-4.5",
      max_tokens: 1024,
      messages: [{ role: "user", content: prompt }]
    });

    const text = response.content[0].type === "text" ? response.content[0].text.trim() : "";
    // Strip markdown code fences if present
    const json = text.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "").trim();
    const facts = JSON.parse(json);
    if (!Array.isArray(facts)) return [];
    const validTypes = new Set(["preference","correction","inferred","explicit","goal"]);
    return facts
      .filter((f: any) => f.fact && f.type && typeof f.confidence === "number")
      .map((f: any) => ({
        ...f,
        // Normalize unknown types to 'inferred'
        type: validTypes.has(f.type) ? f.type : "inferred",
        confidence: Math.max(0.5, Math.min(0.95, f.confidence)),
      }));
  } catch (err) {
    console.error("Extraction error:", err);
    return [];
  }
}
