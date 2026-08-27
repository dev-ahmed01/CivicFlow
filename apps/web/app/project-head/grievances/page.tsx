"use client";

import { GrievanceCenter } from "../../_components/grievance-center";
import { apiFetch } from "../_lib/api";

export default function ProjectHeadGrievancesPage() {
  return <GrievanceCenter apiFetch={apiFetch} />;
}
