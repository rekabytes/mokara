import type { Metadata } from "next";
import { getSupportConfiguration } from "@/lib/support.server";
import { TicketForm } from "./TicketForm";
import "@/components/support/support.css";
export const metadata: Metadata = {
  title: "Submit a support ticket",
  robots: { index: false, follow: false },
};
export default async function TicketFormPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const config = await getSupportConfiguration(id);
  return (
    <main className="support support-public">
      {config ? (
        <TicketForm config={config} />
      ) : (
        <div className="support-card">
          <h1>Ticket form unavailable</h1>
          <p>Please contact the business directly or try again later.</p>
        </div>
      )}
    </main>
  );
}
