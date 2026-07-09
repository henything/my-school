import { ParentAccessForm } from "@/app/parent/parent-access-form";

type ActivatePageProps = {
  searchParams: Promise<{ token?: string }>;
};

export default async function ParentActivatePage({ searchParams }: ActivatePageProps) {
  const { token = "" } = await searchParams;

  return (
    <main className="flex min-h-screen items-center px-4 py-10">
      <ParentAccessForm token={token} mode="activate" />
    </main>
  );
}
