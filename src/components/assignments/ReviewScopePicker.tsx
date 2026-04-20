"use client";

import { useMemo, useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import {
  getStandardsForModule,
  type ModuleCode,
  type StandardInfo,
} from "@/lib/standards";

export interface ReviewScope {
  standards: string[];
  maxQuestions: number;
}

interface ReviewScopePickerProps {
  value: ReviewScope;
  onChange: (next: ReviewScope) => void;
}

interface CategoryGroup {
  category: string;
  standards: StandardInfo[];
}

interface ModuleGroup {
  module: ModuleCode;
  categories: CategoryGroup[];
}

const MODULE_ORDER: ModuleCode[] = ["A", "B"];

function buildModuleGroups(): ModuleGroup[] {
  return MODULE_ORDER.map((module) => {
    const standards = getStandardsForModule(module);
    const byCategory = new Map<string, StandardInfo[]>();
    for (const standard of standards) {
      const bucket = byCategory.get(standard.category) ?? [];
      bucket.push(standard);
      byCategory.set(standard.category, bucket);
    }
    const categories: CategoryGroup[] = Array.from(byCategory.entries()).map(
      ([category, items]) => ({ category, standards: items }),
    );
    return { module, categories };
  });
}

export function ReviewScopePicker({ value, onChange }: ReviewScopePickerProps) {
  const groups = useMemo(() => buildModuleGroups(), []);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const selectedSet = useMemo(() => new Set(value.standards), [value.standards]);

  const setSelection = (nextStandards: Set<string>) => {
    onChange({ ...value, standards: Array.from(nextStandards) });
  };

  const toggleStandard = (standardId: string) => {
    const next = new Set(selectedSet);
    if (next.has(standardId)) next.delete(standardId);
    else next.add(standardId);
    setSelection(next);
  };

  const toggleCategory = (group: CategoryGroup) => {
    const ids = group.standards.map((s) => s.id);
    const allSelected = ids.every((id) => selectedSet.has(id));
    const next = new Set(selectedSet);
    if (allSelected) {
      for (const id of ids) next.delete(id);
    } else {
      for (const id of ids) next.add(id);
    }
    setSelection(next);
  };

  const toggleModule = (group: ModuleGroup) => {
    const ids = group.categories.flatMap((c) => c.standards.map((s) => s.id));
    const allSelected = ids.every((id) => selectedSet.has(id));
    const next = new Set(selectedSet);
    if (allSelected) {
      for (const id of ids) next.delete(id);
    } else {
      for (const id of ids) next.add(id);
    }
    setSelection(next);
  };

  const keyFor = (moduleCode: ModuleCode, category: string) =>
    `${moduleCode}::${category}`;

  const toggleExpanded = (key: string) => {
    setExpanded((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  return (
    <div className="space-y-5">
      <div className="rounded-lg border border-amber-200 bg-amber-50/60 px-3 py-2 text-xs text-amber-800">
        Review mode pulls questions each student previously answered incorrectly,
        filtered to the standards you pick below. Since each standard belongs to a
        single topic, selecting a standard automatically scopes the topic too. No
        snapshot is saved — different students may see different questions.
      </div>

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h4 className="text-sm font-semibold text-slate-gray">Standards</h4>
          <p className="text-xs text-slate-gray/60">
            {selectedSet.size} selected
          </p>
        </div>

        <div className="space-y-4">
          {groups.map((moduleGroup) => {
            const moduleStandardIds = moduleGroup.categories.flatMap((c) =>
              c.standards.map((s) => s.id),
            );
            const moduleAllSelected =
              moduleStandardIds.length > 0 &&
              moduleStandardIds.every((id) => selectedSet.has(id));
            const moduleSelectedCount = moduleStandardIds.filter((id) =>
              selectedSet.has(id),
            ).length;

            return (
              <div
                key={moduleGroup.module}
                className="rounded-lg border border-slate-200 bg-white"
              >
                <div className="flex items-center justify-between border-b border-slate-100 px-3 py-2">
                  <p className="text-sm font-semibold text-slate-gray">
                    Module {moduleGroup.module}
                    <span className="ml-2 text-xs font-normal text-slate-gray/60">
                      ({moduleSelectedCount}/{moduleStandardIds.length})
                    </span>
                  </p>
                  <button
                    type="button"
                    onClick={() => toggleModule(moduleGroup)}
                    className="text-xs text-[#15803d] hover:underline"
                  >
                    {moduleAllSelected ? "Deselect all" : "Select all"}
                  </button>
                </div>

                <ul className="divide-y divide-slate-100">
                  {moduleGroup.categories.map((categoryGroup) => {
                    const key = keyFor(
                      moduleGroup.module,
                      categoryGroup.category,
                    );
                    const isExpanded = expanded[key] ?? false;
                    const ids = categoryGroup.standards.map((s) => s.id);
                    const allSelected = ids.every((id) => selectedSet.has(id));
                    const someSelected =
                      !allSelected && ids.some((id) => selectedSet.has(id));
                    const selectedCount = ids.filter((id) =>
                      selectedSet.has(id),
                    ).length;

                    return (
                      <li key={key} className="px-3 py-2">
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => toggleExpanded(key)}
                            className="p-1 rounded hover:bg-slate-100"
                            aria-label={
                              isExpanded
                                ? "Collapse category"
                                : "Expand category"
                            }
                          >
                            {isExpanded ? (
                              <ChevronDown className="w-4 h-4 text-slate-500" />
                            ) : (
                              <ChevronRight className="w-4 h-4 text-slate-500" />
                            )}
                          </button>
                          <label className="flex-1 flex items-center gap-2 text-sm text-slate-gray cursor-pointer select-none">
                            <input
                              type="checkbox"
                              className="w-4 h-4 accent-[#16a34a]"
                              checked={allSelected}
                              ref={(el) => {
                                if (el) el.indeterminate = someSelected;
                              }}
                              onChange={() => toggleCategory(categoryGroup)}
                            />
                            <span className="flex-1 font-medium">
                              {categoryGroup.category}
                            </span>
                            <span className="text-xs text-slate-gray/60">
                              {selectedCount}/{ids.length}
                            </span>
                          </label>
                        </div>

                        {isExpanded && (
                          <ul className="mt-2 ml-10 space-y-1">
                            {categoryGroup.standards.map((standard) => {
                              const checked = selectedSet.has(standard.id);
                              return (
                                <li key={standard.id}>
                                  <label className="flex items-start gap-2 text-xs text-slate-gray cursor-pointer">
                                    <input
                                      type="checkbox"
                                      className="mt-1 w-4 h-4 accent-[#16a34a]"
                                      checked={checked}
                                      onChange={() =>
                                        toggleStandard(standard.id)
                                      }
                                    />
                                    <span className="flex-1">
                                      <span className="font-medium">
                                        {standard.id}
                                      </span>
                                      <span className="ml-1 text-slate-gray/70">
                                        {standard.label}
                                      </span>
                                    </span>
                                  </label>
                                </li>
                              );
                            })}
                          </ul>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </div>
            );
          })}
        </div>
      </section>

      <label className="block text-sm text-slate-gray">
        <span className="block mb-1 font-medium">
          Max questions per student (1–50)
        </span>
        <input
          type="number"
          min={1}
          max={50}
          value={value.maxQuestions}
          onChange={(event) => {
            const parsed = Number(event.target.value);
            const safe = Number.isFinite(parsed)
              ? Math.max(1, Math.min(50, parsed))
              : 1;
            onChange({ ...value, maxQuestions: safe });
          }}
          className="w-32 rounded-lg border border-slate-200 px-3 py-2 focus:ring-2 focus:ring-[#16a34a]/20 focus:border-[#16a34a] outline-none"
        />
        <span className="ml-2 text-xs text-slate-gray/60">
          If fewer incorrect questions exist, all of them will be shown.
        </span>
      </label>
    </div>
  );
}
