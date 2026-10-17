"use client";
import { PageHeader } from "@/components/PageHeader";
import { ErrorBanner } from "@/components/ErrorBanner";
import { useContainers } from "@/lib/containers";
import { SupportInbox } from "./SupportInbox";
import "@/components/support/support.css";
export default function SupportPage() {
  const { selected, error } = useContainers();
  return (
    <>
      <PageHeader>Support</PageHeader>
      {error && <ErrorBanner message={error.message} />}
      {selected ? (
        <SupportInbox key={selected.id} teamId={selected.id} name={selected.name} />
      ) : (
        <p>Loading your workspace…</p>
      )}
    </>
  );
}
