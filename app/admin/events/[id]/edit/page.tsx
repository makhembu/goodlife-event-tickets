import { notFound } from "next/navigation";
import { getEventById, fetchEventDetails } from "@/lib/supabase-db";
import { Metadata } from "next";
import EventEditClient from "./EventEditClient";

interface PageProps {
  params: Promise<{ id: string }>;
}

export async function generateMetadata(
  { params }: PageProps
): Promise<Metadata> {
  const { id } = await params;
  const event = await getEventById(Number(id));
  if (!event) return {};
  return {
    title: `Edit Event: ${event.title}`,
  };
}

export default async function EditEventPage({ params }: PageProps) {
  const { id } = await params;
  const event = await getEventById(Number(id));
  if (!event) notFound();

  const details = await fetchEventDetails();

  return <EventEditClient event={event} details={details} />;
}
