-- CreateTable
CREATE TABLE "EngagementSurvey" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "period" TEXT NOT NULL,
    "surveyDate" DATETIME NOT NULL,
    "enps" INTEGER NOT NULL,
    "promoters" INTEGER NOT NULL DEFAULT 0,
    "passives" INTEGER NOT NULL DEFAULT 0,
    "detractors" INTEGER NOT NULL DEFAULT 0,
    "responses" INTEGER NOT NULL DEFAULT 0,
    "invitedCount" INTEGER,
    "categoryScores" TEXT,
    "commentThemes" TEXT,
    "aiInsight" TEXT,
    "sourceType" TEXT NOT NULL DEFAULT 'manual',
    "sourceRef" TEXT,
    "contentHash" TEXT,
    "extractedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "EngagementSurvey_period_key" ON "EngagementSurvey"("period");
