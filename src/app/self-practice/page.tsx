import { SelfPracticePlanner } from "@/components/SelfPracticePlanner";

export default function SelfPracticePage() {
  return (
    <main className="min-h-screen bg-background text-foreground">
      <div
        className="mx-auto w-full px-4 pb-16 pt-6 sm:px-6 sm:pt-8 lg:px-10 xl:px-12"
        style={{ maxWidth: 1500 }}
      >
        <section className="mb-8">
        <h1 className="font-heading mb-2 text-2xl font-bold text-heading sm:text-3xl">
          Self Practice
        </h1>
        </section>

        <SelfPracticePlanner />
      </div>
    </main>
  );
}
