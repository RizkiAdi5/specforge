import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { buildExportZip } from "@/lib/spec/export-zip";
import { requireOrgId, UnauthorizedError } from "@/lib/auth/current-org";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  let orgId: string;
  try {
    orgId = await requireOrgId();
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return NextResponse.json({ error: err.message }, { status: 401 });
    }
    throw err;
  }

  const project = await prisma.project.findUnique({ where: { id }, select: { orgId: true } });
  if (!project || project.orgId !== orgId) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  const zip = await buildExportZip(id);

  return new NextResponse(new Uint8Array(zip), {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="specforge-${id}.zip"`,
    },
  });
}
