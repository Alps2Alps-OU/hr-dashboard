-- CreateTable
CREATE TABLE "Position" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "department" TEXT NOT NULL,
    "level" TEXT NOT NULL,
    "openedDate" DATETIME NOT NULL,
    "status" TEXT NOT NULL,
    "hiringManager" TEXT,
    "closedDate" DATETIME
);

-- CreateTable
CREATE TABLE "Candidate" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "positionId" TEXT NOT NULL,
    "stage" TEXT NOT NULL,
    "source" TEXT,
    "appliedDate" DATETIME,
    "screenedDate" DATETIME,
    "interviewDate" DATETIME,
    "offerDate" DATETIME,
    "hiredDate" DATETIME,
    "rejectedReason" TEXT,
    "offerAccepted" BOOLEAN,
    CONSTRAINT "Candidate_positionId_fkey" FOREIGN KEY ("positionId") REFERENCES "Position" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Employee" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "startDate" DATETIME NOT NULL,
    "probationEndDate" DATETIME,
    "probationStatus" TEXT,
    "department" TEXT NOT NULL,
    "level" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true
);

-- CreateTable
CREATE TABLE "Termination" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "employeeId" TEXT NOT NULL,
    "exitDate" DATETIME NOT NULL,
    "type" TEXT NOT NULL,
    "reason" TEXT,
    "tenureDays" INTEGER NOT NULL,
    CONSTRAINT "Termination_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "OnboardingTask" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "employeeId" TEXT NOT NULL,
    "taskName" TEXT NOT NULL,
    "dueDate" DATETIME,
    "completedDate" DATETIME,
    "status" TEXT NOT NULL,
    CONSTRAINT "OnboardingTask_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "CostPerHire" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "positionId" TEXT NOT NULL,
    "advertisingCost" REAL NOT NULL DEFAULT 0,
    "agencyFee" REAL NOT NULL DEFAULT 0,
    "totalCost" REAL NOT NULL,
    "invoiceMonth" TEXT NOT NULL,
    "extractedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CostPerHire_positionId_fkey" FOREIGN KEY ("positionId") REFERENCES "Position" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "CandidateSurvey" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "candidateId" TEXT,
    "positionId" TEXT NOT NULL,
    "score" REAL NOT NULL,
    "submittedDate" DATETIME NOT NULL,
    CONSTRAINT "CandidateSurvey_positionId_fkey" FOREIGN KEY ("positionId") REFERENCES "Position" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "HRInitiative" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "asanaTaskId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "pillar" TEXT NOT NULL,
    "quarter" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "ragStatus" TEXT NOT NULL,
    "progressPercent" INTEGER NOT NULL DEFAULT 0,
    "notionDescription" TEXT,
    "notionNotes" TEXT,
    "dueDate" DATETIME,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "HROkr" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "asanaTaskId" TEXT NOT NULL,
    "quarter" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "progressPercent" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "DailySnapshot" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "date" DATETIME NOT NULL,
    "totalHeadcount" INTEGER NOT NULL,
    "openRoles" INTEGER NOT NULL,
    "avgTimeToFill" REAL,
    "avgTimeToHire" REAL,
    "offerAcceptanceRate" REAL,
    "probationSuccessRate" REAL,
    "earlyAttritionCount" INTEGER NOT NULL,
    "syncedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "SyncLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "source" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "message" TEXT,
    "syncedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE UNIQUE INDEX "Termination_employeeId_key" ON "Termination"("employeeId");

-- CreateIndex
CREATE UNIQUE INDEX "CostPerHire_positionId_key" ON "CostPerHire"("positionId");

-- CreateIndex
CREATE UNIQUE INDEX "HRInitiative_asanaTaskId_key" ON "HRInitiative"("asanaTaskId");

-- CreateIndex
CREATE UNIQUE INDEX "HROkr_asanaTaskId_key" ON "HROkr"("asanaTaskId");

-- CreateIndex
CREATE UNIQUE INDEX "DailySnapshot_date_key" ON "DailySnapshot"("date");
