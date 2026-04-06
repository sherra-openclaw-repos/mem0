// Read session messages from OpenClaw's JSONL session files

import fs from "fs";
import path from "path";
import readline from "readline";
import os from "os";

const SESSIONS_DIR = path.join(os.homedir(), ".openclaw-sherra", "agents", "main", "sessions");

interface SessionMessage {
  type: string;
  timestamp: string;
  message?: {
    role: string;
    content: Array<{ type: string; text?: string }>;
  };
}

export interface ConversationSession {
  sessionId: string;
  startTime: number;
  messages: Array<{ role: string; text: string; timestamp: number }>;
}

async function readSessionFile(filePath: string): Promise<ConversationSession | null> {
  const messages: Array<{ role: string; text: string; timestamp: number }> = [];
  let sessionId = path.basename(filePath, ".jsonl");
  let startTime = 0;

  const rl = readline.createInterface({
    input: fs.createReadStream(filePath),
    crlfDelay: Infinity,
  });

  for await (const line of rl) {
    if (!line.trim()) continue;
    try {
      const record: SessionMessage = JSON.parse(line);
      if (record.type === "session") {
        startTime = new Date(record.timestamp).getTime();
      }
      if (record.type === "message" && record.message) {
        const { role, content } = record.message;
        if (role === "user" || role === "assistant") {
          const text = content
            .filter(c => c.type === "text" && c.text)
            .map(c => c.text!)
            .join("\n")
            .trim();
          if (text && text.length > 10) {
            const ts = record.timestamp ? new Date(record.timestamp).getTime() : startTime;
            messages.push({ role, text, timestamp: ts });
          }
        }
      }
    } catch {}
  }

  if (messages.length === 0) return null;
  return { sessionId, startTime, messages };
}

export async function getSessionsSince(sinceMs: number): Promise<ConversationSession[]> {
  let files: string[];
  try {
    files = fs.readdirSync(SESSIONS_DIR);
  } catch {
    return [];
  }

  // Only .jsonl files (not deleted)
  const activeFiles = files.filter(f => f.endsWith(".jsonl") && !f.includes(".deleted."));

  const sessions: ConversationSession[] = [];

  for (const file of activeFiles) {
    const filePath = path.join(SESSIONS_DIR, file);
    try {
      const stat = fs.statSync(filePath);
      // Quick pre-filter: skip files not modified since our last run
      if (stat.mtimeMs < sinceMs - 60000) continue;

      const session = await readSessionFile(filePath);
      if (!session) continue;
      if (session.startTime < sinceMs && sinceMs > 0) {
        // Include session if any messages are newer than sinceMs
        const hasNew = session.messages.some(m => m.timestamp >= sinceMs);
        if (!hasNew) continue;
      }
      sessions.push(session);
    } catch {}
  }

  return sessions;
}

export function formatSessionForExtraction(session: ConversationSession): string {
  return session.messages
    .slice(0, 40) // Cap at 40 messages to keep prompt size sane
    .map(m => {
      const role = m.role === "user" ? "Dj" : "Assistant";
      // Truncate very long messages
      const text = m.text.length > 800 ? m.text.slice(0, 800) + "..." : m.text;
      return `${role}: ${text}`;
    })
    .join("\n\n");
}
