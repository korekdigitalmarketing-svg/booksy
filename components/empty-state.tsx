import type { ReactNode } from "react";

export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon: ReactNode;
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex min-h-52 flex-col items-start justify-center gap-3 border-y border-dashed border-border py-10">
      <div className="flex size-9 items-center justify-center rounded-md bg-secondary text-primary">
        {icon}
      </div>
      <div className="max-w-md">
        <h2 className="font-heading text-base font-semibold">{title}</h2>
        <p className="mt-1 text-sm leading-6 text-muted-foreground">{description}</p>
      </div>
      {action}
    </div>
  );
}
