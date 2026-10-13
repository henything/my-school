ALTER TABLE "parents" ADD COLUMN "archived_at" TIMESTAMP(3);
ALTER TABLE "parents" ADD COLUMN "merged_into_parent_id" UUID;
CREATE INDEX "parents_archived_at_idx" ON "parents"("archived_at");
ALTER TABLE "parents" ADD CONSTRAINT "parents_merged_into_parent_id_fkey"
  FOREIGN KEY ("merged_into_parent_id") REFERENCES "parents"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
