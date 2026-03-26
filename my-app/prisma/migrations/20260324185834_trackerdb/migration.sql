-- CreateEnum
CREATE TYPE "Role" AS ENUM ('OWNER', 'ADMIN', 'MEMBER');

-- CreateEnum
CREATE TYPE "ThreadInputType" AS ENUM ('UPDATE', 'BLOCKER', 'IDEA', 'TASK_SOURCE');

-- CreateEnum
CREATE TYPE "ThreadVisibility" AS ENUM ('TEAM', 'ORG', 'PRIVATE');

-- CreateEnum
CREATE TYPE "WorkType" AS ENUM ('FEATURE', 'BUG', 'MEETING', 'OTHER');

-- CreateEnum
CREATE TYPE "BlockerType" AS ENUM ('CODE', 'DEPENDENCY', 'REQUIREMENT');

-- CreateEnum
CREATE TYPE "Urgency" AS ENUM ('LOW', 'MEDIUM', 'HIGH');

-- CreateEnum
CREATE TYPE "IdeaImpact" AS ENUM ('LOW', 'MEDIUM', 'HIGH');

-- CreateEnum
CREATE TYPE "ActivityType" AS ENUM ('REACTION', 'CONVERTED_TO_TASK', 'COMMENT');

-- AlterTable
ALTER TABLE "threads" ADD COLUMN     "content" VARCHAR(500),
ADD COLUMN     "input_type" "ThreadInputType",
ADD COLUMN     "taskId" UUID,
ADD COLUMN     "visibility" "ThreadVisibility";

-- CreateTable
CREATE TABLE "memberships" (
    "id" TEXT NOT NULL,
    "userId" UUID NOT NULL,
    "orgId" UUID NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'MEMBER',
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "memberships_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invites" (
    "id" TEXT NOT NULL,
    "orgId" UUID NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'MEMBER',
    "token" VARCHAR(255) NOT NULL,
    "invitedBy" UUID NOT NULL,
    "maxUses" INTEGER,
    "usedCount" INTEGER NOT NULL DEFAULT 0,
    "expiresAt" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "invites_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "thread_meta" (
    "id" TEXT NOT NULL,
    "threadId" UUID NOT NULL,
    "workType" "WorkType",
    "blockerType" "BlockerType",
    "urgency" "Urgency",
    "ideaImpact" "IdeaImpact",

    CONSTRAINT "thread_meta_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "thread_activities" (
    "id" TEXT NOT NULL,
    "threadId" UUID NOT NULL,
    "type" "ActivityType" NOT NULL,
    "userId" UUID NOT NULL,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "thread_activities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "thread_stats" (
    "id" TEXT NOT NULL,
    "threadId" UUID NOT NULL,
    "reactionsCount" INTEGER NOT NULL DEFAULT 0,
    "commentsCount" INTEGER NOT NULL DEFAULT 0,
    "conversionCount" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "thread_stats_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "memberships_orgId_idx" ON "memberships"("orgId");

-- CreateIndex
CREATE INDEX "memberships_userId_idx" ON "memberships"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "memberships_userId_orgId_key" ON "memberships"("userId", "orgId");

-- CreateIndex
CREATE INDEX "invites_orgId_idx" ON "invites"("orgId");

-- CreateIndex
CREATE INDEX "invites_invitedBy_idx" ON "invites"("invitedBy");

-- CreateIndex
CREATE INDEX "invites_isActive_idx" ON "invites"("isActive");

-- CreateIndex
CREATE INDEX "invites_expiresAt_idx" ON "invites"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "invites_token_key" ON "invites"("token");

-- CreateIndex
CREATE UNIQUE INDEX "thread_meta_threadId_key" ON "thread_meta"("threadId");

-- CreateIndex
CREATE INDEX "thread_meta_threadId_idx" ON "thread_meta"("threadId");

-- CreateIndex
CREATE INDEX "thread_activities_threadId_idx" ON "thread_activities"("threadId");

-- CreateIndex
CREATE INDEX "thread_activities_userId_idx" ON "thread_activities"("userId");

-- CreateIndex
CREATE INDEX "thread_activities_createdAt_idx" ON "thread_activities"("createdAt" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "thread_stats_threadId_key" ON "thread_stats"("threadId");

-- CreateIndex
CREATE INDEX "thread_stats_threadId_idx" ON "thread_stats"("threadId");

-- CreateIndex
CREATE INDEX "threads_org_id_idx" ON "threads"("org_id");

-- CreateIndex
CREATE INDEX "threads_created_at_idx" ON "threads"("created_at" DESC);

-- AddForeignKey
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invites" ADD CONSTRAINT "invites_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invites" ADD CONSTRAINT "invites_invitedBy_fkey" FOREIGN KEY ("invitedBy") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "threads" ADD CONSTRAINT "threads_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "tasks"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "thread_meta" ADD CONSTRAINT "thread_meta_threadId_fkey" FOREIGN KEY ("threadId") REFERENCES "threads"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "thread_activities" ADD CONSTRAINT "thread_activities_threadId_fkey" FOREIGN KEY ("threadId") REFERENCES "threads"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "thread_activities" ADD CONSTRAINT "thread_activities_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "thread_stats" ADD CONSTRAINT "thread_stats_threadId_fkey" FOREIGN KEY ("threadId") REFERENCES "threads"("id") ON DELETE CASCADE ON UPDATE CASCADE;
