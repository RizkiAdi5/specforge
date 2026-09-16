import { prisma } from "@/lib/db";
import { regenerateByRefId, artifactKindFromRefId } from "@/lib/spec/refine-artifact";

/**
 * "Hanya artefak di impactSet yang diregenerate" (03-ai-pipeline.md). Tasks in the impact set
 * are intentionally NOT auto-regenerated here — they were already flipped to INVALIDATED at
 * analysis time (T-027); safely rewriting a task's allowedFiles/dependsOn mid-graph without
 * breaking whatever else depends on it needs a bigger redesign than this task's scope.
 */
export async function applyImpactedArtifacts(opts: { orgId: string; projectId: string; impactSet: string[]; description: string }) {
  const regenerable = opts.impactSet.filter((refId) => artifactKindFromRefId(refId) !== null);

  for (const refId of regenerable) {
    await regenerateByRefId({
      orgId: opts.orgId,
      projectId: opts.projectId,
      refId,
      instruction: opts.description,
      action: "REGENERATE_ARTIFACT",
    });
  }

  // PromptPacket whose specSnapshot intersects the impact set is now stale (Alur E step 6).
  const packets = await prisma.promptPacket.findMany({
    where: { task: { projectId: opts.projectId }, isStale: false },
    select: { id: true, specSnapshot: true },
  });
  const staleIds = packets
    .filter((p) => (p.specSnapshot as string[]).some((refId) => opts.impactSet.includes(refId)))
    .map((p) => p.id);
  if (staleIds.length > 0) {
    await prisma.promptPacket.updateMany({ where: { id: { in: staleIds } }, data: { isStale: true } });
  }

  return { regenerated: regenerable, staleIds };
}
