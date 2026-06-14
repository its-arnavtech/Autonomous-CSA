export default function TicketDetailLoading() {
  return (
    <main className="mx-auto max-w-6xl space-y-6 px-6 py-8">
      <div className="h-10 w-72 animate-pulse rounded-xl bg-slate-200" />
      <div className="grid gap-4 lg:grid-cols-[1.8fr_1fr]">
        <div className="space-y-4">
          <div className="h-80 animate-pulse rounded-3xl border border-slate-200 bg-white" />
          <div className="h-96 animate-pulse rounded-3xl border border-slate-200 bg-white" />
        </div>
        <div className="space-y-4">
          <div className="h-48 animate-pulse rounded-3xl border border-slate-200 bg-white" />
          <div className="h-64 animate-pulse rounded-3xl border border-slate-200 bg-white" />
          <div className="h-64 animate-pulse rounded-3xl border border-slate-200 bg-white" />
        </div>
      </div>
    </main>
  );
}
