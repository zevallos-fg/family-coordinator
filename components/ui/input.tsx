import * as React from "react";

// `ref` included: an uncontrolled field is the fix for input typed before
// hydration, and an uncontrolled field is read through its ref. A UI primitive
// that swallows the ref forces every caller back to a raw <input>.
// React 19 passes ref as an ordinary prop to function components, so no
// forwardRef is needed — only the type.
export type InputProps = React.InputHTMLAttributes<HTMLInputElement> & {
  ref?: React.Ref<HTMLInputElement>;
};

export function Input({ className = "", ref, ...props }: InputProps) {
  return (
    <input
      ref={ref}
      className={`flex h-10 w-full rounded-md border border-foreground/20 bg-transparent px-3 py-2 text-sm placeholder:text-foreground/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/30 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 ${className}`}
      {...props}
    />
  );
}
