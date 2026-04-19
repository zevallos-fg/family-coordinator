import { describe, it, expect, vi, beforeEach } from "vitest";
import type { SkillContext } from "../_lib/types";

// Mock the runner before importing the skill
vi.mock("../_lib/runner", () => ({
  callSkill: vi.fn(),
}));

// Mock server-only
vi.mock("server-only", () => ({}));

import { run } from "./index";
import { callSkill } from "../_lib/runner";

const mockCallSkill = vi.mocked(callSkill);

const TEST_CTX: SkillContext = {
  familyId: "7d0c3888-16c8-4144-b088-428f38a7e93a",
  userId: "a4b2af94-06f5-4a25-b84f-aecb89da9191",
};

// Minimal recipe HTML fixture
const PASTA_HTML = `
<html><body>
<h1 class="recipe-title">Simple Tomato Pasta</h1>
<div class="recipe-meta">
  <span>Prep: 10 min</span><span>Cook: 20 min</span><span>Serves: 4</span>
</div>
<ul class="ingredients">
  <li>12 oz penne pasta</li>
  <li>3 tablespoons extra-virgin olive oil</li>
  <li>4 cloves garlic, minced</li>
  <li>1 can (28 oz) San Marzano crushed tomatoes</li>
  <li>1/2 teaspoon red pepper flakes</li>
  <li>Salt and black pepper to taste</li>
  <li>1/4 cup fresh basil leaves, torn</li>
</ul>
<ol class="instructions">
  <li>Bring a large pot of salted water to a boil. Cook pasta according to package directions until al dente. Drain and reserve 1 cup pasta water.</li>
  <li>Heat olive oil in a large skillet over medium heat. Add garlic and cook for 1 minute until fragrant.</li>
  <li>Add crushed tomatoes and red pepper flakes. Simmer for 15 minutes.</li>
  <li>Toss pasta with sauce, adding pasta water as needed. Top with fresh basil and serve.</li>
</ol>
</body></html>
`;

// HTML fixture with brand noise in ingredients
const COOKIE_HTML = `
<html><body>
<h1>Chocolate Chip Cookies</h1>
<div>Ready in: 35 minutes | Serves: 24</div>
<ul>
  <li>2 1/4 cups King Arthur all-purpose flour</li>
  <li>1 teaspoon Arm and Hammer baking soda</li>
  <li>1 teaspoon Morton kosher salt</li>
  <li>2 sticks (1 cup) Land O'Lakes unsalted butter, softened</li>
  <li>3/4 cup granulated sugar</li>
  <li>3/4 cup packed dark brown sugar</li>
  <li>2 large Eggland's Best eggs</li>
  <li>2 teaspoons pure vanilla extract</li>
  <li>2 cups Nestle Toll House chocolate chips</li>
</ul>
<div>
  <p>Step 1: Preheat oven to 375°F and line baking sheets with parchment paper.</p>
  <p>Step 2: Whisk together flour, baking soda, and salt in a bowl.</p>
  <p>Step 3: Beat butter and both sugars until fluffy, about 3 minutes.</p>
  <p>Step 4: Beat in eggs and vanilla. Gradually mix in flour mixture. Stir in chocolate chips.</p>
  <p>Step 5: Drop by rounded tablespoons onto baking sheets. Bake 9-11 minutes until golden.</p>
</div>
</body></html>
`;

