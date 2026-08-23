"use client";

import { AdminResourcePage, type ResourceConfig } from "../_components/resource-page";
const config: ResourceConfig = { title: "Agencies", description: "City delivery agencies used across routing, projects, dependencies, and analytics.", endpoint: "/admin/agencies", collectionKey: "agencies", template: { name: "", type: "CITY_AGENCY" }, itemPath: (item) => `/admin/agencies/${item.id}`, prepare: (item) => { const prepared = { ...item }; delete prepared.id; return prepared; } };
export default function AgenciesPage() { return <AdminResourcePage config={config} />; }
