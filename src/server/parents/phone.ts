export function normalizeParentPhone(phone: string | null | undefined) {
  const raw = (phone ?? "").trim();
  const digits = raw.replace(/\D/g, "");

  if (!digits) {
    throw new Error("У родителя должен быть телефон для входа.");
  }

  const normalized = normalizeRussianPhoneDigits(digits);

  if (!normalized) {
    throw new Error("Телефон должен быть в формате +7XXXXXXXXXX.");
  }

  return normalized;
}

export function normalizeOptionalPhone(phone: string | null | undefined) {
  const raw = (phone ?? "").trim();

  if (!raw) {
    return null;
  }

  return normalizeParentPhone(raw);
}

export function phoneDigitsForProvider(phone: string | null | undefined) {
  return normalizeParentPhone(phone).slice(1);
}

export function legacyPhoneLogin(phone: string | null | undefined) {
  return normalizeParentPhone(phone).slice(1);
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
    return `+7${digits}`;
  }

  if (digits.length === 11 && digits.startsWith("8")) {
    return `+7${digits.slice(1)}`;
  }

  if (digits.length === 11 && digits.startsWith("7")) {
    return `+${digits}`;
  }

  return null;
}
