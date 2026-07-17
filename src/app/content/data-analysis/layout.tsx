import { DataAnalysisTabs } from "./tabs";
import { TabContent } from "./TabContent";

/**
 * Shared shell for all Data Analysis tabs. The App Router keeps this layout
 * mounted across sibling-page navigations, so the title + tabs never remount
 * or shift — only the page body below swaps (with a light fade).
 */
export default function DataAnalysisLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <main className="mx-auto w-full max-w-[1500px] px-4 py-10 sm:px-6 sm:py-12 lg:px-10 lg:py-14 xl:px-12">
      <header className="mb-6">
        <h1 className="font-heading text-2xl font-bold text-heading sm:text-3xl">
          Data Analysis
        </h1>
      </header>

      <DataAnalysisTabs />

      <div className="mt-6">
        <TabContent>{children}</TabContent>
      </div>
    </main>
  );
}
