"use client";

import { useEffect, useState, startTransition } from "react";

function getTimeOfDay(hour: number): "morning" | "afternoon" | "evening" | "night" {
  if (hour >= 5 && hour < 12) return "morning";
  if (hour >= 12 && hour < 17) return "afternoon";
  if (hour >= 17 && hour < 22) return "evening";
  return "night";
}

interface GreetingProps {
  name: string;
  className?: string;
}

export function Greeting({ name, className = "" }: GreetingProps) {
  const [timeOfDay, setTimeOfDay] = useState<string | null>(null);

  useEffect(() => {
    startTransition(() => {
      setTimeOfDay(getTimeOfDay(new Date().getHours()));
    });
  }, []);

  // SSR + first client render: show name without time-of-day to avoid hydration mismatch.
  // useEffect fires after hydration and sets the real greeting.
  if (!timeOfDay) {
    return (
      <h1 className={`text-2xl font-semibold text-stone-800 ${className}`}>
        Hi, {name}
      </h1>
    );
  }

  return (
    <h1 className={`text-2xl font-semibold text-stone-800 ${className}`}>
      Good {timeOfDay}, {name}
    </h1>
  );
}
