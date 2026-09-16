-- AlterEnum
ALTER TYPE "ActionType" ADD VALUE 'COMPILE_BRIEF';

-- AlterTable
ALTER TABLE "Project" ADD COLUMN     "lastCompileError" JSONB;
