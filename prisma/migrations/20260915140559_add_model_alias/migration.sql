-- CreateEnum
CREATE TYPE "ModelAlias" AS ENUM ('FLASH', 'FLASH_THINKING');

-- AlterTable
ALTER TABLE "CreditRule" ADD COLUMN     "model" "ModelAlias" NOT NULL DEFAULT 'FLASH';
