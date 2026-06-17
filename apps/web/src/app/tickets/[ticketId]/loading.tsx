export default function TicketDetailLoading() {
  return (
    <main className="mx-auto max-w-6xl space-y-6 px-6 py-8">
      <div className="h-10 w-72 animate-pulse rounded-xl bg-white/[0.08]" />
      <div className="grid gap-4 lg:grid-cols-[1.8fr_1fr]">
        <div className="space-y-4">
          <div className="h-80 animate-pulse rounded-3xl border border-white/10 bg-ink-850/70" />
          <div className="h-96 animate-pulse rounded-3xl border border-white/10 bg-ink-850/70" />
        </div>
        <div className="space-y-4">
          <div className="h-48 animate-pulse rounded-3xl border border-white/10 bg-ink-850/70" />
          <div className="h-64 animate-pulse rounded-3xl border border-white/10 bg-ink-850/70" />
          <div className="h-64 animate-pulse rounded-3xl border border-white/10 bg-ink-850/70" />
        </div>
      </div>
    </main>
  );
}
