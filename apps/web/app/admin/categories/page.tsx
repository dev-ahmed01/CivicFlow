"use client";

import { AdminResourcePage, type ResourceConfig } from "../_components/resource-page";
const config: ResourceConfig = { title: "Categories", description: "Issue taxonomy, visual relevance prompt, and primary agency routing. Changes apply to the next uploaded photo or validated ticket without a restart.", endpoint: "/admin/categories", collectionKey: "categories", template: { name: "", relevancePrompt: "a clearly visible civic issue in a public place", primaryAgencyId: "00000000-0000-4000-8000-000000000000", adminEditable: true }, itemPath: (item) => `/admin/categories/${item.id}`, prepare: (item) => { const prepared = { ...item }; delete prepared.id; delete prepared.primaryAgency; return prepared; } };
export default function CategoriesPage() { return <AdminResourcePage config={config} />; }
