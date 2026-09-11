import { StatusBadge } from "@/components/badges";

type DocumentListItem = {
  id: string;
  periodStart: string;
  periodEnd: string;
  status: string;
  fileName: string;
  fileHref: string;
  comment: string | null;
  result: string | null;
};

type ParentDocumentListProps = {
  items: DocumentListItem[];
  emptyText: string;
};

export function ParentDocumentList({ items, emptyText }: ParentDocumentListProps) {
  if (items.length === 0) {
    return <div className="p-5 text-sm font-semibold text-[var(--muted)]">{emptyText}</div>;
  }

  return (
    <div className="grid gap-3 p-5">
      {items.map((item) => (
        <div key={item.id} className="rounded-lg border border-[var(--line)] bg-white px-4 py-3">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="font-bold">
                {item.periodStart} - {item.periodEnd}
              </div>
              <a className="mt-1 block break-words text-sm font-semibold text-[var(--accent-strong)]" href={item.fileHref} target="_blank">
                {item.fileName}
              </a>
            </div>
            <StatusBadge status={item.status} />
          </div>
          <div className="mt-3 grid gap-2 text-sm font-semibold text-[var(--muted)]">
            {item.comment ? <div>{item.comment}</div> : null}
            {item.result ? <div>{item.result}</div> : null}
          </div>
        </div>
      ))}
    </div>
  );
}
