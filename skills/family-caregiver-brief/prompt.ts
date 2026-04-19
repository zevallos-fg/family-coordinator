export const SYSTEM_PROMPT = `You are a warm family assistant writing a morning brief for a caregiver.

Tone rules:
- Warm and conversational, like a note from a friend who knows this family
- Critical things first ("Leo didn't sleep well — watch for crankiness after 2pm")
- Practical over formal
- End with a friendly sign-off from the parents
- Use the child's name, not "the child"
- Keep it readable on a phone — short paragraphs, clear sections
- If a section has no data, skip it gracefully rather than writing "No information available"

Output valid JSON only. No markdown fences. No prose outside the content field.

Example of a good brief (for reference only — do not copy verbatim):
{
  "content": "Good morning, Rosa! 👋\\n\\n**Today: Monday, April 19 · 8:00 AM – 5:00 PM**\\n\\n---\\n\\n## Heads up\\n\\nLeo skipped his nap yesterday afternoon, so he might be a little tired and cranky around 2pm. Extra snuggles and his elephant stuffed animal usually help.\\n\\n## Leo's world right now\\n\\n- **Loving:** blueberries, anything with dinosaurs, his new red truck\\n- **Not a fan of:** broccoli (still), loud music\\n\\n## A few reminders\\n\\n- Water bottle is in the blue bag\\n\\n---\\n\\n*Lots of love, Fernando & Yenny* 💛"
}`;

export function buildUserPrompt(input: {
  caregiver: { name: string; role: string };
  kids: Array<{
    name: string;
    birthDate: string | null;
    notes: string;
    foodFavorites: string[];
    foodAversions: string[];
  }>;
  shift: { startAt: string; endAt: string };
  openTasks: Array<{ title: string; dueDate?: string }>;
  previousRecap?: string;
}): string {
  const formatDateTime = (iso: string) => {
    try {
      return new Date(iso).toLocaleString("en-US", {
        weekday: "long",
        month: "long",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
        hour12: true,
      });
    } catch {
      return iso;
    }
  };

  const kidsSection = input.kids
    .map((k) => {
      const ageStr = k.birthDate
        ? (() => {
            const born = new Date(k.birthDate);
            const now = new Date();
            const months =
              (now.getFullYear() - born.getFullYear()) * 12 +
              (now.getMonth() - born.getMonth());
            const years = Math.floor(months / 12);
            const remMonths = months % 12;
            return years > 0
              ? `${years} yr${years > 1 ? "s" : ""}${remMonths > 0 ? `, ${remMonths} mo` : ""}`
              : `${remMonths} months`;
          })()
        : "age unknown";

      return `${k.name} (${ageStr})
Notes: ${k.notes || "(no notes yet)"}
Food favorites: ${k.foodFavorites.join(", ") || "(none listed)"}
Food aversions: ${k.foodAversions.join(", ") || "(none listed)"}`;
    })
    .join("\n\n");

  const tasksSection =
    input.openTasks.length > 0
      ? input.openTasks.map((t) => `- ${t.title}${t.dueDate ? ` (due ${t.dueDate})` : ""}`).join("\n")
      : "(no open tasks)";

  return `Write a warm morning brief for ${input.caregiver.name} (${input.caregiver.role}).

Shift: ${formatDateTime(input.shift.startAt)} – ${formatDateTime(input.shift.endAt)}

${kidsSection}

Open tasks/reminders:
${tasksSection}

${input.previousRecap ? `Last recap from caregiver:\n"${input.previousRecap}"` : ""}

Return JSON:
{
  "content": "full markdown brief as a single string with \\n for newlines"
}`;
}
