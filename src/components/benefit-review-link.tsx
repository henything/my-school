import Link from "next/link";

export function BenefitReviewLink({ parentId }: { parentId: string | null }) {
  return <Link className="inline-flex rounded-lg bg-[var(--accent)] px-4 py-3 text-sm font-bold text-white" href={`/admin/directories?benefitParentId=${encodeURIComponent(parentId ?? "")}#parent-benefits`}>Проверить документ и принять решение</Link>;
}
