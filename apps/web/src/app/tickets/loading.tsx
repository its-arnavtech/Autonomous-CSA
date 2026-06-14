export default function TicketsLoading() {
  return (
    <main className="mx-auto max-w-6xl space-y-4 px-6 py-8">
      <div className="h-9 w-48 animate-pulse rounded-xl bg-slate-200" />
      <div className="h-5 w-32 animate-pulse rounded-xl bg-slate-100" />
      <div className="space-y-3">
        {Array.from({ length: 4 }).map((_, index) => (
          <div
            key={index}
            className="h-28 animate-pulse rounded-3xl border border-slate-200 bg-white"
          />
        ))}
      </div>
    </main>
  );
}
