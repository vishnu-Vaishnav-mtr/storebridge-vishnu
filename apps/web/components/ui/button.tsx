import Link from "next/link";
import type { ComponentPropsWithoutRef } from "react";

type ButtonProps = ComponentPropsWithoutRef<"button"> & {
  href?: string;
  variant?: "primary" | "secondary" | "ghost" | "danger";
};

const variants = {
  primary: "green-gradient text-ink shadow-glow",
  secondary: "border border-white/10 bg-white/8 text-surface hover:bg-white/12",
  ghost: "text-muted hover:bg-white/8 hover:text-surface",
  danger:
    "bg-danger/15 text-red-100 border border-danger/30 hover:bg-danger/25",
};

export function Button({
  href,
  variant = "primary",
  className = "",
  children,
  ...props
}: ButtonProps) {
  const classes = `focus-ring inline-flex min-h-10 items-center justify-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold transition ${variants[variant]} ${className}`;

  if (href) {
    return (
      <Link href={href} className={classes}>
        {children}
      </Link>
    );
  }

  return (
    <button className={classes} {...props}>
      {children}
    </button>
  );
}
