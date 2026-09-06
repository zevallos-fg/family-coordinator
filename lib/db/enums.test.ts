import { describe, it, expect } from "vitest";
import {
  CAREGIVER_ROLES,
  CAREGIVER_ROLE_LABEL,
  CHECKLIST_STATUSES,
  MEDICAL_EVENT_TYPES,
  MEDICAL_EVENT_TYPE_LABEL,
  TASK_STATUSES,
  isChecklistSettled,
  parseCaregiverRole,
  parseChecklistStatus,
  parseMedicalEventType,
  parseTaskStatus,
} from "./enums";

/**
 * The four columns are native enums now, so the values in lib/db/enums.ts are
 * read straight out of the generated types and cannot drift from the database.
 * What is left to test is what the database has no opinion about: that the
 * parsers narrow correctly, that the labels stay display-only, and that the exact
 * strings which caused each outage are still refused.
 *
 * tests/e2e/db-enum-parity.spec.ts covers the other half — that the live column
 * agrees, by inserting every value and watching what happens.
 */

describe("the values that broke each feature stay rejected", () => {
  it("refuses a title-cased caregiver role", () => {
    // createCaregiver ran toTitleCase over the role, so every insert sent `Nanny`
    // and every insert was refused — and the throw rendered a blank error page.
    expect(parseCaregiverRole("nanny")).toBe("nanny");
    expect(parseCaregiverRole("Nanny")).toBe("nanny");
    expect(CAREGIVER_ROLES).not.toContain("Nanny");
  });

  it("accepts au_pair, which the enum migration added", () => {
    // Offered by the form for as long as the form existed and refused by the old
    // CHECK the whole time. Folded into caregiver_role when the column was
    // converted, so the form and the column finally agree.
    expect(parseCaregiverRole("au_pair")).toBe("au_pair");
    expect(CAREGIVER_ROLES).toContain("au_pair");
  });

  it("refuses the nine display labels the medical form used to submit", () => {
    for (const label of [
      "Well-child visit",
      "Sick visit",
      "Vaccination",
      "Dental checkup",
      "Eye exam",
      "Specialist visit",
      "ER visit",
      "Surgery",
    ]) {
      expect(parseMedicalEventType(label)).toBeNull();
    }
    // "Other" survives only because it lowercases onto a real value.
    expect(parseMedicalEventType("Other")).toBe("other");
  });

  it("refuses the hurricane checklist's pending/completed/n_a", () => {
    expect(parseChecklistStatus("pending")).toBeNull();
    expect(parseChecklistStatus("completed")).toBeNull();
    expect(parseChecklistStatus("n_a")).toBeNull();
    expect(parseChecklistStatus("open")).toBe("open");
    expect(parseChecklistStatus("done")).toBe("done");
    expect(parseChecklistStatus("na")).toBe("na");
  });

  it("refuses the trip prep task's pending", () => {
    // The one that failed silently: tasks.insert never read its error.
    expect(parseTaskStatus("pending")).toBeNull();
    expect(parseTaskStatus("open")).toBe("open");
  });
});

describe("parsers", () => {
  it("normalise case and whitespace from a form field", () => {
    expect(parseCaregiverRole("  DAYCARE  ")).toBe("daycare");
    expect(parseTaskStatus("In_Progress")).toBe("in_progress");
  });

  it("return null for anything that is not a string", () => {
    for (const value of [null, undefined, 42, {}, [], true]) {
      expect(parseCaregiverRole(value)).toBeNull();
    }
  });

  it("return null for an empty field rather than guessing a default", () => {
    expect(parseMedicalEventType("")).toBeNull();
    expect(parseChecklistStatus("   ")).toBeNull();
  });
});

describe("labels", () => {
  it("cover every value, so no screen ever falls back to a raw column value", () => {
    for (const role of CAREGIVER_ROLES) {
      expect(CAREGIVER_ROLE_LABEL[role]).toBeTruthy();
    }
    for (const type of MEDICAL_EVENT_TYPES) {
      expect(MEDICAL_EVENT_TYPE_LABEL[type]).toBeTruthy();
    }
  });

  it("are display-only — a label is never a storable value", () => {
    // This is the invariant the caregiver bug violated: casing on the value.
    for (const label of Object.values(CAREGIVER_ROLE_LABEL)) {
      if (label.toLowerCase() !== label) {
        expect(parseCaregiverRole(label)).not.toBe(label);
      }
    }
  });
});

describe("isChecklistSettled", () => {
  it("counts done and na, and nothing else", () => {
    expect(isChecklistSettled("done")).toBe(true);
    expect(isChecklistSettled("na")).toBe(true);
    expect(isChecklistSettled("open")).toBe(false);
    // The values the page used to count. Both percentages were pinned because
    // neither could ever appear in the column.
    expect(isChecklistSettled("completed")).toBe(false);
    expect(isChecklistSettled("n_a")).toBe(false);
  });

  it("agrees with the statuses the column allows", () => {
    const settled = CHECKLIST_STATUSES.filter(isChecklistSettled);
    expect(settled).toEqual(["done", "na"]);
  });
});
