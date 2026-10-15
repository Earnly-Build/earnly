import { EmptyState, Button } from "@/components/ui";

/** Designed 404 — the EmptyState system, not Next's generic page. */
export default function NotFound() {
  return (
    <div className="mx-auto max-w-[760px] px-5 py-20">
      <EmptyState
        title="This corner of the market does not exist"
        body="The page may have moved or the link may be old. Everything worth earning is on the browse wall."
        action={
          <Button href="/" variant="primary">
            Back to Earnly
          </Button>
        }
      />
    </div>
  );
}
