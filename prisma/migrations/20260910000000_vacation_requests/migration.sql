CREATE TYPE "VacationRequestStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

CREATE TABLE "vacation_requests" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "child_id" UUID NOT NULL,
    "status" "VacationRequestStatus" NOT NULL DEFAULT 'PENDING',
    "period_start" DATE NOT NULL,
    "period_end" DATE NOT NULL,
    "original_file_name" TEXT NOT NULL,
    "storage_key" TEXT NOT NULL,
    "mime_type" TEXT NOT NULL,
    "file_size_bytes" INTEGER NOT NULL,
    "comment" TEXT,
    "admin_comment" TEXT,
    "lesson_count" INTEGER,
    "makeup_count" INTEGER,
    "uploaded_by_user_id" UUID NOT NULL,
    "reviewed_by_user_id" UUID,
    "reviewed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vacation_requests_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "vacation_requests_storage_key_key" ON "vacation_requests"("storage_key");
CREATE INDEX "vacation_requests_school_id_idx" ON "vacation_requests"("school_id");
CREATE INDEX "vacation_requests_child_id_idx" ON "vacation_requests"("child_id");
CREATE INDEX "vacation_requests_status_idx" ON "vacation_requests"("status");
CREATE INDEX "vacation_requests_period_start_period_end_idx" ON "vacation_requests"("period_start", "period_end");

ALTER TABLE "vacation_requests" ADD CONSTRAINT "vacation_requests_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "vacation_requests" ADD CONSTRAINT "vacation_requests_child_id_fkey" FOREIGN KEY ("child_id") REFERENCES "children"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "vacation_requests" ADD CONSTRAINT "vacation_requests_uploaded_by_user_id_fkey" FOREIGN KEY ("uploaded_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "vacation_requests" ADD CONSTRAINT "vacation_requests_reviewed_by_user_id_fkey" FOREIGN KEY ("reviewed_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
