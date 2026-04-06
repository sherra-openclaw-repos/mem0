#!/usr/bin/env node
// Main extraction pipeline — run every 30 minutes via systemd timer

import { getLastProcessedTime, setLastProcessedTime } from "./db.js";
import { getSessionsSince, formatSessionForExtraction } from "./reader.js";
import { extractFacts } from "./extract.js";
import { storeFact, getMemoryStats } from "./memory.js";
import { writeContextFile } from "./context-writer.js";

async function main() {
  console.log(`[mem0] Starting extraction at ${new Date().toISOString()}`);

  const lastRun = getLastProcessedTime();
  console.log(`[mem0] Last processed: ${lastRun ? new Date(lastRun).toISOString() : "never"}`);

  const sessions = await getSessionsSince(lastRun);
  console.log(`[mem0] Found ${sessions.length} session(s) to process`);

  if (sessions.length === 0) {
    console.log("[mem0] Nothing to process.");
    await writeContextFile();
    return;
  }

  let totalNew = 0;
  let totalMerged = 0;

  for (const session of sessions) {
    const text = formatSessionForExtraction(session);
    if (!text || text.length < 50) continue;

    console.log(`[mem0] Processing session ${session.sessionId} (${session.messages.length} messages)`);

    const facts = await extractFacts(text);
    console.log(`[mem0]   Extracted ${facts.length} facts`);

    for (const fact of facts) {
      const result = await storeFact(fact, `session:${session.sessionId}`);
      if (result === "new") totalNew++;
      else if (result === "merged") totalMerged++;
    }
  }

  // Update last processed time to now
  setLastProcessedTime(Date.now());

  // Write context file for agent startup
  await writeContextFile();

  const stats = getMemoryStats();
  console.log(`[mem0] Done. +${totalNew} new, ${totalMerged} merged. Total: ${stats.total} facts (avg confidence: ${stats.avgConf})`);
}

main().catch(err => {
  console.error("[mem0] Fatal error:", err);
  process.exit(1);
});
