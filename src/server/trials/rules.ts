import type { TrialStatus } from "@/generated/prisma/enums";

export const coachEditableTrialStatuses: TrialStatus[] = ["TRIAL_BOOKED", "CONTACT_COLLECTED", "TRIAL_ATTENDED", "TRIAL_NO_SHOW"];
export const coachSettableTrialStatuses: TrialStatus[] = ["CONTACT_COLLECTED", "TRIAL_ATTENDED", "TRIAL_NO_SHOW"];
export const terminalTrialStatuses: TrialStatus[] = ["TRANSFERRED_TO_ADMIN", "CONVERTED_TO_ACTIVE"];

export function canCoachSetTrialStatus(status: TrialStatus) {
  return coachSettableTrialStatuses.includes(status);
}

export function canCoachEditTrial(status: TrialStatus) {
  return coachEditableTrialStatuses.includes(status);
}

export function trialNeedsProcessingTask(status: TrialStatus) {
  return status === "TRIAL_ATTENDED" || status === "TRIAL_NO_SHOW";
}

export function trialClosesProcessingTask(status: TrialStatus) {
  return terminalTrialStatuses.includes(status);
}

export function assertTrialCanBeConverted(status: TrialStatus) {
  if (status === "CONVERTED_TO_ACTIVE") {
    throw new Error("Пробник уже конвертирован.");
  }

  if (status === "TRANSFERRED_TO_ADMIN") {
    throw new Error("Пробник уже закрыт как переданный админу.");
  }
}
