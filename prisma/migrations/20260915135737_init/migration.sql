-- CreateEnum
CREATE TYPE "OrgPlan" AS ENUM ('FREE', 'PRO');

-- CreateEnum
CREATE TYPE "MembershipRole" AS ENUM ('OWNER', 'MEMBER');

-- CreateEnum
CREATE TYPE "ProjectArchetype" AS ENUM ('SAAS_CRUD');

-- CreateEnum
CREATE TYPE "SpecLevel" AS ENUM ('LITE', 'STANDARD', 'STRICT');

-- CreateEnum
CREATE TYPE "ProjectStatus" AS ENUM ('INTERVIEWING', 'COMPILING', 'ACTIVE', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "AssumptionStatus" AS ENUM ('OPEN', 'CONFIRMED', 'REJECTED');

-- CreateEnum
CREATE TYPE "TaskLevel" AS ENUM ('MILESTONE', 'TASK', 'STEP');

-- CreateEnum
CREATE TYPE "TaskStatus" AS ENUM ('TODO', 'IN_PROGRESS', 'DONE', 'INVALIDATED');

-- CreateEnum
CREATE TYPE "ArtifactType" AS ENUM ('ENTITY', 'STORY', 'DECISION', 'ASSUMPTION', 'TASK');

-- CreateEnum
CREATE TYPE "TraceLinkKind" AS ENUM ('DERIVES', 'IMPLEMENTS', 'CONSTRAINS', 'ASSUMES');

-- CreateEnum
CREATE TYPE "CodeStateSource" AS ENUM ('FILE_TREE', 'FILE_CONTENT', 'ERROR_MESSAGE');

-- CreateEnum
CREATE TYPE "ChangeRequestStatus" AS ENUM ('ANALYZING', 'AWAITING_APPROVAL', 'APPLIED', 'DISCARDED');

-- CreateEnum
CREATE TYPE "ActionType" AS ENUM ('INTERVIEW', 'COMPILE_SPEC', 'CRITIC_PASS', 'GENERATE_TASKS', 'SPLIT_TASK', 'PROMPT_PACKET', 'PASTE_BACK', 'REFINE_SECTION', 'CHANGE_REQUEST');

-- CreateTable
CREATE TABLE "Org" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "plan" "OrgPlan" NOT NULL DEFAULT 'FREE',
    "creditBalance" INTEGER NOT NULL DEFAULT 0,
    "projectSlotMax" INTEGER NOT NULL DEFAULT 1,
    "monthlyCostCapUsd" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Org_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "clerkId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Membership" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" "MembershipRole" NOT NULL DEFAULT 'OWNER',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Membership_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProviderKey" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "encryptedKey" TEXT NOT NULL,
    "lastFour" TEXT NOT NULL,
    "isValid" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProviderKey_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Project" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "archetype" "ProjectArchetype" NOT NULL,
    "specLevel" "SpecLevel" NOT NULL DEFAULT 'STANDARD',
    "status" "ProjectStatus" NOT NULL DEFAULT 'INTERVIEWING',
    "blueprintId" TEXT,
    "refCounters" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Project_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Brief" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "rawAnswers" JSONB NOT NULL,
    "problem" TEXT,
    "targetUser" TEXT,
    "scope" JSONB NOT NULL DEFAULT '[]',
    "nonGoals" JSONB NOT NULL DEFAULT '[]',
    "approvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Brief_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Entity" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "refId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "fields" JSONB NOT NULL DEFAULT '[]',
    "relations" JSONB NOT NULL DEFAULT '[]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Entity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Story" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "refId" TEXT NOT NULL,
    "narrative" TEXT NOT NULL,
    "acceptanceCriteria" JSONB NOT NULL DEFAULT '[]',
    "entityRefs" JSONB NOT NULL DEFAULT '[]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Story_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Decision" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "refId" TEXT NOT NULL,
    "choice" TEXT NOT NULL,
    "alternatives" JSONB NOT NULL DEFAULT '[]',
    "rationale" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Decision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Assumption" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "refId" TEXT NOT NULL,
    "statement" TEXT NOT NULL,
    "question" TEXT NOT NULL,
    "answer" TEXT,
    "status" "AssumptionStatus" NOT NULL DEFAULT 'OPEN',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Assumption_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Task" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "refId" TEXT NOT NULL,
    "parentId" TEXT,
    "level" "TaskLevel" NOT NULL,
    "title" TEXT NOT NULL,
    "definitionOfDone" JSONB NOT NULL DEFAULT '[]',
    "allowedFiles" JSONB NOT NULL DEFAULT '[]',
    "forbiddenFiles" JSONB NOT NULL DEFAULT '[]',
    "dependsOn" JSONB NOT NULL DEFAULT '[]',
    "storyRefs" JSONB NOT NULL DEFAULT '[]',
    "status" "TaskStatus" NOT NULL DEFAULT 'TODO',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Task_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TraceLink" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "fromType" "ArtifactType" NOT NULL,
    "fromRefId" TEXT NOT NULL,
    "toType" "ArtifactType" NOT NULL,
    "toRefId" TEXT NOT NULL,
    "kind" "TraceLinkKind" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TraceLink_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PromptPacket" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "specSnapshot" JSONB NOT NULL DEFAULT '[]',
    "isStale" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PromptPacket_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CodeState" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "source" "CodeStateSource" NOT NULL,
    "fileTree" JSONB NOT NULL DEFAULT '[]',
    "deviations" JSONB NOT NULL DEFAULT '[]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CodeState_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChangeRequest" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "impactSet" JSONB NOT NULL DEFAULT '[]',
    "status" "ChangeRequestStatus" NOT NULL DEFAULT 'ANALYZING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChangeRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UsageLog" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "projectId" TEXT,
    "actionType" "ActionType" NOT NULL,
    "model" TEXT NOT NULL,
    "tokenIn" INTEGER NOT NULL DEFAULT 0,
    "tokenOut" INTEGER NOT NULL DEFAULT 0,
    "costUsd" DECIMAL(10,4) NOT NULL DEFAULT 0,
    "creditCost" INTEGER NOT NULL DEFAULT 0,
    "succeeded" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UsageLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CreditRule" (
    "actionType" "ActionType" NOT NULL,
    "creditCost" INTEGER NOT NULL,

    CONSTRAINT "CreditRule_pkey" PRIMARY KEY ("actionType")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_clerkId_key" ON "User"("clerkId");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Membership_orgId_userId_key" ON "Membership"("orgId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "ProviderKey_orgId_provider_key" ON "ProviderKey"("orgId", "provider");

-- CreateIndex
CREATE UNIQUE INDEX "Brief_projectId_key" ON "Brief"("projectId");

-- CreateIndex
CREATE UNIQUE INDEX "Entity_projectId_refId_key" ON "Entity"("projectId", "refId");

-- CreateIndex
CREATE UNIQUE INDEX "Story_projectId_refId_key" ON "Story"("projectId", "refId");

-- CreateIndex
CREATE UNIQUE INDEX "Decision_projectId_refId_key" ON "Decision"("projectId", "refId");

-- CreateIndex
CREATE UNIQUE INDEX "Assumption_projectId_refId_key" ON "Assumption"("projectId", "refId");

-- CreateIndex
CREATE UNIQUE INDEX "Task_projectId_refId_key" ON "Task"("projectId", "refId");

-- CreateIndex
CREATE UNIQUE INDEX "TraceLink_projectId_fromType_fromRefId_toType_toRefId_kind_key" ON "TraceLink"("projectId", "fromType", "fromRefId", "toType", "toRefId", "kind");

-- AddForeignKey
ALTER TABLE "Membership" ADD CONSTRAINT "Membership_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Org"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Membership" ADD CONSTRAINT "Membership_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProviderKey" ADD CONSTRAINT "ProviderKey_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Org"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Org"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Brief" ADD CONSTRAINT "Brief_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Entity" ADD CONSTRAINT "Entity_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Story" ADD CONSTRAINT "Story_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Decision" ADD CONSTRAINT "Decision_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Assumption" ADD CONSTRAINT "Assumption_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TraceLink" ADD CONSTRAINT "TraceLink_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PromptPacket" ADD CONSTRAINT "PromptPacket_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CodeState" ADD CONSTRAINT "CodeState_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChangeRequest" ADD CONSTRAINT "ChangeRequest_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UsageLog" ADD CONSTRAINT "UsageLog_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Org"("id") ON DELETE CASCADE ON UPDATE CASCADE;
