"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRightLeft, Baby, Building2, GraduationCap, Loader2, UserRoundPlus, UsersRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SearchableCombobox } from "@/components/ui/searchable-combobox";
import { labelForEnum } from "@/lib/labels";

type Branch = {
  id: string;
  name: string;
  status: string;
};

type Coach = {
  id: string;
  displayName: string;
  login: string;
  status: string;
};

type Group = {
  id: string;
  name: string;
  status: string;
  branch: { name: string };
  activeChildrenCount: number;
  capacityLimit: number;
};

type Parent = {
  id: string;
  fullName: string | null;
  phone: string | null;
};

type DirectoryFormsProps = {
  canCreateCoach: boolean;
  branches: Branch[];
  coaches: Coach[];
  groups: Group[];
  parents: Parent[];
};

function nullable(value: FormDataEntryValue | null) {
  const text = typeof value === "string" ? value.trim() : "";
  return text.length > 0 ? text : null;
}

async function submitJson(path: string, body: unknown) {
  const response = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });

  const payload = (await response.json().catch(() => ({}))) as { error?: string };

  if (!response.ok) {
    throw new Error(payload.error ?? "Не удалось сохранить.");
  }
}

export function DirectoryForms({ canCreateCoach, branches, coaches, groups, parents }: DirectoryFormsProps) {
  const activeBranches = branches.filter((branch) => branch.status !== "ARCHIVED");
  const activeCoaches = coaches.filter((coach) => coach.status === "ACTIVE");
  const activeGroups = groups.filter((group) => group.status !== "ARCHIVED");

  return (
    <section className="grid gap-4">
      <div className={canCreateCoach ? "grid gap-4 lg:grid-cols-2 xl:grid-cols-3" : "grid gap-4 lg:grid-cols-2"}>
        <CreateBranchForm />
        {canCreateCoach ? <CreateCoachForm /> : null}
        <CreateGroupForm branches={activeBranches} coaches={activeCoaches} />
      </div>
      <CreateChildEnrollmentForm groups={activeGroups} parents={parents} />
    </section>
  );
}

