import { SelfPracticePlanner } from "@/components/SelfPracticePlanner";

export default function SelfPracticePage() {
  return (
    <main className="min-h-screen bg-background text-foreground">
      <div
        className="mx-auto w-full px-4 pb-16 pt-6 sm:px-6 sm:pt-8 lg:px-10 xl:px-12"
        style={{ maxWidth: 1500 }}
      >
        <h1 className="sr-only">Self Practice</h1>

        {/* Aligns the "Select Mode" heading with "UP NEXT" on /assignments:
            the search bar block there is 38px tall + 32px bottom margin. */}
        <div className="mt-[70px]">
          <SelfPracticePlanner />
        </div>
      </div>
    </main>
  );
}
