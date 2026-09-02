import type { InvoiceStatus, PaymentStatus } from "@/generated/prisma/enums";
import type { Prisma } from "@/generated/prisma/client";
import { writeAuditLog } from "@/server/audit/audit-service";
import type { CurrentUser } from "@/server/auth/current-user";
import { getPrisma } from "@/server/db/prisma";
import { admissionStatusAfterLessonBalance } from "@/server/billing/calculations";
import { getActiveParentAccount } from "@/server/parents/parent-auth-service";
import { phoneDigitsForProvider } from "@/server/parents/phone";
import {
  createYooKassaPayment,
  getPublicAppOrigin,
  getYooKassaCredentials,
  getYooKassaPayment,
  parseYooKassaAmountKopeks,
  yookassaWebhookEventId,
  YOOKASSA_PROVIDER
} from "./yookassa";

type YooKassaWebhookPayload = {
  type?: string;
  event?: string;
  object?: {
    id?: string;
    status?: string;
    paid?: boolean;
    amount?: {
      value?: string;
      currency?: string;
    };
    metadata?: {
      invoiceId?: string;
      schoolId?: string;
      parentId?: string;
      childId?: string;
    };
  };
};

export async function createParentInvoicePayment(currentUser: CurrentUser, invoiceId: string, requestOrigin?: string) {
  if (currentUser.role !== "PARENT") {
    throw new Error("Онлайн-оплата доступна только в кабинете родителя.");
  }

  const account = await getActiveParentAccount(currentUser);
  const credentials = getYooKassaCredentials();
  const appOrigin = getPublicAppOrigin(requestOrigin);
  const prisma = getPrisma();
  const invoice = await prisma.invoice.findFirstOrThrow({
    where: {
      id: invoiceId,
      schoolId: currentUser.schoolId,
      parentId: account.parentId
    },
    include: {
      parent: true,
      child: { select: { id: true, fullName: true } }
    }
  });

  if (invoice.status === "PAID") {
    throw new Error("Счёт уже оплачен.");
  }

  if (invoice.status === "CANCELLED") {
    throw new Error("Отменённый счёт нельзя оплатить.");
  }

  const amountKopeks = invoice.amountKopeks - invoice.paidAmountKopeks;

  if (amountKopeks <= 0) {
    throw new Error("У счёта нет суммы к оплате.");
  }

  const customerPhone = phoneDigitsForProvider(invoice.parent.phone);
  const attempt = await prisma.paymentAttempt.create({
    data: {
      schoolId: invoice.schoolId,
      invoiceId: invoice.id,
      parentId: invoice.parentId,
      provider: YOOKASSA_PROVIDER,
      amountKopeks,
      status: "CREATED"
    }
  });

  try {
    const payment = await createYooKassaPayment({
      ...credentials,
      idempotenceKey: attempt.id,
      amountKopeks,
      invoiceId: invoice.id,
      invoiceNumber: invoice.number,
      schoolId: invoice.schoolId,
      parentId: invoice.parentId,
      childId: invoice.childId,
      customerPhone,
      returnUrl: `${appOrigin}/parent/payments?invoice=${invoice.id}`
    });

    const checkoutUrl = payment.confirmation?.confirmation_url;

    if (!checkoutUrl) {
      throw new Error("ЮKassa не вернула ссылку на оплату.");
    }

    await prisma.$transaction(async (tx) => {
      await tx.paymentAttempt.update({
        where: { id: attempt.id },
        data: {
          providerPaymentId: payment.id,
          checkoutUrl,
          status: "PENDING"
        }
      });

      await upsertPendingPayment(tx, {
        schoolId: invoice.schoolId,
        invoiceId: invoice.id,
        parentId: invoice.parentId,
        childId: invoice.childId,
        subscriptionId: invoice.subscriptionId,
        providerPaymentId: payment.id,
        amountKopeks
      });

      await tx.invoice.update({
        where: { id: invoice.id },
        data: { status: "PAYMENT_PENDING" }
      });

      await writeAuditLog(
        {
          schoolId: invoice.schoolId,
          actorUserId: currentUser.id,
          action: "ONLINE_PAYMENT_CREATED",
          entityType: "Invoice",
          entityId: invoice.id,
          newValue: {
            provider: YOOKASSA_PROVIDER,
            providerPaymentId: payment.id,
            amountKopeks,
            test: payment.test ?? null
          }
        },
        tx
      );
    });

    return { checkoutUrl };
  } catch (error) {
    await prisma.paymentAttempt.update({
      where: { id: attempt.id },
      data: {
        status: "FAILED"
      }
    });
    throw error;
  }
}

