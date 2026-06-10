"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRightLeft, Baby, Building2, GraduationCap, Loader2, UserRoundPlus, UsersRound } from "lucide-react";
import { Button } from "@/components/ui/button";

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
  return (
    <section className="grid gap-4">
      <div className="grid gap-4 lg:grid-cols-2">
        <CreateBranchForm />
        {canCreateCoach ? <CreateCoachForm /> : null}
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <CreateGroupForm branches={branches.filter((branch) => branch.status !== "ARCHIVED")} coaches={coaches.filter((coach) => coach.status === "ACTIVE")} />
        <CreateParentForm />
      </div>
      <CreateChildForm groups={groups.filter((group) => group.status !== "ARCHIVED")} parents={parents} />
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
        <input className="field" name="phone" />
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
        inventoryNotes: nullable(formData.get("inventoryNotes")),
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
        <label className="label">
          Филиал
          <select className="field" name="branchId" required disabled={disabled}>
            <option value="">Выбрать</option>
            {branches.map((branch) => (
              <option key={branch.id} value={branch.id}>
                {branch.name}
              </option>
            ))}
          </select>
        </label>
        <label className="label">
          Тренер
          <select className="field" name="mainCoachId" required disabled={disabled}>
            <option value="">Выбрать</option>
            {coaches.map((coach) => (
              <option key={coach.id} value={coach.id}>
                {coach.displayName}
              </option>
            ))}
          </select>
        </label>
        <label className="label">
          Лимит
          <input className="field" name="capacityLimit" type="number" min={1} max={50} defaultValue={15} required disabled={disabled} />
        </label>
      </div>
      <label className="label">
        Инвентарь
        <input className="field" name="inventoryNotes" disabled={disabled} />
      </label>
      <label className="label">
        Комментарий
        <input className="field" name="comment" disabled={disabled} />
      </label>
      <FormFooter isSubmitting={isSubmitting} message={message} label="Создать" disabled={disabled} />
    </form>
  );
}

function CreateParentForm() {
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
      await submitJson("/api/parents", {
        fullName: nullable(formData.get("fullName")),
        phone: nullable(formData.get("phone")),
        vkProfileUrl: nullable(formData.get("vkProfileUrl")),
        comment: nullable(formData.get("comment"))
      });
      form.reset();
      setMessage("Родитель создан.");
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
        Родитель
      </h2>
      <label className="label">
        Имя
        <input className="field" name="fullName" />
      </label>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="label">
          Телефон
          <input className="field" name="phone" />
        </label>
        <label className="label">
          VK
          <input className="field" name="vkProfileUrl" />
        </label>
      </div>
      <label className="label">
        Комментарий
        <input className="field" name="comment" />
      </label>
      <FormFooter isSubmitting={isSubmitting} message={message} label="Создать" />
    </form>
  );
}

function CreateChildForm({ groups, parents }: { groups: Group[]; parents: Parent[] }) {
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
      await submitJson("/api/children", {
        fullName: formData.get("fullName"),
        parentId: nullable(formData.get("parentId")),
        currentGroupId: nullable(formData.get("currentGroupId")),
        birthDate: nullable(formData.get("birthDate")),
        status: formData.get("status"),
        medicalNotes: nullable(formData.get("medicalNotes")),
        coachComment: nullable(formData.get("coachComment")),
        adminComment: nullable(formData.get("adminComment")),
        admissionStatus: formData.get("admissionStatus")
      });
      form.reset();
      setMessage("Ребёнок создан.");
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
        <Baby aria-hidden="true" size={18} />
        Ребёнок
      </h2>
      <div className="grid gap-4 lg:grid-cols-[1fr_180px_1fr_1fr]">
        <label className="label">
          ФИО
          <input className="field" name="fullName" minLength={2} required />
        </label>
        <label className="label">
          Дата рождения
          <input className="field" name="birthDate" type="date" />
        </label>
        <label className="label">
          Родитель
          <select className="field" name="parentId">
            <option value="">Без родителя</option>
            {parents.map((parent) => (
              <option key={parent.id} value={parent.id}>
                {parent.fullName ?? parent.phone ?? "Контакт"}
              </option>
            ))}
          </select>
        </label>
        <label className="label">
          Группа
          <select className="field" name="currentGroupId">
            <option value="">Без группы</option>
            {groups.map((group) => (
              <option key={group.id} value={group.id}>
                {group.name} · {group.branch.name}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="label">
          Статус
          <select className="field" name="status" defaultValue="ACTIVE">
            <option value="ACTIVE">ACTIVE</option>
            <option value="PAUSED">PAUSED</option>
            <option value="LEFT">LEFT</option>
            <option value="TRIAL">TRIAL</option>
            <option value="ARCHIVED">ARCHIVED</option>
          </select>
        </label>
        <label className="label">
          Допуск
          <select className="field" name="admissionStatus" defaultValue="ADMITTED">
            <option value="ADMITTED">ADMITTED</option>
            <option value="CREDIT_LESSON_USED">CREDIT_LESSON_USED</option>
            <option value="NOT_ADMITTED">NOT_ADMITTED</option>
          </select>
        </label>
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        <label className="label">
          Медицинские ограничения
          <input className="field" name="medicalNotes" />
        </label>
        <label className="label">
          Комментарий тренера
          <input className="field" name="coachComment" />
        </label>
        <label className="label">
          Комментарий админа
          <input className="field" name="adminComment" />
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
      <select className="field min-h-9" name="currentGroupId" defaultValue={currentGroupId}>
        <option value="">Без группы</option>
        {groups.map((group) => (
          <option key={group.id} value={group.id}>
            {group.name}
          </option>
        ))}
      </select>
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
