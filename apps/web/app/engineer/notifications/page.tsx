"use client";

import type { NotificationFilter } from "@civicos/shared";
import { NotificationCenter } from "../../_components/notification-center";
import { queryPage, useEngineerQuery } from "../_lib/navigation";
import { apiFetch } from "../_lib/api";

export default function EngineerNotificationsPage() {
  const { params, update } = useEngineerQuery();
  const requested = params.get("category");
  const filter = ["dependencies", "assignments", "conflicts", "completion", "grievances"].includes(requested ?? "") ? requested as NotificationFilter : "all";
  return <NotificationCenter apiFetch={apiFetch} role="ENGINEER" showFilters variant="portal-inline" navigation={{ filter, page: queryPage(params.get("page")), onFilter: (category) => update({ category: category === "all" ? undefined : category, page: undefined }), onPage: (page) => update({ page: String(page) }) }} />;
}
