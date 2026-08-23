"use client";

import { AdminResourcePage, type ResourceConfig } from "../_components/resource-page";
const config: ResourceConfig = { title: "System config", description: "Live validation caps, radii, thresholds, and explicit simulation assumptions.", endpoint: "/admin/config", collectionKey: "config", template: { key: "feature.setting", value: 1, description: "Explain what this live setting controls" }, itemPath: (item) => `/admin/config/${encodeURIComponent(String(item.key))}` };
export default function ConfigPage() { return <AdminResourcePage config={config} />; }
