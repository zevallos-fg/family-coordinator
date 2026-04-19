interface GroceryDeltaItem {
  name: string;
  quantityNeeded: number | null;
  unit: string | null;
}

interface GroceryDeltaPreviewProps {
  items: GroceryDeltaItem[];
}

export function GroceryDeltaPreview({ items }: GroceryDeltaPreviewProps) {
  if (items.length === 0) {
    return (
      <div className="bg-green-50 border border-green-100 rounded-xl p-4 text-center">
        <p className="text-sm text-green-700 font-medium">Your pantry covers everything!</p>
        <p className="text-xs text-green-500 mt-1">No grocery items needed this week.</p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl border border-orange-100 overflow-hidden">
      <div className="bg-orange-50 px-4 py-3 border-b border-orange-100">
        <h3 className="font-semibold text-gray-800 text-sm">🛒 Added to Grocery List</h3>
        <p className="text-xs text-gray-500 mt-0.5">{items.length} item{items.length !== 1 ? "s" : ""} added to your Grocery tab</p>
      </div>
      <ul className="divide-y divide-gray-50">
        {items.map((item, i) => (
          <li key={i} className="flex items-center justify-between px-4 py-3">
            <span className="text-sm font-medium text-gray-700 capitalize">{item.name}</span>
            {(item.quantityNeeded !== null || item.unit) && (
              <span className="text-xs text-gray-400">
                {item.quantityNeeded !== null ? item.quantityNeeded : ""}
                {item.unit ? ` ${item.unit}` : ""}
              </span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
