import Link from "next/link";
import { ChevronRight } from "lucide-react";

export interface BreadcrumbItem {
  label: string;
  href?: string;
}

export function Breadcrumbs({ items }: { items: BreadcrumbItem[] }) {
  return (
    <nav
      aria-label="Breadcrumb"
      className="mb-4 flex flex-wrap items-center gap-1.5 text-sm font-medium"
    >
      {items.map((item, index) => {
        const isLast = index === items.length - 1;
        return (
          <span key={`${item.label}-${index}`} className="flex items-center gap-1.5">
            {index > 0 && <ChevronRight className="h-3.5 w-3.5 text-slate-gray/40" />}
            {item.href && !isLast ? (
              <Link
                href={item.href}
                className="text-forest hover:text-heading hover:underline"
              >
                {item.label}
              </Link>
            ) : (
              <span className={isLast ? "text-slate-gray" : "text-forest"}>
                {item.label}
              </span>
            )}
          </span>
        );
      })}
    </nav>
  );
}
