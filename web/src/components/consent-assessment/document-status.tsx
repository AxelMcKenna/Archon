"use client";

export function ConsentErrorAlert({ message }: { message: string }) {
  return (
    <section className="rounded-2xl border border-red-200 bg-red-50 p-5 text-sm text-red-800">
      {message}
    </section>
  );
}

export function CompletionBadge({ completed }: { completed: boolean }) {
  return (
    <span
      className={`inline-flex rounded-full px-3 py-1.5 text-sm font-medium ${
        completed
          ? "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200"
          : "bg-amber-50 text-amber-700 ring-1 ring-amber-200"
      }`}
    >
      {completed ? "Complete" : "Incomplete"}
    </span>
  );
}

export function UploadBadge({ uploaded }: { uploaded: boolean }) {
  return (
    <span
      className={`inline-flex rounded-full px-3 py-1.5 text-sm font-medium ${
        uploaded
          ? "bg-sky-50 text-sky-700 ring-1 ring-sky-200"
          : "bg-slate-100 text-slate-600 ring-1 ring-slate-200"
      }`}
    >
      {uploaded ? "File uploaded" : "No file"}
    </span>
  );
}

export function confirmDocumentRemoval() {
  return window.confirm("Are you sure you want to remove this required document?");
}
