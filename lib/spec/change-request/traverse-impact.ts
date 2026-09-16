import { prisma } from "@/lib/db";

/**
 * Deterministic, no LLM (03-ai-pipeline.md: "Biaya nol, hasilnya deterministik").
 * Breadth-first, traversing every TraceLink edge in BOTH directions ("telusuri TraceLink
 * dua arah") from the starting refIds until no new node is discovered. The visited-set
 * guarantees termination even if the graph has a cycle.
 */
export async function traverseImpact(projectId: string, startRefIds: string[]): Promise<string[]> {
  const links = await prisma.traceLink.findMany({ where: { projectId }, select: { fromRefId: true, toRefId: true } });

  const adjacency = new Map<string, Set<string>>();
  const addEdge = (a: string, b: string) => {
    if (!adjacency.has(a)) adjacency.set(a, new Set());
    adjacency.get(a)!.add(b);
  };
  for (const link of links) {
    addEdge(link.fromRefId, link.toRefId);
    addEdge(link.toRefId, link.fromRefId);
  }

  const visited = new Set<string>(startRefIds);
  const queue = [...startRefIds];
  while (queue.length > 0) {
    const current = queue.shift()!;
    for (const neighbor of adjacency.get(current) ?? []) {
      if (!visited.has(neighbor)) {
        visited.add(neighbor);
        queue.push(neighbor);
      }
    }
  }

  return [...visited];
}
