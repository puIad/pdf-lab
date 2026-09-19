// lib/cluster/similarity.ts — Vector math & cosine distance calculations.
// Used for pgvector-aligned cosine similarity clustering (04-SCHEMA vector_cosine_ops).

/**
 * Calculates cosine similarity between two numeric vectors in [-1, 1].
 * Returns 0 if either vector has 0 magnitude.
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0;

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    const ai = a[i];
    const bi = b[i];
    dotProduct += ai * bi;
    normA += ai * ai;
    normB += bi * bi;
  }

  if (normA === 0 || normB === 0) return 0;
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

/**
 * Calculates cosine distance (1 - cosineSimilarity), bounded in [0, 2].
 */
export function cosineDistance(a: number[], b: number[]): number {
  return 1 - cosineSimilarity(a, b);
}

/**
 * Computes normalized centroid (mean vector) for a collection of vectors.
 */
export function computeCentroid(vectors: number[][]): number[] {
  if (vectors.length === 0) return [];
  const dim = vectors[0].length;
  const sum = new Array(dim).fill(0);

  for (const vec of vectors) {
    for (let i = 0; i < dim; i++) {
      sum[i] += vec[i];
    }
  }

  const count = vectors.length;
  let norm = 0;
  for (let i = 0; i < dim; i++) {
    sum[i] /= count;
    norm += sum[i] * sum[i];
  }

  if (norm === 0) return sum;
  const sqrtNorm = Math.sqrt(norm);
  for (let i = 0; i < dim; i++) {
    sum[i] /= sqrtNorm;
  }

  return sum;
}
