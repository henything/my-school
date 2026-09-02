"use client";

import { Search, SlidersHorizontal } from "lucide-react";
import { type ReactNode, useMemo, useState } from "react";
import { ChildTransferForm } from "@/app/admin/directories/components/directory-forms";
import { RoleBadge, StatusBadge } from "@/components/badges";
import { labelForEnum, labelsForSearch } from "@/lib/labels";

type Group = {
  id: string;
  name: string;
  status: string;
  capacityLimit: number;
  activeChildrenCount: number;
  isOverCapacity: boolean;
  branch: { name: string };
  mainCoach: { displayName: string };
};

type Child = {
  id: string;
  fullName: string;
  status: string;
  admissionStatus: string;
  cachedMakeupBalance: number;
  parent: { fullName: string | null; phone: string | null } | null;
  currentGroup: { id: string; name: string } | null;
};

type DirectoryTablesProps = {
  groups: Group[];
  childRows: Child[];
  children?: ReactNode;
};

export function DirectoryTables({ groups, childRows, children }: DirectoryTablesProps) {
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [groupFilter, setGroupFilter] = useState("ALL");

  const normalizedQuery = normalize(query);
  const hasActiveFilters = normalizedQuery.length > 0 || statusFilter !== "ALL" || groupFilter !== "ALL";
  const filteredGroups = useMemo(
    () =>
      groups.filter((group) => {
        const matchesStatus = statusFilter === "ALL" || group.status === statusFilter;
        const matchesQuery =
          normalizedQuery.length === 0 ||
          toSearchText(`${group.name} ${group.branch.name} ${group.mainCoach.displayName} ${labelsForSearch(group.status)}`).includes(normalizedQuery);

        return matchesStatus && matchesQuery;
      }),
    [groups, normalizedQuery, statusFilter]
  );

  const filteredChildren = useMemo(
    () =>
      childRows.filter((child) => {
        const matchesStatus = statusFilter === "ALL" || child.status === statusFilter || child.admissionStatus === statusFilter;
        const matchesGroup = groupFilter === "ALL" || child.currentGroup?.id === groupFilter;
        const matchesQuery =
          normalizedQuery.length === 0 ||
          toSearchText(
            `${child.fullName} ${child.parent?.fullName ?? ""} ${child.parent?.phone ?? ""} ${child.currentGroup?.name ?? ""} ${labelsForSearch(child.status, child.admissionStatus)}`
          ).includes(normalizedQuery);

        return matchesStatus && matchesGroup && matchesQuery;
      }),
    [childRows, groupFilter, normalizedQuery, statusFilter]
  );

  const overCapacityCount = groups.filter((group) => group.isOverCapacity).length;
  const childrenWithoutGroupCount = childRows.filter((child) => !child.currentGroup).length;
  const attentionCount = childRows.filter((child) => child.admissionStatus !== "ADMITTED" || child.status !== "ACTIVE").length + overCapacityCount;
  const filteredTotal = filteredGroups.length + filteredChildren.length;
  const totalEntries = groups.length + childRows.length;

  return (
    <section className="grid gap-4">
      <div className="panel p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="flex items-center gap-2 text-lg font-bold">
              <Search className="text-[var(--accent)]" aria-hidden="true" size={18} />
              Поиск по таблицам
            </h2>
            <p className="mt-1 text-sm leading-6 text-[var(--muted)]">Фильтрует таблицы групп и детей по ФИО, телефону, группе, тренеру и статусу.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {hasActiveFilters ? <MetricChip label="Найдено" value={filteredTotal} tone={filteredTotal === 0 ? "warning" : "neutral"} /> : null}
            <MetricChip label="Группы" value={groups.length} />
            <MetricChip label="Дети" value={childRows.length} />
            <MetricChip label="Внимание" value={attentionCount} tone={attentionCount > 0 ? "warning" : "neutral"} />
            <MetricChip label="Без группы" value={childrenWithoutGroupCount} tone={childrenWithoutGroupCount > 0 ? "warning" : "neutral"} />
          </div>
        </div>

        <div className="mt-4 grid gap-3 lg:grid-cols-[minmax(0,1fr)_180px_minmax(180px,240px)]">
          <label className="label">
            Поиск
            <input className="field" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="ФИО, телефон, группа, тренер" />
          </label>
          <label className="label">
            Статус
            <select className="field" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
              <option value="ALL">Все статусы</option>
              <option value="ACTIVE">{labelForEnum("ACTIVE")}</option>
              <option value="TRIAL">{labelForEnum("TRIAL")}</option>
              <option value="PAUSED">{labelForEnum("PAUSED")}</option>
              <option value="LEFT">{labelForEnum("LEFT")}</option>
              <option value="ADMITTED">{labelForEnum("ADMITTED")}</option>
              <option value="NOT_ADMITTED">{labelForEnum("NOT_ADMITTED")}</option>
              <option value="CREDIT_LESSON_USED">{labelForEnum("CREDIT_LESSON_USED")}</option>
            </select>
          </label>
          <label className="label">
            Группа
            <select className="field" value={groupFilter} onChange={(event) => setGroupFilter(event.target.value)}>
              <option value="ALL">Все группы</option>
              {groups.map((group) => (
                <option key={group.id} value={group.id}>
                  {group.name}
                </option>
              ))}
            </select>
          </label>
        </div>

        {hasActiveFilters ? (
          <p className="mt-3 text-sm font-semibold text-[var(--muted)]">
            Показано {filteredTotal} из {totalEntries} записей: группы и дети ниже уже отфильтрованы.
          </p>
        ) : null}
      </div>

      <div className="grid gap-4">
        <div className="panel">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--line)] px-5 py-4">
            <h2 className="flex items-center gap-2 text-lg font-bold">
              <SlidersHorizontal className="text-[var(--accent)]" aria-hidden="true" size={18} />
              Группы
            </h2>
            <span className="text-sm font-semibold text-[var(--muted)]">{filteredGroups.length} из {groups.length}</span>
          </div>
          <div className="table-shell">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Название</th>
                  <th>Филиал</th>
                  <th>Тренер</th>
                  <th>Статус</th>
                  <th>Заполненность</th>
                </tr>
              </thead>
              <tbody>
                {filteredGroups.map((group) => (
                  <tr key={group.id} className={group.isOverCapacity ? "bg-[#fff9ec]" : undefined}>
                    <td className="font-semibold">{group.name}</td>
                    <td>{group.branch.name}</td>
                    <td>{group.mainCoach.displayName}</td>
                    <td>
                      <StatusBadge status={group.status} />
                    </td>
                    <td>
                      <span className={group.isOverCapacity ? "font-bold text-[var(--warning)]" : "font-semibold"}>
                        {group.activeChildrenCount}/{group.capacityLimit}
                      </span>
                    </td>
                  </tr>
                ))}
                {filteredGroups.length === 0 ? <EmptyTableRow colSpan={5} label="Группы по фильтрам не найдены." /> : null}
              </tbody>
            </table>
          </div>
        </div>

        <div className="panel">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--line)] px-5 py-4">
            <h2 className="text-lg font-bold">Дети</h2>
            <span className="text-sm font-semibold text-[var(--muted)]">{filteredChildren.length} из {childRows.length}</span>
          </div>
          <div className="table-shell">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Ребёнок</th>
                  <th>Родитель</th>
                  <th>Группа</th>
                  <th>Статус</th>
                  <th>Допуск</th>
                  <th>Переносы</th>
                  <th>Перевод</th>
                </tr>
              </thead>
              <tbody>
                {filteredChildren.map((child) => (
                  <tr key={child.id} className={child.admissionStatus !== "ADMITTED" ? "bg-[var(--red-soft)]" : undefined}>
                    <td className="font-semibold">{child.fullName}</td>
                    <td>
                      <div>{child.parent?.fullName ?? "-"}</div>
                      {child.parent?.phone ? <div className="text-xs text-[var(--muted)]">{child.parent.phone}</div> : null}
                    </td>
                    <td>{child.currentGroup?.name ?? "-"}</td>
                    <td>
                      <StatusBadge status={child.status} />
                    </td>
                    <td>
                      <RoleBadge role={child.admissionStatus} />
                    </td>
                    <td className="font-semibold">{child.cachedMakeupBalance}</td>
                    <td>
                      <ChildTransferForm childId={child.id} currentGroupId={child.currentGroup?.id ?? ""} groups={groups} />
                    </td>
                  </tr>
                ))}
                {filteredChildren.length === 0 ? <EmptyTableRow colSpan={7} label="Дети по фильтрам не найдены." /> : null}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {children ? <div className="grid gap-4">{children}</div> : null}
    </section>
  );
}

function MetricChip({ label, value, tone = "neutral" }: { label: string; value: number; tone?: "neutral" | "warning" }) {
  return (
    <span className={tone === "warning" ? "badge bg-[var(--yellow-soft)] text-[var(--warning-strong)]" : "badge bg-[var(--blue-soft)] text-[var(--accent-strong)]"}>
      {label}: {value}
    </span>
  );
}

function EmptyTableRow({ colSpan, label }: { colSpan: number; label: string }) {
  return (
    <tr>
      <td colSpan={colSpan} className="text-sm font-semibold text-[var(--muted)]">
        {label}
      </td>
    </tr>
  );
}

function normalize(value: string) {
  return value.trim().toLowerCase();
}

function toSearchText(value: string) {
  const normalized = normalize(value);
  const phoneSafe = normalized.replace(/[^\d+]/g, "");

  return `${normalized} ${phoneSafe}`;
}
