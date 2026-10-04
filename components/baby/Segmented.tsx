"use client";

/**
 * A row of large, equal-width choices — the control the detail chips should
 * have been. Each option is a full-height target a thumb can hit at 3am, the
 * selected one is unmistakable, and tapping it again clears it (nothing here is
 * ever required).
 *
 * Up to three options sit in one row; more wrap into rows of three.
 */
export function Segmented({
  options,
  labels,
  value,
  onChange,
  disabled,
  testIdPrefix,
}: {
  options: string[];
  labels?: Record<string, string>;
  value: string | null | undefined;
  onChange: (next: string | null) => void;
  disabled?: boolean;
  testIdPrefix: string;
}) {
  const cols = options.length === 1 ? "grid-cols-1" : options.length === 2 ? "grid-cols-2" : "grid-cols-3";
  return (
    <div className={`grid ${cols} gap-1.5`} role="radiogroup">
      {options.map((option) => {
        const selected = value === option;
        return (
          <button
            key={option}
            type="button"
            role="radio"
            aria-checked={selected}
            disabled={disabled}
            data-testid={`${testIdPrefix}-${option}`}
            onClick={() => onChange(selected ? null : option)}
            className={`min-h-12 rounded-xl px-2 py-3 text-base font-medium capitalize transition-colors disabled:opacity-50 ${
              selected
                ? "bg-stone-800 text-white"
                : "bg-white text-stone-700 ring-1 ring-stone-200 active:bg-stone-100"
            }`}
          >
            {labels?.[option] ?? option}
          </button>
        );
      })}
    </div>
  );
}
