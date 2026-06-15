-- CreateEnum
CREATE TYPE "ImportBatchStatus" AS ENUM (
    'UPLOADED',
    'VALIDATING',
    'VALIDATION_FAILED',
    'READY_TO_IMPORT',
    'IMPORTED',
    'FAILED'
);

-- CreateEnum
CREATE TYPE "ImportIssueSeverity" AS ENUM (
    'ERROR',
    'WARNING'
);

-- CreateTable
CREATE TABLE "import_batches" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "uploaded_by_user_id" UUID,
    "file_name" TEXT NOT NULL,
    "file_hash" TEXT,
    "status" "ImportBatchStatus" NOT NULL DEFAULT 'UPLOADED',
    "total_rows" INTEGER NOT NULL DEFAULT 0,
    "success_rows" INTEGER NOT NULL DEFAULT 0,
    "failed_rows" INTEGER NOT NULL DEFAULT 0,
    "preview" JSONB,
    "parsed_payload" JSONB,
    "result" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "import_batches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "import_errors" (
    "id" UUID NOT NULL,
    "import_batch_id" UUID NOT NULL,
    "severity" "ImportIssueSeverity" NOT NULL DEFAULT 'ERROR',
    "sheet_name" TEXT NOT NULL,
    "row_number" INTEGER,
    "field_name" TEXT,
    "error_message" TEXT NOT NULL,
    "raw_row" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "import_errors_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "import_batches_school_id_idx" ON "import_batches"("school_id");

-- CreateIndex
CREATE INDEX "import_batches_uploaded_by_user_id_idx" ON "import_batches"("uploaded_by_user_id");

-- CreateIndex
CREATE INDEX "import_batches_status_idx" ON "import_batches"("status");

-- CreateIndex
CREATE INDEX "import_batches_created_at_idx" ON "import_batches"("created_at");

-- CreateIndex
CREATE INDEX "import_errors_import_batch_id_idx" ON "import_errors"("import_batch_id");

-- CreateIndex
CREATE INDEX "import_errors_severity_idx" ON "import_errors"("severity");

-- CreateIndex
CREATE INDEX "import_errors_sheet_name_idx" ON "import_errors"("sheet_name");

-- AddForeignKey
ALTER TABLE "import_batches" ADD CONSTRAINT "import_batches_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "import_batches" ADD CONSTRAINT "import_batches_uploaded_by_user_id_fkey" FOREIGN KEY ("uploaded_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "import_errors" ADD CONSTRAINT "import_errors_import_batch_id_fkey" FOREIGN KEY ("import_batch_id") REFERENCES "import_batches"("id") ON DELETE CASCADE ON UPDATE CASCADE;
