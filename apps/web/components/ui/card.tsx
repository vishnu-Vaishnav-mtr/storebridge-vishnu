import type { ComponentPropsWithoutRef, ReactNode } from "react";

export function Card({
  children,
  className = "",
  ...props
}: ComponentPropsWithoutRef<"section">) {
  return (
    <section className={`glass rounded-2xl p-5 ${className}`} {...props}>
      {children}
    </section>
  );
}

export function CardHeader({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="mb-4 flex items-start justify-between gap-4">
      <div>
        <h2 className="text-lg font-semibold text-surface">{title}</h2>
        {description ? (
          <p className="mt-1 text-sm leading-6 text-muted">{description}</p>
        ) : null}
      </div>
      {action}
    </div>
  );
}
