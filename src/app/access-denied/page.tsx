import Link from "next/link";
import { ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function AccessDeniedPage() {
  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-10">
      <section className="panel w-full max-w-md p-6 text-center sm:p-8">
        <ShieldAlert className="mx-auto text-[var(--danger)]" aria-hidden="true" size={36} />
        <h1 className="mt-5 text-2xl font-bold">Доступ запрещён</h1>
        <p className="mt-2 text-sm leading-6 text-[var(--muted)]">У текущей роли нет прав на этот раздел.</p>
        <Button asChild className="mt-6">
          <Link href="/">Вернуться</Link>
        </Button>
      </section>
    </main>
  );
}
