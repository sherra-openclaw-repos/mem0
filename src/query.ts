#!/usr/bin/env node
// Query memory from command line: tsx src/query.ts "what do I know about X?"

import { searchMemory, getAllFacts, getMemoryStats } from "./memory.js";

const query = process.argv.slice(2).join(" ");

if (!query || query === "--all") {
  const facts = getAllFacts(0);
  const stats = getMemoryStats();
  console.log(`Memory stats: ${stats.total} active, ${stats.superseded} superseded, avg confidence: ${stats.avgConf}`);
  console.log("");
  for (const f of facts) {
    console.log(`[${f.fact_type}] (${(f.confidence * 100).toFixed(0)}%, ×${f.extraction_count}) ${f.fact}`);
    console.log(`  Source: ${f.source_context} | Created: ${f.created_at}`);
  }
} else {
  console.log(`Searching for: "${query}"\n`);
  const results = await searchMemory(query, 10, 0);
  for (const f of results) {
    console.log(`[${f.fact_type}] (${(f.confidence * 100).toFixed(0)}%, ×${f.extraction_count}) ${f.fact}`);
    console.log(`  Source: ${f.source_context}`);
  }
}
