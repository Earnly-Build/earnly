import { notFound } from "next/navigation";
import { findOpportunity } from "@/lib/data";
import { OpportunityDetail } from "@/components/OpportunityDetail";

export default async function TaskDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  // Unknown id → the designed 404, not an empty detail shell.
  if (!findOpportunity(id)) notFound();
  return <OpportunityDetail id={id} />;
}
