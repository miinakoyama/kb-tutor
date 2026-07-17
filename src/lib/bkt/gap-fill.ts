export interface KcFormatCounts {
  code: string;
  mcqCount: number;
  saqCount: number;
}

export interface StandardCoverageRow {
  standardId: string;
  kcs: KcFormatCounts[];
}

export interface GapItem {
  standardId: string;
  kcCode: string;
  format: "mcq" | "saq";
}

/**
 * Compute the generation work needed to bring every active KC of the selected
 * standards up to `targetPerFormat` eligible questions in each format.
 *
 * Items are emitted in rounds (at most one MCQ + one SAQ per KC per round)
 * so an interrupted run still spreads new questions across all KCs instead
 * of exhausting one KC before touching the next.
 */
export function computeCoverageGaps(
  rows: readonly StandardCoverageRow[],
  selectedStandardIds: readonly string[],
  targetPerFormat: number,
): GapItem[] {
  const target = Math.max(0, Math.floor(targetPerFormat));
  const selected = new Set(selectedStandardIds);
  const deficits = rows
    .filter((row) => selected.has(row.standardId))
    .flatMap((row) =>
      row.kcs.map((kc) => ({
        standardId: row.standardId,
        kcCode: kc.code,
        mcq: Math.max(0, target - Math.max(0, kc.mcqCount)),
        saq: Math.max(0, target - Math.max(0, kc.saqCount)),
      })),
    );

  const maxRounds = deficits.reduce(
    (max, deficit) => Math.max(max, deficit.mcq, deficit.saq),
    0,
  );
  const items: GapItem[] = [];
  for (let round = 0; round < maxRounds; round++) {
    for (const deficit of deficits) {
      if (deficit.mcq > round) {
        items.push({ standardId: deficit.standardId, kcCode: deficit.kcCode, format: "mcq" });
      }
      if (deficit.saq > round) {
        items.push({ standardId: deficit.standardId, kcCode: deficit.kcCode, format: "saq" });
      }
    }
  }
  return items;
}
