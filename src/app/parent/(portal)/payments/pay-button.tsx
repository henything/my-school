"use client";

import { useState } from "react";
import { CreditCard, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

type PayButtonProps = {
  invoiceId: string;
  disabled?: boolean;
};

export function PayButton({ invoiceId, disabled = false }: PayButtonProps) {
  const [message, setMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function onPay() {
    setMessage("");
    setIsSubmitting(true);

    try {
      const response = await fetch(`/api/parent/invoices/${invoiceId}/pay`, {
        method: "POST",
        headers: { "Content-Type": "application/json" }
      });
      const payload = (await response.json().catch(() => ({}))) as { checkoutUrl?: string; error?: string };

      if (!response.ok || !payload.checkoutUrl) {
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
      <Button type="button" size="sm" onClick={onPay} disabled={disabled || isSubmitting}>
        {isSubmitting ? <Loader2 aria-hidden="true" className="animate-spin" size={14} /> : <CreditCard aria-hidden="true" size={14} />}
        Оплатить
      </Button>
      {message ? <span className="text-xs font-semibold text-[var(--danger)]">{message}</span> : null}
    </div>
  );
}
