export function normalizeParentPhone(phone: string | null | undefined) {
  const raw = (phone ?? "").trim();
  const digits = raw.replace(/\D/g, "");

  if (!digits) {
    throw new Error("У родителя должен быть телефон для входа.");
  }

  const normalized = normalizeRussianPhoneDigits(digits);

  if (normalized.length < 10 || normalized.length > 15) {
    throw new Error("Телефон родителя должен содержать от 10 до 15 цифр.");
  }

  return normalized;
}

export function tryNormalizeParentPhone(phone: string | null | undefined) {
  try {
    return normalizeParentPhone(phone);
  } catch {
    return null;
  }
}

function normalizeRussianPhoneDigits(digits: string) {
  if (digits.length === 10) {
    return `7${digits}`;
  }

  if (digits.length === 11 && digits.startsWith("8")) {
    return `7${digits.slice(1)}`;
  }

  return digits;
}
