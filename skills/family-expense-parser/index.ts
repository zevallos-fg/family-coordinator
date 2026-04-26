import { z } from "zod";

import { parseJsonResponse } from "../_lib/parse";
import { callSkill } from "../_lib/runner";
import type { SkillContext, SkillResult, SkillRunner } from "../_lib/types";

import { SYSTEM_PROMPT, buildUserPrompt } from "./prompt";

export interface Input {
  text: string;
  captured_at: string;
  captured_by_user_id: string;
  family_member_user_ids: Array<{ user_id: string; name: string }>;
  context?: string;
}

export interface ParsedExpense {
  amount_cents: number;
  category: string;
  merchant: string | null;
  purchased_at: string;
  paid_by_user_id: string | null;
  kid_specific: boolean;
  kid_name: string | null;
  notes: string | null;
}

export interface Output {
  expense: ParsedExpense | null;
  reimbursement_needed: boolean;
  reasoning: string;
  confidence: number;
}

const expenseSchema = z.object({
  amount_cents: z.number().int().positive(),
  category: z.string(),
  merchant: z.string().nullable(),
  purchased_at: z.string(),
  paid_by_user_id: z.string().nullable(),
  kid_specific: z.boolean(),
  kid_name: z.string().nullable(),
  notes: z.string().nullable(),
});

const outputSchema = z.object({
  expense: expenseSchema.nullable(),
  reimbursement_needed: z.boolean(),
  reasoning: z.string(),
  confidence: z.number().min(0).max(1),
});

export const run: SkillRunner<Input, Output> = async (
  input,
  ctx: SkillContext
): Promise<SkillResult<Output>> => {
  if (!input.text?.trim()) {
    return {
      ok: false,
      error: { code: "invalid_input", message: "text is required" },
    };
  }

  // Get the name of the capturing user
  const capturingMember = input.family_member_user_ids.find(
    (m) => m.user_id === input.captured_by_user_id
  );

  const result = await callSkill<string>(
    {
      skillName: "family-expense-parser",
      tier: "haiku",
      system: SYSTEM_PROMPT,
      maxTokens: 600,
      messages: [
        {
          role: "user",
          content: buildUserPrompt({
            text: input.text,
            captured_at: input.captured_at,
            captured_by_name: capturingMember?.name,
            family_member_user_ids: input.family_member_user_ids,
            context: input.context,
          }),
        },
      ],
    },
    ctx
  );

  if (!result.ok || !result.data) return result as unknown as SkillResult<Output>;

  let parsed: z.infer<typeof outputSchema>;
  try {
    parsed = outputSchema.parse(parseJsonResponse(result.data));
  } catch (err) {
    return {
      ok: false,
      error: {
        code: "parse_error",
        message:
          err instanceof Error
            ? `Response did not match expected shape: ${err.message}`
            : "Response parse failed",
      },
    };
  }

  // Hallucination guard 1: amount_cents must correspond to a number mentioned in input text
  if (parsed.expense) {
    const amountDollars = parsed.expense.amount_cents / 100;
    const amountStr = amountDollars.toFixed(2);
    const amountRound = Math.floor(amountDollars).toString();
    const textContainsAmount =
      input.text.includes(amountStr) ||
      input.text.includes(amountRound) ||
      // Also check for the number without leading $ or with comma formatting
      input.text.includes(amountStr.replace(".", ",")) ||
      input.text.replace(/,/g, "").includes(amountStr);

    if (!textContainsAmount) {
      return {
        ok: false,
        error: {
          code: "parse_error",
          message: `Hallucination guard: amount_cents ${parsed.expense.amount_cents} (${amountStr}) not found in input text`,
        },
      };
    }

    // Hallucination guard 2: merchant must appear in text if not null
    if (parsed.expense.merchant) {
      const merchantLower = parsed.expense.merchant.toLowerCase();
      const textLower = input.text.toLowerCase();
      if (!textLower.includes(merchantLower) && !textLower.includes(merchantLower.split(" ")[0])) {
        // Merchant name partially not found — set to null rather than failing
        parsed = {
          ...parsed,
          expense: { ...parsed.expense, merchant: null },
        };
      }
    }
  }

  return {
    ok: true,
    data: parsed as Output,
    usage: result.usage,
  };
};
