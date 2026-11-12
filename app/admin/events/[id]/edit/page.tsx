import { notFound, redirect } from "next/navigation";
import { getEventById, fetchEventDetails, fetchActiveEvent } from "@/lib/supabase-db";
import { Metadata } from "next";
import EventEditClient from "./EventEditClient";

interface PageProps {
  params: Promise<{ id: string }>;
}

export async function generateMetadata(
  { params }: PageProps
): Promise<Metadata> {
  const { id } = await params;
  const numId = Number(id);
  if (!numId || numId <= 0) return {};
  const event = await getEventById(numId);
  if (!event) return {};
  return {
    title: `Edit Event: ${event.title}`,
  };
}

export default async function EditEventPage({ params }: PageProps) {
  const { id } = await params;
  const numId = Number(id);
  if (isNaN(numId) || numId <= 0) {
    const active = await fetchActiveEvent().catch(() => null);
    if (active?.id) {
      redirect(`/admin/events/${active.id}/edit`);
    }
    redirect("/admin/dashboard");
  }

  const event = await getEventById(numId);
  if (!event) notFound();

  const details = await fetchEventDetails();

  return <EventEditClient event={event} details={details} />;
}
