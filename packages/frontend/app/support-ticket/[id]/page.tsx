import type { Metadata } from "next";
import { CustomerTicketAccess } from "./CustomerTicket";
import "@/components/support/support.css";
export const metadata: Metadata = {
  title: "Support ticket",
  robots: { index: false, follow: false },
};
export default async function CustomerTicketPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <main className="support support-public">
      <CustomerTicketAccess id={id} />
    </main>
  );
}
