import { expect, it } from "vitest";
import { firstPaidLessonAfter, paymentDeadline, reservationDeadline } from "./test-journey-rules";

it("starts billing after the full payment window on the chosen weekday", () => {
  const signed = new Date("2026-10-20T12:00:00+03:00");
  const due = paymentDeadline(signed);
  const lessons = [
    { lessonDate: new Date("2026-10-21"), startTime: "16:00" },
    { lessonDate: new Date("2026-10-22"), startTime: "16:00" },
    { lessonDate: new Date("2026-10-28"), startTime: "16:00" }
  ];
  expect(firstPaidLessonAfter(lessons, due, 3)?.lessonDate.toISOString().slice(0, 10)).toBe("2026-10-28");
  expect(reservationDeadline(new Date("2026-10-18T12:00:00+03:00"), due)).toEqual(due);
});
