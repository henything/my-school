CREATE TYPE "MedicalCertificateStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

CREATE TABLE "medical_certificates" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "child_id" UUID NOT NULL,
    "attendance_record_id" UUID,
    "status" "MedicalCertificateStatus" NOT NULL DEFAULT 'PENDING',
    "period_start" DATE NOT NULL,
    "period_end" DATE NOT NULL,
    "original_file_name" TEXT NOT NULL,
    "storage_key" TEXT NOT NULL,
    "mime_type" TEXT NOT NULL,
    "file_size_bytes" INTEGER NOT NULL,
    "comment" TEXT,
    "admin_comment" TEXT,
    "uploaded_by_user_id" UUID NOT NULL,
    "reviewed_by_user_id" UUID,
    "reviewed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "medical_certificates_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "medical_certificates_storage_key_key" ON "medical_certificates"("storage_key");
CREATE INDEX "medical_certificates_school_id_idx" ON "medical_certificates"("school_id");
CREATE INDEX "medical_certificates_child_id_idx" ON "medical_certificates"("child_id");
CREATE INDEX "medical_certificates_attendance_record_id_idx" ON "medical_certificates"("attendance_record_id");
CREATE INDEX "medical_certificates_status_idx" ON "medical_certificates"("status");
CREATE INDEX "medical_certificates_period_start_period_end_idx" ON "medical_certificates"("period_start", "period_end");

ALTER TABLE "medical_certificates" ADD CONSTRAINT "medical_certificates_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "medical_certificates" ADD CONSTRAINT "medical_certificates_child_id_fkey" FOREIGN KEY ("child_id") REFERENCES "children"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "medical_certificates" ADD CONSTRAINT "medical_certificates_attendance_record_id_fkey" FOREIGN KEY ("attendance_record_id") REFERENCES "attendance_records"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "medical_certificates" ADD CONSTRAINT "medical_certificates_uploaded_by_user_id_fkey" FOREIGN KEY ("uploaded_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "medical_certificates" ADD CONSTRAINT "medical_certificates_reviewed_by_user_id_fkey" FOREIGN KEY ("reviewed_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