function CreateBranchForm() {
  const router = useRouter();
  const [message, setMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    setIsSubmitting(true);

    const form = event.currentTarget;
    const formData = new FormData(form);

    try {
      await submitJson("/api/branches", {
        name: formData.get("name"),
        address: nullable(formData.get("address")),
        inventoryNotes: nullable(formData.get("inventoryNotes")),
        comment: nullable(formData.get("comment"))
      });
      form.reset();
      setMessage("Филиал создан.");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Не удалось сохранить.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form className="panel grid gap-4 p-5" onSubmit={onSubmit}>
      <h2 className="flex items-center gap-2 text-lg font-bold">
        <Building2 aria-hidden="true" size={18} />
        Филиал
      </h2>
      <label className="label">
        Название
        <input className="field" name="name" minLength={2} required />
      </label>
      <label className="label">
        Адрес
        <input className="field" name="address" />
      </label>
      <label className="label">
        Инвентарь
        <input className="field" name="inventoryNotes" />
      </label>
      <label className="label">
        Комментарий
        <input className="field" name="comment" />
      </label>
      <FormFooter isSubmitting={isSubmitting} message={message} label="Создать" />
    </form>
  );
}

function CreateCoachForm() {
  const router = useRouter();
  const [message, setMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    setIsSubmitting(true);

    const form = event.currentTarget;
    const formData = new FormData(form);

    try {
      await submitJson("/api/coaches", {
        displayName: formData.get("displayName"),
        login: formData.get("login"),
        password: formData.get("password"),
        phone: nullable(formData.get("phone")),
        notes: nullable(formData.get("notes"))
      });
      form.reset();
      setMessage("Тренер создан.");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Не удалось сохранить.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form className="panel grid gap-4 p-5" onSubmit={onSubmit}>
      <h2 className="flex items-center gap-2 text-lg font-bold">
        <GraduationCap aria-hidden="true" size={18} />
        Тренер
      </h2>
      <label className="label">
        Имя
        <input className="field" name="displayName" minLength={2} required />
      </label>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="label">
          Логин
          <input className="field" name="login" minLength={3} required />
        </label>
        <label className="label">
          Пароль
          <input className="field" name="password" type="password" minLength={10} required />
        </label>
      </div>
      <label className="label">
        Телефон
        <input className="field" name="phone" type="tel" inputMode="tel" placeholder="+7 999 123-45-67" pattern="[+0-9()\\s.-]{5,30}" />
      </label>
      <label className="label">
        Комментарий
        <input className="field" name="notes" />
      </label>
      <FormFooter isSubmitting={isSubmitting} message={message} label="Создать" />
    </form>
  );
}

function CreateGroupForm({ branches, coaches }: { branches: Branch[]; coaches: Coach[] }) {
  const router = useRouter();
  const [message, setMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const disabled = branches.length === 0 || coaches.length === 0;

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    setIsSubmitting(true);

    const form = event.currentTarget;
    const formData = new FormData(form);

    try {
      await submitJson("/api/groups", {
        name: formData.get("name"),
        branchId: formData.get("branchId"),
        mainCoachId: formData.get("mainCoachId"),
        capacityLimit: formData.get("capacityLimit"),
        comment: nullable(formData.get("comment"))
      });
      form.reset();
      setMessage("Группа создана.");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Не удалось сохранить.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form className="panel grid gap-4 p-5" onSubmit={onSubmit}>
      <h2 className="flex items-center gap-2 text-lg font-bold">
        <UsersRound aria-hidden="true" size={18} />
        Группа
      </h2>
      <label className="label">
        Название
        <input className="field" name="name" minLength={2} required disabled={disabled} />
      </label>
      <div className="grid gap-4 sm:grid-cols-[1fr_1fr_120px]">
        <div className="label">
          <span>Филиал</span>
          <SearchableCombobox
            name="branchId"
            required
            disabled={disabled}
            placeholder="Найти филиал"
            options={branches.map((branch) => ({ value: branch.id, label: branch.name, description: labelForEnum(branch.status) }))}
          />
        </div>
        <div className="label">
          <span>Тренер</span>
          <SearchableCombobox
            name="mainCoachId"
            required
            disabled={disabled}
            placeholder="Найти тренера"
            options={coaches.map((coach) => ({ value: coach.id, label: coach.displayName, description: `${coach.login} · ${labelForEnum(coach.status)}` }))}
          />
        </div>
        <label className="label">
          Лимит
          <input className="field" name="capacityLimit" type="number" min={1} max={50} defaultValue={15} required disabled={disabled} />
        </label>
      </div>
      <label className="label">
        Комментарий
        <input className="field" name="comment" disabled={disabled} />
      </label>
      <FormFooter isSubmitting={isSubmitting} message={message} label="Создать" disabled={disabled} />
    </form>
  );
}

function CreateChildEnrollmentForm({ groups, parents }: { groups: Group[]; parents: Parent[] }) {
  const router = useRouter();
  const [message, setMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    setIsSubmitting(true);

    const form = event.currentTarget;
    const formData = new FormData(form);

    try {
      await submitJson("/api/children/enroll", {
        fullName: formData.get("fullName"),
        parentId: nullable(formData.get("parentId")),
        parentFullName: nullable(formData.get("parentFullName")),
        parentPhone: nullable(formData.get("parentPhone")),
        parentVkProfileUrl: nullable(formData.get("parentVkProfileUrl")),
        currentGroupId: nullable(formData.get("currentGroupId")),
        birthDate: nullable(formData.get("birthDate")),
        status: formData.get("status"),
        medicalNotes: nullable(formData.get("medicalNotes")),
        comment: nullable(formData.get("comment")),
        admissionStatus: formData.get("admissionStatus")
      });
      form.reset();
      setMessage("Ребёнок заведён.");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Не удалось сохранить.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form className="panel grid gap-4 p-5" onSubmit={onSubmit}>
      <h2 className="flex items-center gap-2 text-lg font-bold">
        <UserRoundPlus aria-hidden="true" size={18} />
        Заведение ребёнка в систему
      </h2>
      <div className="grid gap-5 lg:grid-cols-2">
        <fieldset className="grid gap-4">
          <legend className="mb-1 text-sm font-bold text-[var(--muted)]">Родитель</legend>
          <div className="label">
            <span>Родитель в базе</span>
            <SearchableCombobox
              name="parentId"
              placeholder="Найти родителя"
              emptyValueLabel="Новый или без родителя"
              options={parents.map((parent) => ({
                value: parent.id,
                label: parent.fullName ?? parent.phone ?? "Контакт",
                description: parent.phone ?? "без телефона"
              }))}
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="label">
              Имя нового родителя
              <input className="field" name="parentFullName" />
            </label>
            <label className="label">
              Телефон
              <input className="field" name="parentPhone" type="tel" inputMode="tel" placeholder="+79991234567" />
            </label>
          </div>
          <label className="label">
            VK
            <input className="field" name="parentVkProfileUrl" />
          </label>
        </fieldset>

        <fieldset className="grid gap-4">
          <legend className="mb-1 flex items-center gap-2 text-sm font-bold text-[var(--muted)]">
            <Baby aria-hidden="true" size={15} />
            Ребёнок
          </legend>
          <div className="grid gap-4 sm:grid-cols-[1fr_180px]">
            <label className="label">
              ФИО
              <input className="field" name="fullName" minLength={2} required />
            </label>
            <label className="label">
              Дата рождения
              <input className="field" name="birthDate" type="date" />
            </label>
          </div>
          <div className="label">
            <span>Группа</span>
            <SearchableCombobox
              name="currentGroupId"
              placeholder="Найти группу"
              emptyValueLabel="Без группы"
              options={groups.map((group) => ({
                value: group.id,
                label: group.name,
                description: `${group.branch.name} · ${group.activeChildrenCount}/${group.capacityLimit}`
              }))}
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="label">
              Статус
              <select className="field" name="status" defaultValue="ACTIVE">
                <option value="ACTIVE">{labelForEnum("ACTIVE")}</option>
                <option value="PAUSED">{labelForEnum("PAUSED")}</option>
                <option value="LEFT">{labelForEnum("LEFT")}</option>
                <option value="TRIAL">{labelForEnum("TRIAL")}</option>
                <option value="ARCHIVED">{labelForEnum("ARCHIVED")}</option>
              </select>
            </label>
            <label className="label">
              Допуск
              <select className="field" name="admissionStatus" defaultValue="ADMITTED">
                <option value="ADMITTED">{labelForEnum("ADMITTED")}</option>
                <option value="CREDIT_LESSON_USED">{labelForEnum("CREDIT_LESSON_USED")}</option>
                <option value="NOT_ADMITTED">{labelForEnum("NOT_ADMITTED")}</option>
              </select>
            </label>
          </div>
        </fieldset>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <label className="label">
          Медицинские ограничения
          <input className="field" name="medicalNotes" />
        </label>
        <label className="label">
          Комментарий
          <input className="field" name="comment" />
        </label>
      </div>
      <FormFooter isSubmitting={isSubmitting} message={message} label="Создать" />
    </form>
  );
}

export function ChildTransferForm({ childId, currentGroupId, groups }: { childId: string; currentGroupId: string; groups: Group[] }) {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);

    const formData = new FormData(event.currentTarget);
    const currentGroupIdValue = nullable(formData.get("currentGroupId"));

    await fetch(`/api/children/${childId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ currentGroupId: currentGroupIdValue })
    });

    setIsSubmitting(false);
    router.refresh();
  }

  return (
    <form className="flex min-w-[230px] items-center gap-2" onSubmit={onSubmit}>
      <SearchableCombobox
        name="currentGroupId"
        defaultValue={currentGroupId}
        placeholder="Группа"
        emptyValueLabel="Без группы"
        compact
        className="min-w-0 flex-1"
        options={groups.map((group) => ({
          value: group.id,
          label: group.name,
          description: `${group.branch.name} · ${group.activeChildrenCount}/${group.capacityLimit}`
        }))}
      />
      <Button type="submit" size="icon" variant="secondary" disabled={isSubmitting} title="Перевести">
        <ArrowRightLeft aria-hidden="true" size={15} />
      </Button>
    </form>
  );
}

function FormFooter({ isSubmitting, message, label, disabled = false }: { isSubmitting: boolean; message: string; label: string; disabled?: boolean }) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <Button type="submit" disabled={disabled || isSubmitting}>
        {isSubmitting ? <Loader2 aria-hidden="true" className="animate-spin" size={16} /> : null}
        {label}
      </Button>
      {message ? <span className="text-sm font-semibold text-[var(--muted)]">{message}</span> : null}
    </div>
  );
}
