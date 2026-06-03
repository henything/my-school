import { redirect } from "next/navigation";
import { LoginForm } from "@/app/login/login-form";
import { getCurrentUser } from "@/server/auth/current-user";

export default async function LoginPage() {
  const user = await getCurrentUser();

  if (user) {
    redirect(user.role === "COACH" ? "/coach" : "/admin");
  }

  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-10">
      <section className="panel w-full max-w-md p-6 sm:p-8">
        <div className="mb-8">
          <p className="text-sm font-semibold uppercase text-[var(--accent-strong)]">Азбука движения</p>
          <h1 className="mt-2 text-2xl font-bold">Вход в My School</h1>
          <p className="mt-2 text-sm leading-6 text-[var(--muted)]">Внутренняя система для администраторов и тренеров.</p>
        </div>
        <LoginForm />
      </section>
    </main>
  );
}
