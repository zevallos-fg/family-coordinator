interface Capture {
  id: string;
  text: string;
  created_at: string;
  voice_transcription: boolean;
  categories: { name: string; icon: string | null } | null;
}

interface CaptureListProps {
  captures: Capture[];
}

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export function CaptureList({ captures }: CaptureListProps) {
  if (captures.length === 0) {
    return (
      <div className="text-center py-12 text-stone-400">
        <p className="text-sm">Nothing captured yet</p>
        <p className="text-xs mt-1">Use the form above to start</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {captures.map((c) => (
        <div
          key={c.id}
          className="bg-white rounded-xl border border-stone-200 p-3 flex items-start gap-3"
        >
          {c.categories?.icon && (
            <span className="text-lg shrink-0 mt-0.5">{c.categories.icon}</span>
          )}
          <div className="flex-1 min-w-0">
            <p className="text-sm text-stone-800 line-clamp-2">{c.text}</p>
            <div className="flex gap-2 mt-1.5 flex-wrap">
              {c.categories?.name && (
                <span className="text-xs px-2 py-0.5 bg-amber-50 text-amber-700 rounded-full">
                  {c.categories.name}
                </span>
              )}
              {c.voice_transcription && (
                <span className="text-xs text-stone-400">🎤 voice</span>
              )}
              <span className="text-xs text-stone-400">{timeAgo(c.created_at)}</span>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
