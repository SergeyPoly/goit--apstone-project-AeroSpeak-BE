-- Attempts with an empty transcript were never shown to the user (the frontend asks to try
-- again), so they must not count in progress. New ones are no longer saved.
DELETE FROM "Attempt" WHERE trim("transcript") = '';

-- AlterTable
ALTER TABLE "Attempt" ADD COLUMN     "expectedPilotResponse" TEXT,
ADD COLUMN     "order" JSONB,
ADD COLUMN     "sessionId" UUID,
ADD COLUMN     "tip" TEXT;

-- CreateIndex
CREATE INDEX "Attempt_userId_scenarioId_createdAt_idx" ON "Attempt"("userId", "scenarioId", "createdAt");
