// Local embedding using @xenova/transformers (all-MiniLM-L6-v2)
// No external API needed — runs 100% locally

let pipeline: any = null;

async function getEmbedder() {
  if (pipeline) return pipeline;
  // Dynamically import to allow lazy loading
  const { pipeline: createPipeline, env } = await import("@xenova/transformers");
  // Cache models in workspace dir
  env.cacheDir = "/home/openclaw/.openclaw-sherra/workspace/mem0/.model-cache";
  env.allowRemoteModels = true;
  pipeline = await createPipeline("feature-extraction", "Xenova/all-MiniLM-L6-v2");
  return pipeline;
}

export async function embed(text: string): Promise<number[]> {
  const embedder = await getEmbedder();
  const output = await embedder(text, { pooling: "mean", normalize: true });
  return Array.from(output.data as Float32Array);
}

export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) return 0;
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  return dot / (Math.sqrt(normA) * Math.sqrt(normB) + 1e-10);
}
