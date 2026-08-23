"use client";

import { AdminResourcePage, type ResourceConfig } from "../_components/resource-page";
const config: ResourceConfig = { title: "Wards", description: "Ward boundaries and optional verification-radius overrides stored in PostGIS.", endpoint: "/admin/wards", collectionKey: "wards", template: { name: "", boundary: { type: "Polygon", coordinates: [[[77.5, 12.9], [77.51, 12.9], [77.51, 12.91], [77.5, 12.91], [77.5, 12.9]]] }, verificationRadiusOverrideMeters: null }, itemPath: (item) => `/admin/wards/${item.id}`, prepare: (item) => { const prepared = { ...item }; delete prepared.id; return prepared; } };
export default function WardsPage() { return <AdminResourcePage config={config} />; }
