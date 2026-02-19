import Link from "next/link";
import { FileSpreadsheet, Edit3, Sparkles } from "lucide-react";

export default function ContentPage() {
  return (
    <main className="max-w-4xl mx-auto px-4 py-8">
      <h1 className="text-xl font-semibold text-slate-gray mb-2">
        Content Management
      </h1>
      <p className="text-slate-gray/90 mb-8">
        Manage question content for the Keystone Biology Exam tutor. The
        following features will be available in a future release.
      </p>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="rounded-lg border border-leaf/30 bg-white p-6 shadow-sm opacity-75">
          <div className="flex items-center gap-3 mb-3">
            <div className="p-2 rounded-md bg-leaf/20">
              <FileSpreadsheet className="w-5 h-5 text-leaf" />
            </div>
            <h2 className="font-medium text-slate-gray">
              Import from Excel/CSV
            </h2>
          </div>
          <p className="text-sm text-slate-gray/80">
            Bulk import questions from spreadsheet files. (Coming soon)
          </p>
        </div>

        <div className="rounded-lg border border-leaf/30 bg-white p-6 shadow-sm opacity-75">
          <div className="flex items-center gap-3 mb-3">
            <div className="p-2 rounded-md bg-leaf/20">
              <Edit3 className="w-5 h-5 text-leaf" />
            </div>
            <h2 className="font-medium text-slate-gray">Bulk Edit Questions</h2>
          </div>
          <p className="text-sm text-slate-gray/80">
            Edit multiple questions at once. (Coming soon)
          </p>
        </div>

        <div className="rounded-lg border border-leaf/30 bg-white p-6 shadow-sm opacity-75 md:col-span-2">
          <div className="flex items-center gap-3 mb-3">
            <div className="p-2 rounded-md bg-leaf/20">
              <Sparkles className="w-5 h-5 text-leaf" />
            </div>
            <h2 className="font-medium text-slate-gray">LLM Mass Production</h2>
          </div>
          <p className="text-sm text-slate-gray/80">
            Generate questions at scale using AI. (Coming soon)
          </p>
        </div>
      </div>
    </main>
  );
}
