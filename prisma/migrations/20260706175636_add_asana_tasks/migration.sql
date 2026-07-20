-- CreateTable
CREATE TABLE "AsanaTask" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "gid" TEXT NOT NULL,
    "projectGid" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "completed" BOOLEAN NOT NULL DEFAULT false,
    "completedAt" DATETIME,
    "createdAt" DATETIME NOT NULL,
    "dueOn" DATETIME,
    "modifiedAt" DATETIME NOT NULL,
    "assignee" TEXT,
    "section" TEXT,
    "quarter" TEXT,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "RoadmapSyncMeta" (
    "id" TEXT NOT NULL PRIMARY KEY DEFAULT 'singleton',
    "lastSyncedAt" DATETIME,
    "lastMode" TEXT,
    "taskCount" INTEGER NOT NULL DEFAULT 0
);

-- CreateIndex
CREATE UNIQUE INDEX "AsanaTask_gid_key" ON "AsanaTask"("gid");
