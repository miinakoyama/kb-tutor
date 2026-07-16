import type { ReactNode } from "react";

interface UnderlineTab<T extends string> {
  value: T;
  label: string;
}

interface UnderlineTabsProps<T extends string> {
  tabs: UnderlineTab<T>[];
  value: T;
  onChange: (value: T) => void;
  /** Optional trailing content on the same row, right-aligned (e.g. extra action buttons). */
  trailing?: ReactNode;
  className?: string;
}

export function UnderlineTabs<T extends string>({
  tabs,
  value,
  onChange,
  trailing,
  className = "",
}: UnderlineTabsProps<T>) {
  return (
    <div
      className={`mb-6 flex flex-wrap items-center gap-4 border-b border-border-default${
        trailing ? " justify-between" : ""
      }${className ? ` ${className}` : ""}`}
    >
      <div className="flex flex-wrap items-center gap-4">
        {tabs.map((tab) => {
          const active = tab.value === value;
          return (
            <button
              key={tab.value}
              type="button"
              onClick={() => onChange(tab.value)}
              className={`-mb-px border-b-2 px-1.5 pb-2.5 pt-1 text-sm font-semibold transition-colors ${
                active
                  ? "border-primary text-heading"
                  : "border-transparent text-slate-gray/60 hover:text-slate-gray"
              }`}
            >
              {tab.label}
            </button>
          );
        })}
      </div>
      {trailing && <div className="flex items-center gap-2 pb-2">{trailing}</div>}
    </div>
  );
}
