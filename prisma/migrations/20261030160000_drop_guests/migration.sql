-- Guest attempts were test data from before sign-in; they cannot be moved to an account.
DELETE FROM "Attempt" WHERE "userId" IS NULL;

-- DropForeignKey
ALTER TABLE "Guest" DROP CONSTRAINT "Guest_userId_fkey";

-- DropForeignKey
ALTER TABLE "Attempt" DROP CONSTRAINT "Attempt_guestId_fkey";

-- DropIndex
DROP INDEX "Attempt_guestId_createdAt_idx";

-- AlterTable
ALTER TABLE "User" DROP COLUMN "passwordHash";

-- AlterTable
ALTER TABLE "Attempt" DROP COLUMN "guestId",
ALTER COLUMN "userId" SET NOT NULL;

-- DropTable
DROP TABLE "Guest";

