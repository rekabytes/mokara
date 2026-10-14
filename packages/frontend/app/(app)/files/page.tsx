"use client";
import { useContainers } from "@/lib/containers";
import { PageHeader } from "@/components/PageHeader";
import { ErrorBanner } from "@/components/ErrorBanner";
import { FilesWorkspace } from "./FilesWorkspace";
import "./files.css";
export default function FilesPage() {
  const { selected, error } = useContainers();
  return (
    <>
      <PageHeader>mDrive</PageHeader>
      {error && <ErrorBanner message={error.message} />}
      {selected ? (
        <FilesWorkspace key={selected.id} teamId={selected.id} name={selected.name} />
      ) : (
        <p className="files-loading">Loading your workspace…</p>
      )}
    </>
  );
}
