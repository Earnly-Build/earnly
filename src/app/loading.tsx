import { Skeleton } from "@/components/ui";

/** Root suspense — a skeleton frame in the app's visual system while
 * the route's data settles, instead of a blank screen. */
export default function Loading() {
  return (
    <div className="mx-auto max-w-[1180px] px-5 py-10">
      <Skeleton className="mb-4 h-8 w-52" />
      <Skeleton className="mb-8 h-4 w-80" />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-44" />
        ))}
      </div>
    </div>
  );
}
