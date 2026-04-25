"use client";

interface Vendor {
  id: string;
  name: string;
  category: string | null;
  phone: string | null;
  email: string | null;
  last_used_at: string | null;
  rating: number | null;
}

interface VendorTableProps {
  vendors: Vendor[];
  onDelete?: (id: string) => void;
}

export function VendorTable({ vendors, onDelete }: VendorTableProps) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-stone-200 text-left">
            <th className="pb-2 font-medium text-stone-500">Name</th>
            <th className="pb-2 font-medium text-stone-500">Category</th>
            <th className="pb-2 font-medium text-stone-500">Phone</th>
            <th className="pb-2 font-medium text-stone-500">Last Used</th>
            <th className="pb-2 font-medium text-stone-500"></th>
          </tr>
        </thead>
        <tbody>
          {vendors.map((v) => (
            <tr key={v.id} className="border-b border-stone-100 hover:bg-stone-50 transition-colors">
              <td className="py-3 font-medium text-stone-800">
                <a href={`/vendors/${v.id}`} className="hover:text-amber-700">{v.name}</a>
              </td>
              <td className="py-3 text-stone-500">{v.category ?? "—"}</td>
              <td className="py-3 text-stone-500">{v.phone ?? "—"}</td>
              <td className="py-3 text-stone-400 text-xs">
                {v.last_used_at
                  ? new Date(v.last_used_at).toLocaleDateString()
                  : "Never"}
              </td>
              <td className="py-3">
                <div className="flex gap-2">
                  <a
                    href={`/vendors/${v.id}`}
                    className="text-xs text-amber-700 hover:underline"
                  >
                    View
                  </a>
                  {onDelete && (
                    <button
                      onClick={() => onDelete(v.id)}
                      className="text-xs text-red-500 hover:underline"
                    >
                      Delete
                    </button>
                  )}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
