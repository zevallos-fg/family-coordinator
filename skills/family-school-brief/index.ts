import type { SkillContext, SkillResult, SkillRunner } from "../_lib/types";

export interface Input {
  // TODO: define in T7
  placeholder?: string;
}

export interface Output {
  // TODO: define in T7
  placeholder?: string;
}

export const run: SkillRunner<Input, Output> = async (_input, _ctx) => {
  return {
    ok: false,
    error: { code: "unknown", message: "Not implemented - shipped in T7" },
  };
};
