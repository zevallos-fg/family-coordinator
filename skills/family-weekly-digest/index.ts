import { z } from "zod";

import { parseJsonResponse } from "../_lib/parse";
import { callSkill } from "../_lib/runner";
import { verifyEntitiesExist } from "@/lib/hallucination-guards";
import type { SkillContext, SkillResult, SkillRunner } from "../_lib/types";

import { SYSTEM_PROMPT, buildUserPrompt } from "./prompt";

export interface DigestInput {
  week_start_date: string;
  family_members: Array<{ name: string; user_id: string }>;
  captures: Array<{ text: string; created_at: string }>;
  schedule_entries: Array<{ title: string; date: string }>;
  expenses: Array<{ amount_cents: number; merchant: string | null; category: string | null }>;
  completed_tasks: string[];
  open_tasks: string[];
  kid_milestones: Array<{ kid_name: string; type: string; description: string }>;
  upcoming_birthdays: Array<{ kid_name: string; party_date: string; host_name: string | null }>;
  caregiver_shifts: number;
  seasonal_items_open: number;
}

export interface DigestSection {
  title: string;
  body: string;
  data_present: boolean;
}

export interface BlindSpot {
  category: string;
  observation: string;
  suggested_action: string;
  related_entity_id: string | null;
}

export interface LoadMember {
  name: string;
  action_count: number;
  mention_count: number;
}

export interface Output {
  summary: string;
  sections: DigestSection[];
  blind_spots: BlindSpot[];
  load_attribution: {
    members: LoadMember[];
    observation: string;
  };
}

const outputSchema = z.object({
  summary: z.string(),
  sections: z.array(
    z.object({
      title: z.string(),
      body: z.string(),
      data_present: z.boolean(),
    })
  ),
  blind_spots: z.array(
    z.object({
      category: z.string(),
      observation: z.string(),
      suggested_action: z.string(),
      related_entity_id: z.string().nullable(),
    })
  ),
  load_attribution: z.object({
    members: z.array(
      z.object({
        name: z.string(),
        action_count: z.number().int(),
        mention_count: z.number().int(),
      })
    ),
    observation: z.string(),
  }),
});

export const run: SkillRunner<DigestInput, Output> = async (
  input,
  ctx: SkillContext
): Promise<SkillResult<Output>> => {
  if (!input.week_start_date) {
    return {
      ok: false,
      error: { code: "invalid_input", message: "week_start_date is required" },
    };
  }

  const result = await callSkill<string>(
    {
      skillName: "family-weekly-digest",
      tier: "haiku",
      system: SYSTEM_PROMPT,
      maxTokens: 1500,
      messages: [
        {
          role: "user",
          content: buildUserPrompt(input),
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

  // Hallucination guard: member names in load_attribution must exist in input
  const inputMemberEntities = input.family_members.map((m) => ({
    id: m.user_id,
    name: m.name,
  }));

  // Check load_attribution member names
  const claimedMemberIds = parsed.load_attribution.members
    .map((m) => {
      const match = input.family_members.find(
        (im) => im.name.toLowerCase() === m.name.toLowerCase()
      );
      return match?.user_id ?? `fabricated:${m.name}`;
    })
    .filter((id) => id.startsWith("fabricated:"));

  if (claimedMemberIds.length > 0) {
    // Remove fabricated members rather than failing
    parsed = {
      ...parsed,
      load_attribution: {
        ...parsed.load_attribution,
        members: parsed.load_attribution.members.filter((m) =>
          input.family_members.some(
            (im) => im.name.toLowerCase() === m.name.toLowerCase()
          )
        ),
      },
    };
  }

  // Also check related_entity_ids in blind spots if present
  const nonNullEntityIds = parsed.blind_spots
    .map((b) => b.related_entity_id)
    .filter((id): id is string => id !== null);

  if (nonNullEntityIds.length > 0 && inputMemberEntities.length > 0) {
    const { fabricated } = verifyEntitiesExist(nonNullEntityIds, inputMemberEntities);
    if (fabricated.length > 0) {
      // Null out the fabricated IDs
      parsed = {
        ...parsed,
        blind_spots: parsed.blind_spots.map((b) =>
          b.related_entity_id && fabricated.includes(b.related_entity_id)
            ? { ...b, related_entity_id: null }
            : b
        ),
      };
    }
  }

  return {
    ok: true,
    data: parsed as Output,
    usage: result.usage,
  };
};