export async function handleYooKassaWebhook(payload: YooKassaWebhookPayload) {
  const event = payload.event;
  const paymentId = payload.object?.id;
  const status = payload.object?.status;
  const schoolId = payload.object?.metadata?.schoolId;

  if (payload.type !== "notification" || !event || !paymentId || !status || !schoolId) {
    throw new Error("Некорректное уведомление ЮKassa.");
  }

  const providerEventId = yookassaWebhookEventId(event, paymentId, status);
  const prisma = getPrisma();
  const webhookEvent = await createWebhookEventIfNew(prisma, {
    schoolId,
    providerEventId,
    providerPaymentId: paymentId,
    eventType: event,
    payload: payload as Prisma.InputJsonValue
  });

  if (!webhookEvent.created) {
    return { processed: true, duplicate: true };
  }

  const webhookEventId = webhookEvent.id;

  if (!webhookEventId) {
    throw new Error("Не удалось сохранить уведомление ЮKassa.");
  }

  try {
    const credentials = getYooKassaCredentials();
    const payment = await getYooKassaPayment(paymentId, credentials.shopId, credentials.secretKey);

    if (event === "payment.succeeded" && payment.status === "succeeded" && payment.paid) {
      await applySucceededProviderPayment(payment, paymentId);
    } else if (event === "payment.canceled" || payment.status === "canceled") {
      await applyCanceledProviderPayment(paymentId, payment.status);
    }

    await prisma.paymentWebhookEvent.update({
      where: { id: webhookEventId },
      data: {
        signatureValid: true,
        processedAt: new Date()
      }
    });

    return { processed: true, duplicate: false };
  } catch (error) {
    await prisma.paymentWebhookEvent.update({
      where: { id: webhookEventId },
      data: {
        processingError: error instanceof Error ? error.message : "Не удалось обработать уведомление."
      }
    });
    throw error;
  }
}

async function createWebhookEventIfNew(
  prisma: ReturnType<typeof getPrisma>,
  input: {
    schoolId: string;
    providerEventId: string;
    providerPaymentId: string;
    eventType: string;
    payload: Prisma.InputJsonValue;
  }
) {
  try {
    const event = await prisma.paymentWebhookEvent.create({
      data: {
        schoolId: input.schoolId,
        provider: YOOKASSA_PROVIDER,
        providerEventId: input.providerEventId,
        providerPaymentId: input.providerPaymentId,
        eventType: input.eventType,
        payload: input.payload
      }
    });
    return { created: true, id: event.id };
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      return { created: false, id: null };
    }
    throw error;
  }
}

