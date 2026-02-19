import { TopicNavigation } from "@/components/TopicNavigation";

export default function Home() {
  return (
    <main className="max-w-4xl mx-auto px-4 sm:px-6 py-6 sm:py-8 lg:py-10">
      <section className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-slate-gray mb-1">
            Welcome back, Scholar! 🌿
          </h1>
          <p className="text-slate-gray/70">
            Pick up where you left off in your Keystone journey.
          </p>
        </div>
        <div className="flex gap-3">
          <div className="rounded-xl bg-white border border-gray-200 px-5 py-3 shadow-sm text-center">
            <p className="text-2xl font-bold text-leaf">74%</p>
            <p className="text-xs font-medium text-slate-gray/60 uppercase tracking-wide">
              Mastery
            </p>
          </div>
          <div className="rounded-xl bg-white border border-gray-200 px-5 py-3 shadow-sm text-center">
            <p className="text-2xl font-bold text-leaf">12</p>
            <p className="text-xs font-medium text-slate-gray/60 uppercase tracking-wide">
              Hours Studied
            </p>
          </div>
        </div>
      </section>

      <section>
        <TopicNavigation />
      </section>
    </main>
  );
}
