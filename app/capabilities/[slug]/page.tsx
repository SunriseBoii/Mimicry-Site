import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { competenceOrder, isCompetenceId } from "../../_brand/color-system";
import { CapabilityPage } from "../_components/CapabilityPage";
import { capabilityPageData } from "../capability-data";

export function generateStaticParams() {
  return competenceOrder.map((slug) => ({ slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  if (!isCompetenceId(slug)) return {};
  return { title: `${capabilityPageData[slug].label} — Mimicry group` };
}

export default async function CapabilityRoute({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  if (!isCompetenceId(slug)) notFound();
  return <CapabilityPage data={capabilityPageData[slug]} />;
}