async function applySucceededProviderPayment(payment: { amount: { value: string; currency: string }; metadata?: Record<string, unknown> }, providerPaymentId: string) {
  const invoiceId = typeof payment.metadata?.invoiceId === "string" ? payment.metadata.invoiceId : null;
  const schoolId = typeof payment.metadata?.schoolId === "string" ? payment.metadata.schoolId : null;

  if (!invoiceId || !schoolId) {
    throw new Error("В платеже ЮKassa нет привязки к счёту.");
  }

  const amountKopeks = parseYooKassaAmountKopeks(payment.amount.value);

  await getPrisma().$transaction(async (tx) => {
    const invoice = await tx.invoice.findFirstOrThrow({
      where: {
        id: invoiceId,
        schoolId
      },
      include: {
        child: { select: { id: true, admissionStatus: true, cachedLessonBalance: true } }
      }
    });

    const existingSucceededPayment = await tx.payment.findFirst({
      where: {
        provider: YOOKASSA_PROVIDER,
        providerPaymentId,
        status: "SUCCEEDED"
      }
    });

    if (existingSucceededPayment) {
      return;
    }

    const remainingAmount = Math.max(invoice.amountKopeks - invoice.paidAmountKopeks, 0);
    const paidAmountKopeks = invoice.paidAmountKopeks + Math.min(amountKopeks, remainingAmount);
    const nextInvoiceStatus: InvoiceStatus = paidAmountKopeks >= invoice.amountKopeks ? "PAID" : "PARTIALLY_PAID";
    const nextPaymentStatus: PaymentStatus = nextInvoiceStatus === "PAID" ? "PAID" : "PARTIALLY_PAID";

    const pendingPayment = await tx.payment.findFirst({
      where: {
        provider: YOOKASSA_PROVIDER,
        providerPaymentId
      }
    });

    if (pendingPayment) {
      await tx.payment.update({
        where: { id: pendingPayment.id },
        data: {
          status: "SUCCEEDED",
          amountKopeks,
          paidAt: new Date(),
          failedAt: null,
          failureReason: null
        }
      });
    } else {
      await tx.payment.create({
        data: {
          schoolId: invoice.schoolId,
          invoiceId: invoice.id,
          parentId: invoice.parentId,
          childId: invoice.childId,
          subscriptionId: invoice.subscriptionId,
          provider: YOOKASSA_PROVIDER,
          providerPaymentId,
          status: "SUCCEEDED",
          amountKopeks,
          paidAt: new Date()
        }
      });
    }

    await tx.paymentAttempt.updateMany({
      where: {
        provider: YOOKASSA_PROVIDER,
        providerPaymentId
      },
      data: {
        status: "SUCCEEDED"
      }
    });

    const updatedInvoice = await tx.invoice.update({
      where: { id: invoice.id },
      data: {
        paidAmountKopeks,
        status: nextInvoiceStatus,
        paidAt: nextInvoiceStatus === "PAID" ? new Date() : null
      }
    });

    if (invoice.subscriptionId) {
      await tx.subscription.update({
        where: { id: invoice.subscriptionId },
        data: {
          paymentStatus: nextPaymentStatus,
          paymentStatusChangedAt: new Date(),
          paymentStatusComment: "Оплачено онлайн через ЮKassa."
        }
      });
    }

    if (nextInvoiceStatus === "PAID") {
      await tx.child.update({
        where: { id: invoice.childId },
        data: {
          admissionStatus: admissionStatusAfterLessonBalance(invoice.child.cachedLessonBalance, invoice.child.admissionStatus)
        }
      });
    }

    await writeAuditLog(
      {
        schoolId: invoice.schoolId,
        actorUserId: null,
        action: "ONLINE_PAYMENT_SUCCEEDED",
        entityType: "Invoice",
        entityId: invoice.id,
        oldValue: {
          status: invoice.status,
          paidAmountKopeks: invoice.paidAmountKopeks
        },
        newValue: {
          status: updatedInvoice.status,
          paidAmountKopeks: updatedInvoice.paidAmountKopeks,
          provider: YOOKASSA_PROVIDER,
          providerPaymentId,
          amountKopeks
        }
      },
      tx
    );
  });
}

async function applyCanceledProviderPayment(providerPaymentId: string, status: string) {
  await getPrisma().$transaction(async (tx) => {
    const payment = await tx.payment.findFirst({
      where: {
        provider: YOOKASSA_PROVIDER,
        providerPaymentId
      }
    });

    await tx.paymentAttempt.updateMany({
      where: {
        provider: YOOKASSA_PROVIDER,
        providerPaymentId
      },
      data: {
        status: "CANCELLED"
      }
    });

    if (!payment) {
      return;
    }

    await tx.payment.update({
      where: { id: payment.id },
      data: {
        status: "CANCELLED",
        failedAt: new Date(),
        failureReason: status
      }
    });

    const invoice = await tx.invoice.findUnique({
      where: { id: payment.invoiceId }
    });

    if (invoice?.status === "PAYMENT_PENDING") {
      await tx.invoice.update({
        where: { id: invoice.id },
        data: {
          status: invoice.paidAmountKopeks > 0 ? "PARTIALLY_PAID" : "ISSUED"
        }
      });
    }
  });
}

async function upsertPendingPayment(
  tx: Prisma.TransactionClient,
  input: {
    schoolId: string;
    invoiceId: string;
    parentId: string;
    childId: string;
    subscriptionId: string | null;
    providerPaymentId: string;
    amountKopeks: number;
  }
) {
  const existingPayment = await tx.payment.findFirst({
    where: {
      provider: YOOKASSA_PROVIDER,
      providerPaymentId: input.providerPaymentId
    }
  });

  if (existingPayment) {
    await tx.payment.update({
      where: { id: existingPayment.id },
      data: {
        status: "PENDING",
        amountKopeks: input.amountKopeks,
        failedAt: null,
        failureReason: null
      }
    });
    return;
  }

  await tx.payment.create({
    data: {
      schoolId: input.schoolId,
      invoiceId: input.invoiceId,
      parentId: input.parentId,
      childId: input.childId,
      subscriptionId: input.subscriptionId,
      provider: YOOKASSA_PROVIDER,
      providerPaymentId: input.providerPaymentId,
      status: "PENDING",
      amountKopeks: input.amountKopeks
    }
  });
}

function isUniqueConstraintError(error: unknown) {
  return typeof error === "object" && error !== null && "code" in error && error.code === "P2002";
}
