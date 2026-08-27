"use client";

import { GrievanceCenter } from "../../_components/grievance-center";
import { adminApiFetch } from "../_lib/api";

export default function AdminGrievancesPage() {
  return <GrievanceCenter apiFetch={adminApiFetch} />;
}
