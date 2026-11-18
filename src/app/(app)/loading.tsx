// Shown at once, inside the shell, while the next signed-in page is being prepared on the server. Without it a click on a link showed the OLD page until the new one was
// completely ready, which felt like the app had not heard the click. Tailwind classes only (the CSP refuses inline styles); `motion-safe` so a person who asks for less motion
// sees a still outline. The live region says "Loading" once for a screen reader instead of announcing every grey block.
export default function Loading() {
  return (
    <div role="status" aria-live="polite" aria-busy="true">
      <span className="sr-only">Loading the page…</span>
      <div aria-hidden="true" className="space-y-6 motion-safe:animate-pulse">
        <div className="space-y-2">
          <div className="h-7 w-48 max-w-full rounded-lg bg-surface-2" />
          <div className="h-4 w-80 max-w-full rounded-lg bg-surface-2" />
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <div className="h-28 rounded-2xl border border-line bg-surface" />
          <div className="h-28 rounded-2xl border border-line bg-surface" />
          <div className="h-28 rounded-2xl border border-line bg-surface sm:col-span-2 lg:col-span-1" />
        </div>
        <div className="h-64 rounded-2xl border border-line bg-surface" />
      </div>
    </div>
  );
}
