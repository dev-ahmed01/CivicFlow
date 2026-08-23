"use client";

import { AdminResourcePage, type ResourceConfig } from "../_components/resource-page";
const config: ResourceConfig = { title: "Categories", description: "Issue taxonomy and primary agency routing. Updating primaryAgencyId changes routing for the next validated ticket without a restart.", endpoint: "/admin/categories", collectionKey: "categories", template: { name: "", primaryAgencyId: "00000000-0000-4000-8000-000000000000", adminEditable: true }, itemPath: (item) => `/admin/categories/${item.id}`, prepare: (item) => { const prepared = { ...item }; delete prepared.id; delete prepared.primaryAgency; return prepared; } };
export default function CategoriesPage() { return <AdminResourcePage config={config} />; }
