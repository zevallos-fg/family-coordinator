"use client";

import { useEffect, useState, startTransition } from "react";

interface TodayDateProps {
  familyName: string;
  className?: string;
}

export function TodayDate({ familyName, className = "" }: TodayDateProps) {
  const [dateDisplay, setDateDisplay] = useState<string | null>(null);

  useEffect(() => {
    startTransition(() => {
      setDateDisplay(
        new Date().toLocaleDateString("en-US", {
          weekday: "long",
          month: "long",
          day: "numeric",
        })
      );
    });
  }, []);

  if (!dateDisplay) {
    return (
      <p className={`text-stone-500 text-sm mt-0.5 ${className}`}>
        {familyName}
      </p>
    );
  }

  return (
    <p className={`text-stone-500 text-sm mt-0.5 ${className}`}>
      {dateDisplay} · {familyName}
    </p>
  );
}
