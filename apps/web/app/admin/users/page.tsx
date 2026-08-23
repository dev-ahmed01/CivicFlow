"use client";

import { AdminResourcePage, type ResourceConfig } from "../_components/resource-page";
const config: ResourceConfig = { title: "Users", description: "Role and scope assignments. Password hashes and TOTP secrets are never returned to this panel.", endpoint: "/admin/users", collectionKey: "users", template: { role: "ENGINEER", email: "", phone: null, password: "change-this-password", agencyId: "00000000-0000-4000-8000-000000000000", wardId: null, mustResetPassword: true }, itemPath: (item) => `/admin/users/${item.id}`, prepare: (item) => { const prepared = { ...item }; for (const key of ["id", "createdAt", "phoneVerifiedAt", "totpEnabled"]) delete prepared[key]; return prepared; } };
export default function UsersPage() { return <AdminResourcePage config={config} />; }
