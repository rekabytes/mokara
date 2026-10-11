"use client";

import { useContainers } from "@/lib/containers";
import { PageHeader } from "@/components/PageHeader";
import { useAnalyticsData } from "./use-analytics-data";
import { DistributionCard } from "./DistributionCard";
import { TaskProgressCard } from "./TaskProgressCard";
import { KpiProgressCard } from "./KpiProgressCard";
import { ActivityCard } from "./ActivityCard";

export default function AnalyticsPage() {
  const { selected } = useContainers();
  const {
    data,
    loading,
    error,
    load,
    progress,
    progressLoading,
    progressError,
    loadProgress,
    kpiProgress,
    kpiLoading,
    kpiError,
    loadKpiProgress,
  } = useAnalyticsData(selected?.id ?? null);

  return (
    <div>
      <PageHeader>Analytics</PageHeader>
      <DistributionCard data={data} />
      <TaskProgressCard
        progress={progress}
        progressLoading={progressLoading}
        progressError={progressError}
        loadProgress={loadProgress}
      />
      <KpiProgressCard
        kpiProgress={kpiProgress}
        kpiLoading={kpiLoading}
        kpiError={kpiError}
        loadKpiProgress={loadKpiProgress}
      />
      <ActivityCard data={data} loading={loading} error={error} load={load} />
    </div>
  );
}
