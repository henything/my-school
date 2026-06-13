-- AlterTable
ALTER TABLE "tasks" ADD COLUMN "closed_comment" TEXT;

-- CreateIndex
CREATE INDEX "tasks_school_id_status_priority_due_at_idx" ON "tasks"("school_id", "status", "priority", "due_at");
