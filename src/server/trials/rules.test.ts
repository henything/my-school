import { describe, expect, it } from "vitest";
import {
  assertTrialCanBeConverted,
  canCoachEditTrial,
  canCoachSetTrialStatus,
  trialClosesProcessingTask,
  trialNeedsProcessingTask
} from "./rules";

describe("trial rules", () => {
  it("allows coaches to set only contact, attended and no-show statuses", () => {
    expect(canCoachSetTrialStatus("CONTACT_COLLECTED")).toBe(true);
    expect(canCoachSetTrialStatus("TRIAL_ATTENDED")).toBe(true);
    expect(canCoachSetTrialStatus("TRIAL_NO_SHOW")).toBe(true);
    expect(canCoachSetTrialStatus("TRANSFERRED_TO_ADMIN")).toBe(false);
    expect(canCoachSetTrialStatus("CONVERTED_TO_ACTIVE")).toBe(false);
  });

  it("keeps converted and transferred trials read-only for coaches", () => {
    expect(canCoachEditTrial("TRIAL_BOOKED")).toBe(true);
    expect(canCoachEditTrial("CONTACT_COLLECTED")).toBe(true);
    expect(canCoachEditTrial("TRANSFERRED_TO_ADMIN")).toBe(false);
    expect(canCoachEditTrial("CONVERTED_TO_ACTIVE")).toBe(false);
  });

  it("creates processing tasks only after attendance outcome", () => {
    expect(trialNeedsProcessingTask("TRIAL_ATTENDED")).toBe(true);
    expect(trialNeedsProcessingTask("TRIAL_NO_SHOW")).toBe(true);
    expect(trialNeedsProcessingTask("CONTACT_COLLECTED")).toBe(false);
  });

  it("closes processing tasks when admin finishes processing", () => {
    expect(trialClosesProcessingTask("CONVERTED_TO_ACTIVE")).toBe(true);
    expect(trialClosesProcessingTask("TRANSFERRED_TO_ADMIN")).toBe(true);
    expect(trialClosesProcessingTask("TRIAL_ATTENDED")).toBe(false);
  });

  it("prevents converting already closed trials", () => {
    expect(() => assertTrialCanBeConverted("TRIAL_ATTENDED")).not.toThrow();
    expect(() => assertTrialCanBeConverted("CONVERTED_TO_ACTIVE")).toThrow("Пробник уже конвертирован.");
    expect(() => assertTrialCanBeConverted("TRANSFERRED_TO_ADMIN")).toThrow("Пробник уже закрыт как переданный админу.");
  });
});
