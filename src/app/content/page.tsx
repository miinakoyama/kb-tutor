import Link from "next/link";
import { FileSpreadsheet, Edit3, Sparkles, ChevronRight } from "lucide-react";

export default function ContentPage() {
  return (
    <main className="max-w-5xl mx-auto px-4 py-8">
      <h1 className="text-xl font-bold text-slate-gray mb-2">
        Content Management
      </h1>
      <p className="text-slate-gray/70 mb-8">
        Manage question content for the Keystone Biology Exam tutor.
      </p>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="rounded-xl border border-[#16a34a]/30 bg-white p-6 shadow-sm opacity-60">
          <div className="flex items-center gap-3 mb-3">
            <FileSpreadsheet className="w-6 h-6 text-[#16a34a]" />
            <h2 className="font-medium text-slate-gray">
              Import from Excel/CSV
            </h2>
          </div>
          <p className="text-sm text-slate-gray/70">
            Bulk import questions from spreadsheet files. (Coming soon)
          </p>
        </div>

        <Link
          href="/content/questions"
          className="rounded-xl border border-[#16a34a]/30 bg-white p-6 shadow-sm hover:border-[#16a34a] hover:shadow-md transition-all group"
        >
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-3">
              <Edit3 className="w-6 h-6 text-[#16a34a]" />
              <h2 className="font-medium text-slate-gray">Question Manager</h2>
            </div>
            <ChevronRight className="w-5 h-5 text-slate-gray/30 group-hover:text-[#16a34a] transition-colors" />
          </div>
          <p className="text-sm text-slate-gray/70">
            View, edit, and manage existing questions by set.
          </p>
        </Link>

        <Link
          href="/content/mass-production"
          className="rounded-xl border border-[#16a34a]/30 bg-white p-6 shadow-sm hover:border-[#16a34a] hover:shadow-md transition-all md:col-span-2 group"
        >
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-3">
              <Sparkles className="w-6 h-6 text-[#16a34a]" />
              <h2 className="font-medium text-slate-gray">LLM Mass Production</h2>
            </div>
            <ChevronRight className="w-5 h-5 text-slate-gray/30 group-hover:text-[#16a34a] transition-colors" />
          </div>
          <p className="text-sm text-slate-gray/70">
            Generate questions at scale using AI (Gemini).
          </p>
        </Link>
      </div>
    </main>
  );
}
