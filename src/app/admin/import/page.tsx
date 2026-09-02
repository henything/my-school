import { ExcelImportPanel } from "@/app/admin/import/components/excel-import-panel";
import { requireRole } from "@/server/auth/current-user";
import { listExcelImportBatches } from "@/server/import/excel-import-service";

export default async function ExcelImportPage() {
  const currentUser = await requireRole(["SUPER_ADMIN"]);
  const batches = await listExcelImportBatches(currentUser);

  return (
    <div className="grid gap-6">
      <section>
        <h1 className="mt-2 text-2xl font-bold">Excel import</h1>
      </section>

      <ExcelImportPanel initialBatches={batches} />
    </div>
  );
}
