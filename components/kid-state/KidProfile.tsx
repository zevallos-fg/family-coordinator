interface KidProfileProps {
  kid: {
    id: string;
    name: string;
    birth_date: string | null;
    notes: string | null;
    food_favorites: string[] | null;
    food_aversions: string[] | null;
    clothing_size: string | null;
    shoe_size: string | null;
  };
}

function calcAge(birthDate: string): string {
  const born = new Date(birthDate);
  const now = new Date();
  const months =
    (now.getFullYear() - born.getFullYear()) * 12 +
    (now.getMonth() - born.getMonth());
  const years = Math.floor(months / 12);
  const rem = months % 12;
  if (years === 0) return `${rem} month${rem !== 1 ? "s" : ""}`;
  return `${years} yr${years > 1 ? "s" : ""}${rem > 0 ? `, ${rem} mo` : ""}`;
}

export function KidProfile({ kid }: KidProfileProps) {
  return (
    <div className="space-y-4">
      <div className="flex items-baseline gap-3">
        <h2 className="text-xl font-semibold">{kid.name}</h2>
        {kid.birth_date && (
          <span className="text-sm text-foreground/50">{calcAge(kid.birth_date)}</span>
        )}
      </div>

      {kid.notes && (
        <div>
          <h3 className="text-xs uppercase tracking-wider text-foreground/40 mb-1">
            Current notes
          </h3>
          <p className="text-sm text-foreground/80 whitespace-pre-wrap">{kid.notes}</p>
        </div>
      )}

      {(kid.food_favorites?.length ?? 0) > 0 && (
        <div>
          <h3 className="text-xs uppercase tracking-wider text-foreground/40 mb-1">
            Loves to eat
          </h3>
          <div className="flex flex-wrap gap-1">
            {kid.food_favorites!.map((f) => (
              <span
                key={f}
                className="rounded-full bg-green-100 px-2 py-0.5 text-xs text-green-800"
              >
                {f}
              </span>
            ))}
          </div>
        </div>
      )}

      {(kid.food_aversions?.length ?? 0) > 0 && (
        <div>
          <h3 className="text-xs uppercase tracking-wider text-foreground/40 mb-1">
            Won&apos;t eat / allergies
          </h3>
          <div className="flex flex-wrap gap-1">
            {kid.food_aversions!.map((f) => (
              <span
                key={f}
                className="rounded-full bg-red-100 px-2 py-0.5 text-xs text-red-800"
              >
                {f}
              </span>
            ))}
          </div>
        </div>
      )}

      {(kid.clothing_size || kid.shoe_size) && (
        <div className="flex gap-4 text-sm text-foreground/60">
          {kid.clothing_size && <span>Clothing: {kid.clothing_size}</span>}
          {kid.shoe_size && <span>Shoes: {kid.shoe_size}</span>}
        </div>
      )}
    </div>
  );
}
