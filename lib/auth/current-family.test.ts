import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockFrom, mockGetUser, mockRedirect } = vi.hoisted(() => ({
  mockFrom: vi.fn(),
  mockGetUser: vi.fn(),
  mockRedirect: vi.fn((path: string) => {
    // The real redirect() throws NEXT_REDIRECT and never returns. Anything that
    // keeps running past it in a test would keep running in production too.
    throw new Error(`NEXT_REDIRECT:${path}`);
  }),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn().mockResolvedValue({
    from: mockFrom,
    auth: { getUser: mockGetUser },
  }),
}));

vi.mock("next/navigation", () => ({ redirect: mockRedirect }));

import { lookupFamily, requireFamily, familyForAction } from "./current-family";

const USER_ID = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const FAMILY_ID = "7d0c3888-16c8-4144-b088-428f38a7e93a";

function membershipReturns(result: { data: unknown; error: unknown }) {
  mockFrom.mockReturnValue({
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue(result),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockGetUser.mockResolvedValue({ data: { user: { id: USER_ID } }, error: null });
});

describe("lookupFamily", () => {
  it("returns the family", async () => {
    membershipReturns({ data: { family_id: FAMILY_ID }, error: null });
    expect(await lookupFamily()).toEqual({
      ok: true,
      userId: USER_ID,
      familyId: FAMILY_ID,
    });
  });

  it("separates a failed read from an absent family", async () => {
    membershipReturns({ data: null, error: { message: "connection reset" } });
    expect(await lookupFamily()).toEqual({
      ok: false,
      reason: "lookup-failed",
      message: "connection reset",
    });

    membershipReturns({ data: null, error: null });
    expect(await lookupFamily()).toEqual({ ok: false, reason: "no-family" });
  });

  it("orders by joined_at, so which family you get never depends on the query plan", async () => {
    const chain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: { family_id: FAMILY_ID }, error: null }),
    };
    mockFrom.mockReturnValue(chain);
    await lookupFamily();
    expect(chain.order).toHaveBeenCalledWith("joined_at", { ascending: true });
  });
});

describe("requireFamily", () => {
  it("sends a member with no family to onboarding", async () => {
    membershipReturns({ data: null, error: null });
    await expect(requireFamily()).rejects.toThrow("NEXT_REDIRECT:/onboarding");
  });

  // The bug this module exists to remove: a database that blinked used to be
  // answered with "you have no household", and /onboarding — which swallowed
  // the same read — agreed and offered to create a second one.
  it("does NOT send anyone to onboarding when the read fails", async () => {
    membershipReturns({ data: null, error: { message: "connection reset" } });
    await expect(requireFamily()).rejects.toThrow(/Could not load your family/);
    expect(mockRedirect).not.toHaveBeenCalledWith("/onboarding");
  });
});

describe("familyForAction", () => {
  it("says nothing was changed when it could not check", async () => {
    membershipReturns({ data: null, error: { message: "connection reset" } });
    const result = await familyForAction();
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatch(/nothing was changed/i);
      expect(result.error).not.toMatch(/no family/i);
    }
  });
});
