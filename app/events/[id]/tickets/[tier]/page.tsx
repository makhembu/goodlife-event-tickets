import type { Metadata } from "next";
import RootPage, { generateMetadata as rootGenerateMetadata } from "@/app/page";

export const dynamic = "force-dynamic";

export async function generateMetadata(props: {
  params: Promise<{ id: string; tier: string }>;
}): Promise<Metadata> {
  const { id, tier } = await props.params;
  return rootGenerateMetadata({
    searchParams: Promise.resolve({ event: id, tier }),
  });
}

export default async function EventTierTicketPage(props: {
  params: Promise<{ id: string; tier: string }>;
}) {
  const { id, tier } = await props.params;
  return RootPage({
    searchParams: Promise.resolve({ event: id, tier }),
  });
}
