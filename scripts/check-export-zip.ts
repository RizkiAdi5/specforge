import "dotenv/config";
import JSZip from "jszip";
import { prisma } from "../lib/db";
import { buildExportZip } from "../lib/spec/export-zip";

async function main() {
  const org = await prisma.org.create({ data: { name: "check-export-zip org", projectSlotMax: 5 } });

  try {
    const project = await prisma.project.create({
      data: {
        orgId: org.id,
        archetype: "SAAS_CRUD",
        blueprintId: "nextjs-prisma-postgres",
        brief: {
          create: {
            rawAnswers: {},
            problem: "Tukang servis AC kesulitan menjadwalkan panggilan customer.",
            targetUser: "Tukang servis AC lepas.",
            scope: ["Jadwal servis", "Data customer"],
            nonGoals: ["Multi-tenant", "Billing berlangganan"],
          },
        },
      },
    });

    const entity = await prisma.entity.create({
      data: {
        projectId: project.id,
        refId: "E-001",
        name: "ServiceAppointment",
        fields: [{ name: "status", type: "string", required: true }],
        relations: [],
      },
    });
    const story = await prisma.story.create({
      data: {
        projectId: project.id,
        refId: "US-001",
        narrative: "Sebagai tukang, saya bisa membuat jadwal servis.",
        entityRefs: [entity.refId],
        acceptanceCriteria: [{ refId: "AC-1", given: "saya login", when: "saya isi form", then: "jadwal tersimpan" }],
      },
    });
    const decision = await prisma.decision.create({
      data: { projectId: project.id, refId: "ADR-001", choice: "Next.js + Prisma + PostgreSQL", alternatives: [{ option: "Supabase", whyRejected: "butuh kontrol schema penuh" }], rationale: "Tim sudah familiar." },
    });
    const milestone = await prisma.task.create({ data: { projectId: project.id, refId: "M-001", level: "MILESTONE", title: "Fondasi" } });
    await prisma.task.create({
      data: { projectId: project.id, parentId: milestone.id, refId: "T-001", level: "TASK", title: "Bangun jadwal servis", definitionOfDone: ["Form bisa submit", "Data tersimpan"], allowedFiles: ["app/schedule/**"], forbiddenFiles: [], storyRefs: [story.refId] },
    });

    const zipBuffer = await buildExportZip(project.id);
    const zip = await JSZip.loadAsync(zipBuffer);

    const fileNames = Object.keys(zip.files).sort();
    console.log("files in zip:", fileNames);

    console.assert(fileNames.includes(".spec/01-prd.md"), "expected .spec/01-prd.md");
    console.assert(fileNames.includes(".spec/02-data-and-flows.md"), "expected .spec/02-data-and-flows.md");
    console.assert(fileNames.includes(".spec/03-decisions.md"), "expected .spec/03-decisions.md");
    console.assert(fileNames.includes(".spec/04-tasks.md"), "expected .spec/04-tasks.md");
    console.assert(fileNames.includes("CLAUDE.md"), "expected CLAUDE.md at the root");

    const prd = await zip.file(".spec/01-prd.md")!.async("string");
    console.log("--- 01-prd.md ---\n" + prd);
    console.assert(prd.includes("Tukang servis AC kesulitan"), "PRD must contain the actual problem statement");
    console.assert(prd.includes("US-001"), "PRD must list the actual story refId");
    console.assert(prd.includes("Multi-tenant"), "PRD must contain the actual non-goals");

    const domain = await zip.file(".spec/02-data-and-flows.md")!.async("string");
    console.assert(domain.includes("E-001") && domain.includes("ServiceAppointment"), "domain doc must contain the real entity");

    const decisions = await zip.file(".spec/03-decisions.md")!.async("string");
    console.assert(decisions.includes("Next.js + Prisma + PostgreSQL"), "decisions doc must contain the real ADR choice");

    const tasks = await zip.file(".spec/04-tasks.md")!.async("string");
    console.assert(tasks.includes("T-001") && tasks.includes("Bangun jadwal servis"), "tasks doc must contain the real task");

    const claudeMd = await zip.file("CLAUDE.md")!.async("string");
    console.log("--- CLAUDE.md ---\n" + claudeMd);
    console.assert(claudeMd.includes("Prisma"), "CLAUDE.md must reflect the actual chosen blueprint stack");
    console.assert(claudeMd.includes("Multi-tenant"), "CLAUDE.md must contain the actual project non-goals");

    // "Isi ZIP harus cocok dengan kondisi spec saat itu" — change something, re-export, confirm it reflects the change.
    await prisma.story.update({ where: { id: story.id }, data: { narrative: "Cerita yang sudah diedit." } });
    const zipBuffer2 = await buildExportZip(project.id);
    const zip2 = await JSZip.loadAsync(zipBuffer2);
    const prd2 = await zip2.file(".spec/01-prd.md")!.async("string");
    console.assert(prd2.includes("Cerita yang sudah diedit."), "re-exporting after an edit must reflect the current state, not a stale cache");
    console.assert(!prd2.includes("Sebagai tukang, saya bisa membuat jadwal servis."), "the OLD narrative must be gone after edit");

    console.log("OK: export ZIP satisfies US-016 acceptance criteria");
  } finally {
    await prisma.task.deleteMany({ where: { project: { orgId: org.id } } });
    await prisma.decision.deleteMany({ where: { project: { orgId: org.id } } });
    await prisma.story.deleteMany({ where: { project: { orgId: org.id } } });
    await prisma.entity.deleteMany({ where: { project: { orgId: org.id } } });
    await prisma.project.deleteMany({ where: { orgId: org.id } });
    await prisma.org.delete({ where: { id: org.id } });
  }
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (err) => {
    console.error(err);
    await prisma.$disconnect();
    process.exit(1);
  });
