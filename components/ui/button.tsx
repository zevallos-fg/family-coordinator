import * as React from "react";

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "default" | "outline" | "ghost";
}

export function Button({
  className = "",
  variant = "default",
  type = "button",
  ...props
}: ButtonProps) {
  const base =
    "inline-flex items-center justify-center rounded-md px-4 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50";
  const variants: Record<string, string> = {
    default: "bg-foreground text-background hover:bg-foreground/90",
    outline:
      "border border-foreground/20 bg-transparent hover:bg-foreground/5",
    ghost: "hover:bg-foreground/5",
  };
  return (
    <button
      type={type}
      className={`${base} ${variants[variant] ?? variants.default} ${className}`}
      {...props}
    />
  );
}
