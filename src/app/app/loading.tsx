import { Skeleton } from "@/components/ui";

/** Authenticated-section suspense — dashboard-shaped skeleton while the
 * session/data promises resolve. */
export default function AppLoading() {
  return (
    <div className="px-5 py-8">
      <Skeleton className="mb-5 h-7 w-40" />
      <div className="grid gap-4 sm:grid-cols-2">
        <Skeleton className="h-36" />
        <Skeleton className="h-36" />
      </div>
      <Skeleton className="mt-6 h-56" />
    </div>
  );
}
