"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

import { importRecipeAction, addRecipeAction, type ManualIngredientRow } from "@/app/(app)/meal-plans/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { stripDescriptors } from "@/lib/grocery/strip-descriptors";

type Mode = "url" | "photo" | "manual";

const MAX_PHOTO_BYTES = 5 * 1024 * 1024;
const SUPPORTED_PHOTO_TYPES = ["image/jpeg", "image/png", "image/webp"];
const EMPTY_ROW: ManualIngredientRow = { name: "", qty: null, unit: "", notes: "" };

function descriptorHint(name: string): string | null {
  if (!name.trim()) return null;
  const { cleanedName, descriptors } = stripDescriptors(name);
  if (descriptors.length === 0 || cleanedName === name.trim().toLowerCase()) return null;
  return `Will save as: ${cleanedName} (descriptor: ${descriptors.join(", ")} → notes)`;
}

export function RecipeImportForm() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("url");
  const [url, setUrl] = useState("");
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [manualTitle, setManualTitle] = useState("");
  const [manualServings, setManualServings] = useState<string>("4");
  const [manualDescription, setManualDescription] = useState("");
  const [manualPrepTime, setManualPrepTime] = useState<string>("");
  const [manualCookTime, setManualCookTime] = useState<string>("");
  const [manualCuisine, setManualCuisine] = useState("");
  const [manualTags, setManualTags] = useState("");
  const [manualInstructions, setManualInstructions] = useState("");
  const [manualIngredients, setManualIngredients] = useState<ManualIngredientRow[]>([
    { ...EMPTY_ROW }, { ...EMPTY_ROW }, { ...EMPTY_ROW },
  ]);
  const [manualErrors, setManualErrors] = useState<Record<string, string>>({});
  const [manualTouched, setManualTouched] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function resetErrors() { setError(null); setManualErrors({}); setManualTouched(false); }
  function switchMode(next: Mode) { setMode(next); resetErrors(); }

  function validateManual(): Record<string, string> {
    const errs: Record<string, string> = {};
    if (manualTitle.trim().length < 3) errs.title = "Title must be at least 3 characters";
    const servNum = Number(manualServings);
    if (!manualServings || isNaN(servNum) || servNum < 1 || servNum > 20 || !Number.isInteger(servNum))
      errs.servings = "Servings must be a whole number between 1 and 20";
    if (!manualIngredients.some((r) => r.name.trim() && r.unit.trim() && r.qty !== null))
      errs.ingredients = "Add at least one complete ingredient (name, qty, and unit)";
    return errs;
  }

  function isManualValid() { return Object.keys(validateManual()).length === 0; }

  function updateIngredient(i: number, field: keyof ManualIngredientRow, value: string | number | null) {
    setManualIngredients((prev) => { const next = [...prev]; next[i] = { ...next[i], [field]: value }; return next; });
  }

  async function handleUrlSubmit(e: React.FormEvent) {
    e.preventDefault(); resetErrors();
    const trimmed = url.trim(); if (!trimmed) return;
    try { new URL(trimmed); } catch { setError("Enter a valid URL (e.g. https://allrecipes.com/recipe/...)"); return; }
    setLoading(true);
    try {
      const result = await importRecipeAction(trimmed);
      if (result.error) setError(result.error);
      else if (result.recipeId) router.push(`/meal-plans/recipes/${result.recipeId}`);
    } finally { setLoading(false); }
  }

  function handlePhotoChange(e: React.ChangeEvent<HTMLInputElement>) {
    resetErrors(); const file = e.target.files?.[0];
    if (!file) { setPhotoFile(null); setPhotoPreview(null); return; }
    if (!SUPPORTED_PHOTO_TYPES.includes(file.type)) { setError("Photo must be JPEG, PNG, or WEBP"); setPhotoFile(null); setPhotoPreview(null); return; }
    if (file.size > MAX_PHOTO_BYTES) { setError("Photo is larger than 4MB."); setPhotoFile(null); setPhotoPreview(null); return; }
    setPhotoFile(file);
    const reader = new FileReader(); reader.onload = (ev) => setPhotoPreview(ev.target?.result as string); reader.readAsDataURL(file);
  }

  function clearPhoto() { setPhotoFile(null); setPhotoPreview(null); if (fileInputRef.current) fileInputRef.current.value = ""; }

  async function handlePhotoSubmit(e: React.FormEvent) {
    e.preventDefault(); resetErrors(); if (!photoFile) return;
    const formData = new FormData(); formData.append("image", photoFile);
    setLoading(true);
    try {
      const res = await fetch("/api/recipes/import-from-photo", { method: "POST", body: formData });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? `Server returned ${res.status}`); return; }
      if (data.recipeId) router.push(`/meal-plans/recipes/${data.recipeId}`);
      else setError("Server returned an empty response");
    } catch (err) { setError(err instanceof Error ? `Upload failed: ${err.message}` : "Upload failed"); } finally { setLoading(false); }
  }

  async function handleManualSubmit(e: React.FormEvent) {
    e.preventDefault(); setManualTouched(true);
    const errs = validateManual(); setManualErrors(errs);
    if (Object.keys(errs).length > 0) return;
    setLoading(true); setError(null);
    try {
      const filledIngredients = manualIngredients.filter((r) => r.name.trim() && r.unit.trim() && r.qty !== null);
      const result = await addRecipeAction(manualTitle.trim(), Number(manualServings), filledIngredients, {
        description: manualDescription.trim() || undefined, prepTimeMin: manualPrepTime ? Number(manualPrepTime) : null,
        cookTimeMin: manualCookTime ? Number(manualCookTime) : null, cuisine: manualCuisine.trim() || undefined,
        tags: manualTags.trim() || undefined, instructions: manualInstructions.trim() || undefined,
      });
      if (result.error) setError(result.error);
      else if (result.recipeId) router.push(`/meal-plans/recipes/${result.recipeId}`);
    } finally { setLoading(false); }
  }

  const fieldCls = (key: string) => `w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 ${manualTouched && manualErrors[key] ? "border-red-400" : "border-stone-200"}`;

  return (
    <div className="max-w-xl mx-auto px-4 py-8">
      <Link href="/meal-plans/recipes" className="text-sm text-orange-600 hover:text-orange-800 font-medium">← Back to recipes</Link>
      <h1 className="mt-4 text-2xl font-bold text-gray-900">Import a Recipe</h1>
      <p className="mt-1 text-gray-500 text-sm">Paste a URL, take a photo, or enter a recipe manually.</p>

      <div role="tablist" aria-label="Import method" className="mt-6 inline-flex rounded-lg border border-amber-200 bg-amber-50 p-1">
        {(["url", "photo", "manual"] as Mode[]).map((m) => (
          <button key={m} role="tab" aria-selected={mode === m} type="button" onClick={() => switchMode(m)} disabled={loading}
            className={`px-4 py-2 text-sm font-medium rounded-md transition ${mode === m ? "bg-white text-orange-700 shadow-sm" : "text-amber-700 hover:text-orange-700"}`}>
            {m === "url" ? "From URL" : m === "photo" ? "From Photo" : "Manual"}
          </button>
        ))}
      </div>

      {mode === "url" && (
        <form onSubmit={handleUrlSubmit} className="mt-6 space-y-4">
          <div>
            <label htmlFor="url" className="block text-sm font-medium text-gray-700 mb-1">Recipe URL</label>
            <Input id="url" type="url" placeholder="https://www.allrecipes.com/recipe/..." value={url} onChange={(e) => setUrl(e.target.value)} disabled={loading} className="w-full" />
            <p className="mt-1.5 text-xs text-gray-500">Works with most recipe sites. If a site blocks the fetch, use From Photo instead.</p>
          </div>
          {error && <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">{error}</div>}
          <Button type="submit" disabled={loading || !url.trim()} className="w-full">
            {loading ? <span className="flex items-center justify-center gap-2"><span className="animate-spin">⏳</span>Importing recipe…</span> : "Import Recipe"}
          </Button>
        </form>
      )}

      {mode === "photo" && (
        <form onSubmit={handlePhotoSubmit} className="mt-6 space-y-4">
          <div>
            <label htmlFor="photo" className="block text-sm font-medium text-gray-700 mb-1">Recipe Photo</label>
            <input ref={fileInputRef} id="photo" type="file" accept="image/jpeg,image/png,image/webp" capture="environment" onChange={handlePhotoChange} disabled={loading} className="block w-full text-sm text-gray-700 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:bg-orange-600 file:text-white file:font-medium hover:file:bg-orange-700 file:disabled:opacity-50" />
            <p className="mt-1.5 text-xs text-gray-500">JPEG, PNG, or WEBP — max 4MB.</p>
          </div>
          {photoPreview && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
              <div className="flex items-start gap-3">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={photoPreview} alt="Recipe preview" className="h-32 w-32 object-cover rounded-md border border-amber-200" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-amber-900 truncate">{photoFile?.name}</p>
                  <p className="text-xs text-amber-700 mt-0.5">{photoFile ? `${(photoFile.size / 1024).toFixed(0)} KB` : ""}</p>
                  <button type="button" onClick={clearPhoto} disabled={loading} className="mt-2 text-xs text-orange-700 hover:text-orange-900 font-medium">Choose a different photo</button>
                </div>
              </div>
            </div>
          )}
          {error && <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">{error}</div>}
          <Button type="submit" disabled={loading || !photoFile} className="w-full">
            {loading ? <span className="flex items-center justify-center gap-2"><span className="animate-spin">⏳</span>Reading recipe from photo…</span> : "Import from Photo"}
          </Button>
        </form>
      )}

      {mode === "manual" && (
        <form onSubmit={handleManualSubmit} className="mt-6 space-y-5">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Title <span className="text-red-500">*</span></label>
            <input type="text" value={manualTitle} onChange={(e) => setManualTitle(e.target.value)} placeholder="Recipe title" className={fieldCls("title")} disabled={loading} />
            {manualTouched && manualErrors.title && <p className="text-xs text-red-600 mt-1">{manualErrors.title}</p>}
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Servings <span className="text-red-500">*</span></label>
            <input type="number" min="1" max="20" step="1" value={manualServings} onChange={(e) => setManualServings(e.target.value)} className={`w-24 px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 ${manualTouched && manualErrors.servings ? "border-red-400" : "border-stone-200"}`} disabled={loading} />
            {manualTouched && manualErrors.servings && <p className="text-xs text-red-600 mt-1">{manualErrors.servings}</p>}
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Description <span className="text-xs text-stone-400">(optional)</span></label>
            <textarea value={manualDescription} onChange={(e) => setManualDescription(e.target.value)} rows={2} className="w-full px-3 py-2 border border-stone-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 resize-none" disabled={loading} />
          </div>
          <div className="flex gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Prep (min) <span className="text-xs text-stone-400">(optional)</span></label>
              <input type="number" min="0" value={manualPrepTime} onChange={(e) => setManualPrepTime(e.target.value)} className="w-20 px-3 py-2 border border-stone-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-400" disabled={loading} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Cook (min) <span className="text-xs text-stone-400">(optional)</span></label>
              <input type="number" min="0" value={manualCookTime} onChange={(e) => setManualCookTime(e.target.value)} className="w-20 px-3 py-2 border border-stone-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-400" disabled={loading} />
            </div>
          </div>
          <div className="flex gap-4">
            <div className="flex-1">
              <label className="block text-sm font-medium text-gray-700 mb-1">Cuisine <span className="text-xs text-stone-400">(optional)</span></label>
              <input type="text" value={manualCuisine} onChange={(e) => setManualCuisine(e.target.value)} placeholder="e.g. Italian" className="w-full px-3 py-2 border border-stone-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-400" disabled={loading} />
            </div>
            <div className="flex-1">
              <label className="block text-sm font-medium text-gray-700 mb-1">Tags <span className="text-xs text-stone-400">(comma-separated)</span></label>
              <input type="text" value={manualTags} onChange={(e) => setManualTags(e.target.value)} placeholder="e.g. soup, healthy" className="w-full px-3 py-2 border border-stone-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-400" disabled={loading} />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Ingredients <span className="text-red-500">*</span> <span className="text-xs text-stone-400">(at least one complete row)</span>
            </label>
            <div className="space-y-2">
              {manualIngredients.map((row, i) => {
                const hint = descriptorHint(row.name);
                return (
                  <div key={i} className="flex gap-2 items-start">
                    <div className="flex-1 min-w-0">
                      <input type="text" value={row.name} onChange={(e) => updateIngredient(i, "name", e.target.value)} placeholder="Ingredient name" className="w-full px-2 py-1.5 border border-stone-200 rounded text-sm focus:outline-none focus:ring-1 focus:ring-amber-400" disabled={loading} />
                      {hint && <p className="text-xs text-teal-600 mt-0.5">{hint}</p>}
                    </div>
                    <input type="number" value={row.qty ?? ""} onChange={(e) => updateIngredient(i, "qty", e.target.value ? Number(e.target.value) : null)} placeholder="Qty" min="0" step="any" className="w-16 px-2 py-1.5 border border-stone-200 rounded text-sm focus:outline-none focus:ring-1 focus:ring-amber-400" disabled={loading} />
                    <input type="text" value={row.unit} onChange={(e) => updateIngredient(i, "unit", e.target.value)} placeholder="Unit" className="w-20 px-2 py-1.5 border border-stone-200 rounded text-sm focus:outline-none focus:ring-1 focus:ring-amber-400" disabled={loading} />
                    <input type="text" value={row.notes} onChange={(e) => updateIngredient(i, "notes", e.target.value)} placeholder="Notes" className="w-24 px-2 py-1.5 border border-stone-200 rounded text-sm focus:outline-none focus:ring-1 focus:ring-amber-400" disabled={loading} />
                    <button type="button" onClick={() => setManualIngredients((p) => p.filter((_, idx) => idx !== i))} disabled={manualIngredients.length <= 1 || loading} className="py-1.5 px-2 text-stone-300 hover:text-rose-400 disabled:opacity-30 text-lg leading-none" aria-label="Remove ingredient row">×</button>
                  </div>
                );
              })}
            </div>
            {manualTouched && manualErrors.ingredients && <p className="text-xs text-red-600 mt-1">{manualErrors.ingredients}</p>}
            <button type="button" onClick={() => setManualIngredients((p) => [...p, { ...EMPTY_ROW }])} disabled={loading} className="mt-2 text-sm text-orange-600 hover:text-orange-800 font-medium">+ Add ingredient</button>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Instructions <span className="text-xs text-stone-400">(optional)</span></label>
            <textarea value={manualInstructions} onChange={(e) => setManualInstructions(e.target.value)} rows={4} className="w-full px-3 py-2 border border-stone-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 resize-none" disabled={loading} />
          </div>
          {error && <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">{error}</div>}
          <Button type="submit" disabled={loading || (manualTouched && !isManualValid())} className={`w-full ${manualTouched && !isManualValid() ? "opacity-50 cursor-not-allowed" : ""}`}>
            {loading ? <span className="flex items-center justify-center gap-2"><span className="animate-spin">⏳</span>Saving recipe…</span> : "Save Recipe"}
          </Button>
        </form>
      )}

      {loading && mode !== "manual" && (
        <div className="mt-6 rounded-xl bg-orange-50 border border-orange-100 p-4">
          <p className="text-sm text-orange-700 font-medium">{mode === "url" ? "Fetching and analyzing the recipe…" : "Extracting the recipe from your photo…"}</p>
          <p className="text-xs text-orange-500 mt-1">This takes 5–10 seconds.</p>
        </div>
      )}
    </div>
  );
}
