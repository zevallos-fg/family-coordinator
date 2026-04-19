"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

import { importRecipeAction } from "@/app/(app)/meal-plans/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type Mode = "url" | "photo";

const MAX_PHOTO_BYTES = 5 * 1024 * 1024; // 4MB
const SUPPORTED_PHOTO_TYPES = ["image/jpeg", "image/png", "image/webp"];

export function RecipeImportForm() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("url");

  // URL mode state
  const [url, setUrl] = useState("");

  // Photo mode state
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Shared state
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function resetErrors() {
    setError(null);
  }

  function switchMode(next: Mode) {
    setMode(next);
    resetErrors();
  }

  // ── URL submit ───────────────────────────────────────
  async function handleUrlSubmit(e: React.FormEvent) {
    e.preventDefault();
    resetErrors();

    const trimmed = url.trim();
    if (!trimmed) return;

    try {
      new URL(trimmed);
    } catch {
      setError("Enter a valid URL (e.g. https://allrecipes.com/recipe/...)");
      return;
    }

    setLoading(true);
    try {
      const result = await importRecipeAction(trimmed);
      if (result.error) setError(result.error);
      else if (result.recipeId) router.push(`/meal-plans/recipes/${result.recipeId}`);
    } finally {
      setLoading(false);
    }
  }

  // ── Photo handlers ───────────────────────────────────
  function handlePhotoChange(e: React.ChangeEvent<HTMLInputElement>) {
    resetErrors();
    const file = e.target.files?.[0];
    if (!file) {
      setPhotoFile(null);
      setPhotoPreview(null);
      return;
    }

    if (!SUPPORTED_PHOTO_TYPES.includes(file.type)) {
      setError("Photo must be JPEG, PNG, or WEBP");
      setPhotoFile(null);
      setPhotoPreview(null);
      return;
    }

    if (file.size > MAX_PHOTO_BYTES) {
      setError("Photo is larger than 4MB. Try a smaller image.");
      setPhotoFile(null);
      setPhotoPreview(null);
      return;
    }

    setPhotoFile(file);
    const reader = new FileReader();
    reader.onload = (ev) => setPhotoPreview(ev.target?.result as string);
    reader.readAsDataURL(file);
  }

  function clearPhoto() {
    setPhotoFile(null);
    setPhotoPreview(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

async function handlePhotoSubmit(e: React.FormEvent) {
    e.preventDefault();
    resetErrors();
    if (!photoFile) return;

    const formData = new FormData();
    formData.append("image", photoFile);

    setLoading(true);
    try {
      const res = await fetch("/api/recipes/import-from-photo", {
        method: "POST",
        body: formData,
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error ?? `Server returned ${res.status}`);
        return;
      }
      if (data.recipeId) {
        router.push(`/meal-plans/recipes/${data.recipeId}`);
      } else {
        setError("Server returned an empty response");
      }
    } catch (err) {
      setError(
        err instanceof Error
          ? `Upload failed: ${err.message}`
          : "Upload failed with an unknown error"
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="max-w-xl mx-auto px-4 py-8">
      <Link
        href="/meal-plans/recipes"
        className="text-sm text-orange-600 hover:text-orange-800 font-medium"
      >
        ← Back to recipes
      </Link>

      <h1 className="mt-4 text-2xl font-bold text-gray-900">Import a Recipe</h1>
      <p className="mt-1 text-gray-500 text-sm">
        Paste a URL from a recipe site, or take a photo of a cookbook page, recipe card, or screen.
      </p>

      {/* Mode toggle */}
      <div
        role="tablist"
        aria-label="Import method"
        className="mt-6 inline-flex rounded-lg border border-amber-200 bg-amber-50 p-1"
      >
        <button
          role="tab"
          aria-selected={mode === "url"}
          type="button"
          onClick={() => switchMode("url")}
          disabled={loading}
          className={`px-4 py-2 text-sm font-medium rounded-md transition ${
            mode === "url"
              ? "bg-white text-orange-700 shadow-sm"
              : "text-amber-700 hover:text-orange-700"
          }`}
        >
          From URL
        </button>
        <button
          role="tab"
          aria-selected={mode === "photo"}
          type="button"
          onClick={() => switchMode("photo")}
          disabled={loading}
          className={`px-4 py-2 text-sm font-medium rounded-md transition ${
            mode === "photo"
              ? "bg-white text-orange-700 shadow-sm"
              : "text-amber-700 hover:text-orange-700"
          }`}
        >
          From Photo
        </button>
      </div>

      {/* URL mode */}
      {mode === "url" && (
        <form onSubmit={handleUrlSubmit} className="mt-6 space-y-4">
          <div>
            <label htmlFor="url" className="block text-sm font-medium text-gray-700 mb-1">
              Recipe URL
            </label>
            <Input
              id="url"
              type="url"
              placeholder="https://www.allrecipes.com/recipe/..."
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              disabled={loading}
              className="w-full"
            />
            <p className="mt-1.5 text-xs text-gray-500">
              Works with most recipe sites. If a site blocks the fetch (Downshiftology, NYT
              Cooking, etc.), use the From Photo tab instead.
            </p>
          </div>

          {error && (
            <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          )}

          <Button type="submit" disabled={loading || !url.trim()} className="w-full">
            {loading ? (
              <span className="flex items-center justify-center gap-2">
                <span className="animate-spin">⏳</span>
                Importing recipe…
              </span>
            ) : (
              "Import Recipe"
            )}
          </Button>
        </form>
      )}

      {/* Photo mode */}
      {mode === "photo" && (
        <form onSubmit={handlePhotoSubmit} className="mt-6 space-y-4">
          <div>
            <label htmlFor="photo" className="block text-sm font-medium text-gray-700 mb-1">
              Recipe Photo
            </label>

            <input
              ref={fileInputRef}
              id="photo"
              type="file"
              accept="image/jpeg,image/png,image/webp"
              capture="environment"
              onChange={handlePhotoChange}
              disabled={loading}
              className="block w-full text-sm text-gray-700 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:bg-orange-600 file:text-white file:font-medium hover:file:bg-orange-700 file:disabled:opacity-50"
            />

            <p className="mt-1.5 text-xs text-gray-500">
              JPEG, PNG, or WEBP — max 4MB. On mobile, you can snap a photo directly. Legible
              ingredient and step text works best.
            </p>
          </div>

          {photoPreview && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
              <div className="flex items-start gap-3">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={photoPreview}
                  alt="Recipe preview"
                  className="h-32 w-32 object-cover rounded-md border border-amber-200"
                />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-amber-900 truncate">
                    {photoFile?.name}
                  </p>
                  <p className="text-xs text-amber-700 mt-0.5">
                    {photoFile ? `${(photoFile.size / 1024).toFixed(0)} KB` : ""}
                  </p>
                  <button
                    type="button"
                    onClick={clearPhoto}
                    disabled={loading}
                    className="mt-2 text-xs text-orange-700 hover:text-orange-900 font-medium"
                  >
                    Choose a different photo
                  </button>
                </div>
              </div>
            </div>
          )}

          {error && (
            <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          )}

          <Button type="submit" disabled={loading || !photoFile} className="w-full">
            {loading ? (
              <span className="flex items-center justify-center gap-2">
                <span className="animate-spin">⏳</span>
                Reading recipe from photo…
              </span>
            ) : (
              "Import from Photo"
            )}
          </Button>
        </form>
      )}

      {loading && (
        <div className="mt-6 rounded-xl bg-orange-50 border border-orange-100 p-4">
          <p className="text-sm text-orange-700 font-medium">
            {mode === "url" ? "Fetching and analyzing the recipe…" : "Extracting the recipe from your photo…"}
          </p>
          <p className="text-xs text-orange-500 mt-1">This takes 5–10 seconds.</p>
        </div>
      )}
    </div>
  );
}