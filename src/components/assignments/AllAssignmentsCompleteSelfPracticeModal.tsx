"use client";

import Link from "next/link";
import { Sparkles, X } from "lucide-react";

interface AllAssignmentsCompleteSelfPracticeModalProps {
  open: boolean;
  onDismiss: () => void;
}

export function AllAssignmentsCompleteSelfPracticeModal({
  open,
  onDismiss,
}: AllAssignmentsCompleteSelfPracticeModalProps) {
  if (!open) return null;

  const handleClose = () => {
    onDismiss();
  };

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-[2px]"
      role="dialog"
      aria-modal="true"
      aria-labelledby="all-assignments-complete-title"
    >
      <div className="relative w-full max-w-md rounded-2xl border border-[#16a34a]/35 bg-white p-6 sm:p-8 shadow-xl">
        <button
          type="button"
          onClick={handleClose}
          className="absolute top-3 right-3 p-2 rounded-lg text-slate-gray/60 hover:text-slate-gray hover:bg-slate-100 transition-colors"
          aria-label="Close"
        >
          <X className="w-5 h-5" />
        </button>
        <div className="flex justify-center mb-4">
          <span className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-[#16a34a]/15 text-[#166534]">
            <Sparkles className="w-7 h-7" aria-hidden />
          </span>
        </div>
        <h2
          id="all-assignments-complete-title"
          className="text-xl sm:text-2xl font-bold text-center text-[#14532d] font-heading mb-3 pr-8"
        >
          All assignments complete
        </h2>
        <p className="text-sm sm:text-base text-slate-gray/80 text-center leading-relaxed mb-6">
          Great work — you have finished every assignment from your school. Keep
          building confidence with Self Practice, then you will be even more
          ready for the Keystone Exam.
        </p>
        <div className="flex flex-col sm:flex-row gap-3 sm:justify-center">
          <Link
            href="/self-practice"
            onClick={handleClose}
            className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-lg bg-[#16a34a] text-white text-sm font-semibold hover:bg-[#15803d] transition-colors min-h-[44px]"
          >
            Go to Self Practice
          </Link>
          <button
            type="button"
            onClick={handleClose}
            className="inline-flex items-center justify-center px-5 py-2.5 rounded-lg border border-slate-200 text-slate-gray text-sm font-medium hover:bg-slate-50 transition-colors min-h-[44px]"
          >
            Maybe later
          </button>
        </div>
      </div>
    </div>
  );
}
