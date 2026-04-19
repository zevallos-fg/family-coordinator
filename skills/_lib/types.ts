/**
 * Shared types for the skills framework.
 * Every skill imports from here; the skillRunner uses these as its contract.
 */

export type SkillTier = "haiku" | "sonnet";

export interface SkillContext {
  familyId: string;
  userId: string;
}

export interface SkillResult<T> {
  ok: boolean;
  data?: T;
  error?: {
    code:
      | "budget_exceeded"
      | "api_error"
      | "parse_error"
      | "invalid_input"
      | "unauthorized"
      | "unknown";
    message: string;
  };
  usage?: {
    model: string;
    inputTokens: number;
    outputTokens: number;
    costCents: number;
  };
  usageId?: string; // api_usage row ID — use to report parse errors via updateSkillError
}

export type SkillRunner<TInput, TOutput> = (
  input: TInput,
  ctx: SkillContext
) => Promise<SkillResult<TOutput>>;