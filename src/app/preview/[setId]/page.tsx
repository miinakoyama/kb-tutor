import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { QuestionSetPreviewClient } from "@/components/preview/QuestionSetPreviewClient";
import { resolveRole } from "@/lib/auth/role";
import { getDefaultStandardForTopic } from "@/lib/standards";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { PracticeMode, Question } from "@/types/question";

type PreviewPageProps = {
  params: Promise<{ setId: string }>;
  searchParams: Promise<{ mode?: string }>;
};

function parseMode(value: string | undefined): PracticeMode {
  if (value === "exam" || value === "review") return value;
  return "practice";
}

function withStandard(question: Question): Question {
  if (question.standardId) return question;
  const standard = getDefaultStandardForTopic(question.topic);
  return {
    ...question,
    standardId: standard.id,
    standardLabel: standard.label,
  };
}

export default async function PreviewQuestionSetPage({
  params,
  searchParams,
}: PreviewPageProps) {
  const { setId } = await params;
  const { mode } = await searchParams;
  const selectedMode = parseMode(mode);
  const supabase = await createSupabaseServerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return (
      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-center">
          <p className="text-sm text-red-700">You need to sign in to use preview.</p>
        </div>
      </main>
    );
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();
  const role = resolveRole(profile?.role, user);

  if (role !== "teacher" && role !== "admin") {
    return (
      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-center">
          <p className="text-sm text-red-700">
            Only teachers and admins can open this preview.
          </p>
        </div>
      </main>
    );
  }

  const [{ data: setData }, { data: questionRows }] = await Promise.all([
    supabase
      .from("generated_question_sets")
      .select("id,name")
      .eq("id", setId)
      .maybeSingle(),
    supabase
      .from("generated_questions")
      .select("id,payload,include_in_self_practice,is_visible")
      .eq("set_id", setId)
      .order("created_at", { ascending: true })
      .order("id", { ascending: true }),
  ]);

  const questions: Question[] = (questionRows ?? []).map((row) => {
    const payload = row.payload as Question;
    return withStandard({
      ...payload,
      id: payload.id || String(row.id),
      source: payload.source ?? "generated",
      questionSetId: setId,
      includeInSelfPractice: row.include_in_self_practice === true,
      isVisible: row.is_visible === true,
    });
  });
  const setName = setData?.name ? String(setData.name) : "Question Set Preview";

  if (!setData || questions.length === 0) {
    return (
      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <Link
          href="/content/questions"
          className="inline-flex items-center gap-2 text-base font-semibold text-[#14532d] hover:text-[#166534] transition-colors mb-6"
        >
          <span className="flex items-center justify-center w-8 h-8 rounded-lg bg-[#16a34a]/10">
            <ArrowLeft className="w-4 h-4 text-[#14532d]" />
          </span>
          Back to Question Sets
        </Link>
        <div className="rounded-xl border border-slate-200 bg-white p-8 text-center">
          <p className="text-sm text-slate-gray/70">
            This question set could not be loaded for preview.
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="h-[calc(100vh-4rem)] lg:h-screen overflow-hidden">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 pt-3 sm:pt-4 lg:pt-5 pb-1 sm:pb-2 lg:pb-3 h-full overflow-y-auto">
        <QuestionSetPreviewClient
          setId={setId}
          setName={setName}
          questions={questions}
          mode={selectedMode}
        />
      </div>
    </main>
  );
}
