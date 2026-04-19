import { describe, it, expect, vi, beforeEach } from "vitest";

// ---- Next.js navigation mocks ----
const mockPush = vi.fn();
const mockSearchParamsGet = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush }),
  useSearchParams: () => ({ get: mockSearchParamsGet }),
}));

// Import after mocks are set up
const { useWeekParam } = await import("./use-week-param");
const { formatWeekParam, defaultPlanWeek } = await import("../lib/week");

beforeEach(() => {
  mockPush.mockReset();
  mockSearchParamsGet.mockReset();
});

// Pin "today" so tests are deterministic: Sunday Apr 19, 2026 → default = Apr 20
const TODAY = new Date("2026-04-19T12:00:00");

describe("useWeekParam", () => {
  it("no param → selectedWeek = defaultPlanWeek(today), isDefault = true", () => {
    mockSearchParamsGet.mockReturnValue(null);
    const result = useWeekParam(TODAY);
    expect(formatWeekParam(result.selectedWeek)).toBe(
      formatWeekParam(defaultPlanWeek(TODAY))
    );
    expect(result.isDefault).toBe(true);
  });

  it("valid Monday param → that Monday, isDefault = false", () => {
    mockSearchParamsGet.mockReturnValue("2026-04-27");
    const result = useWeekParam(TODAY);
    expect(formatWeekParam(result.selectedWeek)).toBe("2026-04-27");
    expect(result.isDefault).toBe(false);
  });

  it("non-Monday param (Wed) → snapped to that Monday, isDefault = false", () => {
    mockSearchParamsGet.mockReturnValue("2026-04-22"); // Wednesday
    const result = useWeekParam(TODAY);
    expect(formatWeekParam(result.selectedWeek)).toBe("2026-04-20");
    expect(result.isDefault).toBe(false);
  });

  it("setWeek calls router.push with ?week=YYYY-MM-DD", () => {
    mockSearchParamsGet.mockReturnValue(null);
    const { setWeek } = useWeekParam(TODAY);
    setWeek(new Date("2026-04-27T12:00:00"));
    expect(mockPush).toHaveBeenCalledWith("?week=2026-04-27");
  });
});
