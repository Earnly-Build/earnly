"use client";

import { EmptyState, Button } from "@/components/ui";

/** Root error boundary — a thrown render error lands on this designed
 * fallback (the app's own EmptyState) with a retry, not Next's bare page. */
export default function GlobalError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="mx-auto max-w-[760px] px-5 py-20">
      <EmptyState
        title="Something broke on this page"
        body="The page hit an unexpected error. You can retry it — if it keeps happening, that is on us."
        action={
          <Button variant="primary" onClick={reset}>
            Try again
          </Button>
        }
      />
    </div>
  );
}
