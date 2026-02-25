import { TopicNavigation } from "@/components/TopicNavigation";

export default function Home() {
  return (
    <main className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8 lg:py-10">
      <section className="mb-8">
        <h1 className="text-2xl sm:text-3xl font-bold font-heading text-[#14532d] mb-1">
          Welcome back! 🌿
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
