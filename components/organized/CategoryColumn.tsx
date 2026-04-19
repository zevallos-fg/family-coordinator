import { CaptureItem } from "./CaptureItem";
import { moveCaptureAction } from "@/app/(app)/organized/actions";

interface Category {
  id: string;
  name: string;
  icon: string | null;
  urgent: boolean;
}

interface CaptureRow {
  id: string;
  text: string;
  created_at: string;
  voice_transcription: boolean;
}

interface CategoryColumnProps {
  category: Category;
  captures: CaptureRow[];
  allCategories: Category[];
}

export function CategoryColumn({ category, captures, allCategories }: CategoryColumnProps) {
  if (captures.length === 0) return null;

  async function handleMove(id: string, categoryId: string) {
    "use server";
    await moveCaptureAction(id, categoryId);
  }

  return (
    <div className="bg-white rounded-xl border border-stone-200 overflow-hidden">
      <div
        className={`px-4 py-3 border-b border-stone-100 flex items-center gap-2 ${
          category.urgent ? "bg-amber-50" : "bg-stone-50"
        }`}
      >
        {category.icon && <span>{category.icon}</span>}
        <h3 className="font-medium text-stone-700 text-sm">{category.name}</h3>
        <span className="ml-auto text-xs text-stone-400 bg-white px-1.5 py-0.5 rounded-full border border-stone-200">
          {captures.length}
        </span>
      </div>
      <div className="p-3 space-y-2">
        {captures.map((c) => (
          <CaptureItem
            key={c.id}
            {...c}
            allCategories={allCategories}
            onMove={handleMove}
          />
        ))}
      </div>
    </div>
  );
}
