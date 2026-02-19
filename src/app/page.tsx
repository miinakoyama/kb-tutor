import { TopicNavigation } from "@/components/TopicNavigation";

export default function Home() {
  return (
    <main className="max-w-4xl mx-auto px-4 sm:px-6 py-6 sm:py-8 lg:py-10">
      <section className="mb-8">
        <h1 className="text-2xl sm:text-3xl font-bold text-slate-gray mb-1">
          Welcome back, Scholar! 🌿
        </h1>
        <p className="text-slate-gray/70">
          Pick up where you left off in your Keystone journey.
        </p>
      </section>

      <section>
        <TopicNavigation />
      </section>
    </main>
  );
}
