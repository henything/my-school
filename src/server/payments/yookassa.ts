import { z } from "zod";

export const YOOKASSA_PROVIDER = "YOOKASSA";
export const YOOKASSA_RECEIPT_DESCRIPTION = "Оказание физкультурно-оздоровительной услуги";
export const YOOKASSA_TAX_SYSTEM_PATENT = 6;
export const YOOKASSA_VAT_NONE = 1;

type YooKassaPaymentInput = {
  shopId: string;
  secretKey: string;
  idempotenceKey: string;
  amountKopeks: number;
  invoiceId: string;
  invoiceNumber: string;
  schoolId: string;
  parentId: string;
  childId: string;
  customerPhone: string;
  returnUrl: string;
};

const yooKassaPaymentSchema = z.object({
  id: z.string(),
  status: z.string(),
  paid: z.boolean().optional(),
  test: z.boolean().optional(),
  amount: z.object({
    value: z.string(),
    currency: z.string()
  }),
  confirmation: z
    .object({
      type: z.string(),
      confirmation_url: z.string().url().optional()
    })
    .optional(),
  metadata: z.record(z.string(), z.unknown()).optional()
});

export type YooKassaPayment = z.infer<typeof yooKassaPaymentSchema>;

const yooKassaErrorSchema = z.object({
  type: z.string().optional(),
  id: z.string().optional(),
  code: z.string().optional(),
  description: z.string().optional(),
  parameter: z.string().optional()
});

export function getYooKassaCredentials() {
  const shopId = process.env.YOOKASSA_SHOP_ID?.trim();
  const secretKey = process.env.YOOKASSA_SECRET_KEY?.trim();

  if (!shopId) {
    throw new Error("Не указан shopId ЮKassa.");
  }

  if (!secretKey) {
    throw new Error("Не указан секретный ключ ЮKassa.");
  }

  return { shopId, secretKey };
}

export function hasYooKassaShopId() {
  return Boolean(process.env.YOOKASSA_SHOP_ID?.trim());
}

export function hasYooKassaSecretKey() {
  return Boolean(process.env.YOOKASSA_SECRET_KEY?.trim());
}

export function getPublicAppOrigin(requestOrigin?: string) {
  const configuredOrigin = process.env.APP_BASE_URL?.trim() || process.env.NEXT_PUBLIC_APP_URL?.trim() || requestOrigin;

  if (!configuredOrigin) {
    throw new Error("Не указан адрес сайта для возврата после оплаты.");
  }

  return configuredOrigin.replace(/\/+$/, "");
}

export async function createYooKassaPayment(input: YooKassaPaymentInput) {
  const response = await fetch("https://api.yookassa.ru/v3/payments", {
    method: "POST",
    headers: {
      Authorization: basicAuth(input.shopId, input.secretKey),
      "Content-Type": "application/json",
      "Idempotence-Key": input.idempotenceKey
    },
    body: JSON.stringify(buildYooKassaPaymentPayload(input))
  });

  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(yooKassaErrorMessage(payload));
  }

  return yooKassaPaymentSchema.parse(payload);
}

export async function getYooKassaPayment(paymentId: string, shopId: string, secretKey: string) {
  const response = await fetch(`https://api.yookassa.ru/v3/payments/${paymentId}`, {
    headers: {
      Authorization: basicAuth(shopId, secretKey)
    }
  });

  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(yooKassaErrorMessage(payload));
  }

  return yooKassaPaymentSchema.parse(payload);
}

export function buildYooKassaPaymentPayload(input: YooKassaPaymentInput) {
  return {
    amount: {
      value: formatKopeksForYooKassa(input.amountKopeks),
      currency: "RUB"
    },
    capture: true,
    confirmation: {
      type: "redirect",
      return_url: input.returnUrl
    },
    description: trimDescription(`Счёт ${input.invoiceNumber}`),
    metadata: {
      invoiceId: input.invoiceId,
      invoiceNumber: input.invoiceNumber,
      schoolId: input.schoolId,
      parentId: input.parentId,
      childId: input.childId
    },
    receipt: {
      customer: {
        phone: input.customerPhone
      },
      tax_system_code: YOOKASSA_TAX_SYSTEM_PATENT,
      items: [
        {
          description: YOOKASSA_RECEIPT_DESCRIPTION,
          amount: {
            value: formatKopeksForYooKassa(input.amountKopeks),
            currency: "RUB"
          },
          vat_code: YOOKASSA_VAT_NONE,
          quantity: "1.00",
          measure: "another",
          payment_subject: "service",
          payment_mode: "full_payment"
        }
      ]
    }
  };
}

export function formatKopeksForYooKassa(value: number) {
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error("Сумма платежа должна быть больше 0.");
  }

  return (value / 100).toFixed(2);
}

export function parseYooKassaAmountKopeks(value: string) {
  if (!/^\d+(\.\d{1,2})?$/.test(value)) {
    throw new Error("ЮKassa вернула некорректную сумму платежа.");
  }

  return Math.round(Number(value) * 100);
}

export function yookassaWebhookEventId(event: string, paymentId: string, status: string) {
  return `${event}:${paymentId}:${status}`;
}

function basicAuth(shopId: string, secretKey: string) {
  return `Basic ${Buffer.from(`${shopId}:${secretKey}`).toString("base64")}`;
}

function trimDescription(value: string) {
  return value.length <= 128 ? value : value.slice(0, 128);
}

function yooKassaErrorMessage(payload: unknown) {
  const parsed = yooKassaErrorSchema.safeParse(payload);

  if (!parsed.success) {
    return "ЮKassa вернула ошибку.";
  }

  return parsed.data.description ?? parsed.data.code ?? "ЮKassa вернула ошибку.";
}
