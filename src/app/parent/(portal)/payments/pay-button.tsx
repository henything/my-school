"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { QrCode, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

type PayButtonProps = {
  invoiceId: string;
  expectedAmountKopeks: number;
  disabled?: boolean;
};

export function PayButton({ invoiceId, expectedAmountKopeks, disabled = false }: PayButtonProps) {
  const router = useRouter();
  const [message, setMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [outdatedAmount, setOutdatedAmount] = useState<number | null>(null);

  async function onPay() {
    setMessage("");
    setIsSubmitting(true);

    try {
      const response = await fetch(`/api/parent/invoices/${invoiceId}/pay`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ expectedAmountKopeks })
      });
      const payload = (await response.json().catch(() => ({}))) as { checkoutUrl?: string; error?: string };

      if (!response.ok || !payload.checkoutUrl) {
        if (response.status === 409) {
          setOutdatedAmount(expectedAmountKopeks);
          router.refresh();
        }
        throw new Error(payload.error ?? "Не удалось создать оплату.");
      }

      window.location.assign(payload.checkoutUrl);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Не удалось создать оплату.");
      setIsSubmitting(false);
    }
  }

  return (
    <div className="grid min-w-[180px] gap-2">
      <Button type="button" size="sm" onClick={onPay} disabled={disabled || isSubmitting || outdatedAmount === expectedAmountKopeks}>
        {isSubmitting ? <Loader2 aria-hidden="true" className="animate-spin" size={14} /> : <QrCode aria-hidden="true" size={14} />}
        Оплатить через СБП
      </Button>
      {message ? <span role="alert" className="text-xs font-semibold text-[var(--danger)]">{message}</span> : null}
    </div>
  );
}

export function InvoiceRefresh() {
  const router = useRouter();
  useEffect(() => {
    const refresh = () => { if (document.visibilityState === "visible") router.refresh(); };
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    const timer = window.setInterval(refresh, 30_000);
    return () => {
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
      window.clearInterval(timer);
    };
  }, [router]);
  return null;
}
