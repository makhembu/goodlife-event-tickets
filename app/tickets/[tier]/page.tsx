import type { Metadata } from "next";
import RootPage, { generateMetadata as rootGenerateMetadata } from "@/app/page";

export const dynamic = "force-dynamic";

export async function generateMetadata(props: {
  params: Promise<{ tier: string }>;
}): Promise<Metadata> {
  const { tier } = await props.params;
  return rootGenerateMetadata({
    searchParams: Promise.resolve({ tier }),
  });
}

export default async function TierTicketPage(props: {
  params: Promise<{ tier: string }>;
}) {
  const { tier } = await props.params;
  return RootPage({
    searchParams: Promise.resolve({ tier }),
  });
}