describe("family-recipe-importer", () => {
  beforeEach(() => vi.clearAllMocks());

  it("parses a pasta recipe correctly", async () => {
    mockCallSkill.mockResolvedValueOnce({
      ok: true,
      data: JSON.stringify({
        name: "Simple Tomato Pasta",
        servings: 4,
        totalTimeMin: 30,
        instructions: [
          "Bring a large pot of salted water to a boil. Cook pasta according to package directions until al dente. Drain and reserve 1 cup pasta water.",
          "Heat olive oil in a large skillet over medium heat. Add garlic and cook for 1 minute until fragrant.",
          "Add crushed tomatoes and red pepper flakes. Simmer for 15 minutes.",
          "Toss pasta with sauce, adding pasta water as needed. Top with fresh basil and serve.",
        ],
        ingredients: [
          { canonicalName: "penne pasta", quantity: 12, unit: "oz", note: null },
          { canonicalName: "olive oil", quantity: 3, unit: "tablespoons", note: null },
          { canonicalName: "garlic", quantity: 4, unit: "cloves", note: "minced" },
          { canonicalName: "crushed tomato", quantity: 28, unit: "oz", note: null },
          { canonicalName: "red pepper flake", quantity: 0.5, unit: "teaspoon", note: null },
          { canonicalName: "salt", quantity: null, unit: null, note: null },
          { canonicalName: "basil", quantity: 0.25, unit: "cup", note: "torn" },
        ],
        sourceUrl: "https://example.com/pasta",
      }),
      usage: { model: "claude-haiku-4-5-20251001", inputTokens: 500, outputTokens: 200, costCents: 0.02 },
    });

    const result = await run({ mode: "url", url: "https://example.com/pasta", html: PASTA_HTML }, TEST_CTX);

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.data!.name).toBe("Simple Tomato Pasta");
    expect(result.data!.servings).toBe(4);
    expect(result.data!.totalTimeMin).toBe(30);
    expect(result.data!.instructions).toHaveLength(4);
    expect(result.data!.ingredients).toHaveLength(7);

    // Canonical name stripping
    const oliveoil = result.data!.ingredients.find(i => i.canonicalName === "olive oil");
    expect(oliveoil).toBeDefined();
    expect(oliveoil!.quantity).toBe(3);
    expect(oliveoil!.unit).toBe("tablespoons");

    // "to taste" → null quantity
    const salt = result.data!.ingredients.find(i => i.canonicalName === "salt");
    expect(salt).toBeDefined();
    expect(salt!.quantity).toBeNull();
  });

  it("strips brand names from ingredient canonical names", async () => {
    mockCallSkill.mockResolvedValueOnce({
      ok: true,
      data: JSON.stringify({
        name: "Chocolate Chip Cookies",
        servings: 24,
        totalTimeMin: 35,
        instructions: [
          "Preheat oven to 375°F and line baking sheets with parchment paper.",
          "Whisk together flour, baking soda, and salt in a bowl.",
          "Beat butter and both sugars until fluffy, about 3 minutes.",
          "Beat in eggs and vanilla. Gradually mix in flour mixture. Stir in chocolate chips.",
          "Drop by rounded tablespoons onto baking sheets. Bake 9-11 minutes until golden.",
        ],
        ingredients: [
          { canonicalName: "all-purpose flour", quantity: 2.25, unit: "cups", note: null },
          { canonicalName: "baking soda", quantity: 1, unit: "teaspoon", note: null },
          { canonicalName: "salt", quantity: 1, unit: "teaspoon", note: null },
          { canonicalName: "butter", quantity: 1, unit: "cup", note: "softened" },
          { canonicalName: "granulated sugar", quantity: 0.75, unit: "cup", note: null },
          { canonicalName: "brown sugar", quantity: 0.75, unit: "cup", note: "packed" },
          { canonicalName: "egg", quantity: 2, unit: null, note: null },
          { canonicalName: "vanilla extract", quantity: 2, unit: "teaspoons", note: null },
          { canonicalName: "chocolate chip", quantity: 2, unit: "cups", note: null },
        ],
        sourceUrl: "https://example.com/cookies",
      }),
      usage: { model: "claude-haiku-4-5-20251001", inputTokens: 600, outputTokens: 250, costCents: 0.025 },
    });

    const result = await run({ mode: "url", url: "https://example.com/cookies", html: COOKIE_HTML }, TEST_CTX);

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    // Brand names stripped
    const butter = result.data!.ingredients.find(i => i.canonicalName === "butter");
    expect(butter).toBeDefined();
    expect(butter!.canonicalName).not.toContain("Land O'Lakes");
    expect(butter!.note).toBe("softened");

    // Fraction parsed: 2 1/4 → 2.25
    const flour = result.data!.ingredients.find(i => i.canonicalName === "all-purpose flour");
    expect(flour!.quantity).toBe(2.25);

    // Instructions stripped of "Step N:" prefix
    expect(result.data!.instructions[0]).not.toMatch(/^Step \d/);
  });

  it("returns parse_error when page contains no recipe", async () => {
    mockCallSkill.mockResolvedValueOnce({
      ok: true,
      data: JSON.stringify({ error: "no_recipe_found" }),
      usage: { model: "claude-haiku-4-5-20251001", inputTokens: 100, outputTokens: 10, costCents: 0.001 },
    });

    const result = await run({ mode: "url", url: "https://example.com/404", html: "<html>Not found</html>" }, TEST_CTX);

    expect(result.ok).toBe(false);
    expect(result.error!.code).toBe("parse_error");
  });

  it("returns invalid_input when url is missing", async () => {
    const result = await run({ mode: "url", url: "", html: PASTA_HTML }, TEST_CTX);
    expect(result.ok).toBe(false);
    expect(result.error!.code).toBe("invalid_input");
  });

  it("propagates budget_exceeded from callSkill", async () => {
    mockCallSkill.mockResolvedValueOnce({
      ok: false,
      error: { code: "budget_exceeded", message: "monthly cap reached" },
    });

    const result = await run({ mode: "url", url: "https://example.com/r", html: PASTA_HTML }, TEST_CTX);
    expect(result.ok).toBe(false);
    expect(result.error!.code).toBe("budget_exceeded");
  });
});
