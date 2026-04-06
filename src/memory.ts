import { randomUUID } from "crypto";
import { getDb } from "./db.js";
import { embed, cosineSimilarity } from "./embed.js";
import type { ExtractedFact } from "./extract.js";

const DEDUP_THRESHOLD = 0.82;

interface MemoryRow {
  id: string;
  fact: string;
  fact_type: string;
  confidence: number;
  extraction_count: number;
  embedding: string | null;
  source_context: string | null;
  superseded_by: string | null;
  created_at: string;
  updated_at: string;
}

export async function storeFact(fact: ExtractedFact, sourceContext: string): Promise<"new" | "merged" | "skipped"> {
  const db = getDb();
  const newEmbedding = await embed(fact.fact);

  // Load all active facts for dedup check
  const existing = db.prepare(
    "SELECT * FROM memory WHERE superseded_by IS NULL"
  ).all() as MemoryRow[];

  let bestMatch: MemoryRow | null = null;
  let bestSim = 0;

  for (const row of existing) {
    if (!row.embedding) continue;
    const rowEmbed = JSON.parse(row.embedding) as number[];
    const sim = cosineSimilarity(newEmbedding, rowEmbed);
    if (sim > bestSim) {
      bestSim = sim;
      bestMatch = row;
    }
  }

  if (bestMatch && bestSim >= DEDUP_THRESHOLD) {
    // Merge: boost extraction count and update confidence
    const newCount = bestMatch.extraction_count + 1;
    const newConfidence = Math.min(0.95, Math.max(bestMatch.confidence, fact.confidence) + 0.02 * (newCount > 3 ? 1 : 0));

    // If this is a correction type, supersede the old fact
    if (fact.type === "correction") {
      const newId = randomUUID();
      db.prepare(`
        INSERT INTO memory (id, fact, fact_type, confidence, extraction_count, embedding, source_context)
        VALUES (?, ?, ?, ?, 1, ?, ?)
      `).run(newId, fact.fact, fact.type, fact.confidence, JSON.stringify(newEmbedding), sourceContext);

      db.prepare(
        "UPDATE memory SET superseded_by = ?, updated_at = datetime('now') WHERE id = ?"
      ).run(newId, bestMatch.id);

      return "new";
    }

    db.prepare(`
      UPDATE memory SET
        extraction_count = ?,
        confidence = ?,
        updated_at = datetime('now')
      WHERE id = ?
    `).run(newCount, newConfidence, bestMatch.id);
    return "merged";
  }

  // New fact
  const id = randomUUID();
  db.prepare(`
    INSERT INTO memory (id, fact, fact_type, confidence, extraction_count, embedding, source_context)
    VALUES (?, ?, ?, ?, 1, ?, ?)
  `).run(id, fact.fact, fact.type, fact.confidence, JSON.stringify(newEmbedding), sourceContext);

  return "new";
}

export async function searchMemory(query: string, topK = 15, minConfidence = 0.65): Promise<MemoryRow[]> {
  const db = getDb();
  const queryEmbed = await embed(query);

  const rows = db.prepare(
    "SELECT * FROM memory WHERE superseded_by IS NULL AND confidence >= ?"
  ).all(minConfidence) as MemoryRow[];

  const scored = rows
    .filter(r => r.embedding)
    .map(r => ({
      row: r,
      score: cosineSimilarity(queryEmbed, JSON.parse(r.embedding!) as number[])
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, topK);

  return scored.map(s => s.row);
}

export function getAllFacts(minConfidence = 0.65): MemoryRow[] {
  const db = getDb();
  return db.prepare(
    "SELECT * FROM memory WHERE superseded_by IS NULL AND confidence >= ? ORDER BY confidence DESC, extraction_count DESC"
  ).all(minConfidence) as MemoryRow[];
}

export function getMemoryStats() {
  const db = getDb();
  const total = (db.prepare("SELECT COUNT(*) as n FROM memory WHERE superseded_by IS NULL").get() as any).n;
  const superseded = (db.prepare("SELECT COUNT(*) as n FROM memory WHERE superseded_by IS NOT NULL").get() as any).n;
  const avgConf = (db.prepare("SELECT AVG(confidence) as c FROM memory WHERE superseded_by IS NULL").get() as any).c;
  const highConf = (db.prepare("SELECT COUNT(*) as n FROM memory WHERE superseded_by IS NULL AND extraction_count > 3").get() as any).n;
  return { total, superseded, avgConf: avgConf?.toFixed(2), highConf };
}
