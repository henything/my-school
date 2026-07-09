import { ParentAccessForm } from "@/app/parent/parent-access-form";

type ResetPasswordPageProps = {
  searchParams: Promise<{ token?: string }>;
};

export default async function ParentResetPasswordPage({ searchParams }: ResetPasswordPageProps) {
  const { token = "" } = await searchParams;

  return (
    <main className="flex min-h-screen items-center px-4 py-10">
      <ParentAccessForm token={token} mode="reset" />
    </main>
  );
}
