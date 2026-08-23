"use client";

import { useCallback, useEffect, useState } from "react";
import { adminApiFetch } from "../_lib/api";

type Agency = { id: string; name: string };
type Category = { id: string; name: string; primaryAgency: Agency; routingRules: Array<{ dependencyAgency: Agency }> };

export default function RoutingRulesPage() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [agencies, setAgencies] = useState<Agency[]>([]);
  const [message, setMessage] = useState<string>();
  const [error, setError] = useState<string>();
  const load = useCallback(async () => {
    try {
      const [routing, agencyList] = await Promise.all([
        adminApiFetch<{ categories: Category[] }>("/admin/routing"),
        adminApiFetch<{ agencies: Agency[] }>("/admin/agencies"),
      ]);
      setCategories(routing.categories); setAgencies(agencyList.agencies);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Could not load routing matrix"); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const changePrimary = async (categoryId: string, primaryAgencyId: string) => {
    setError(undefined); setMessage(undefined);
    try {
      await adminApiFetch(`/admin/categories/${categoryId}/routing`, { method: "PATCH", body: JSON.stringify({ primaryAgencyId }) });
      setMessage("Primary route updated. The next validated ticket in this category will use it immediately."); await load();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Could not update route"); }
  };
  const toggleDependency = async (category: Category, agencyId: string) => {
    const current = category.routingRules.map((rule) => rule.dependencyAgency.id);
    const dependencyAgencyIds = current.includes(agencyId) ? current.filter((id) => id !== agencyId) : [...current, agencyId];
    setError(undefined); setMessage(undefined);
    try {
      await adminApiFetch(`/admin/categories/${category.id}/routing-rules`, { method: "PUT", body: JSON.stringify({ dependencyAgencyIds }) });
      setMessage("Dependency routing suggestions updated live."); await load();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Could not update dependency rules"); }
  };

  return <><header className="portal-heading"><div><p className="eyebrow">Part III §§7.2, 20</p><h1>Routing rules</h1><p>Primary routes drive the next validated ticket; dependency routes suggest coordinating agencies.</p></div></header>{error ? <p className="error" role="alert">{error}</p> : null}{message ? <p className="success" role="status">{message}</p> : null}<div className="routing-admin-list">{categories.map((category) => <section className="portal-panel routing-admin-card" key={category.id}><div><h2>{category.name}</h2><label>Primary ticket agency<select value={category.primaryAgency.id} onChange={(event) => void changePrimary(category.id, event.target.value)}>{agencies.map((agency) => <option value={agency.id} key={agency.id}>{agency.name}</option>)}</select></label></div><fieldset><legend>Dependency agency suggestions</legend>{agencies.filter((agency) => agency.id !== category.primaryAgency.id).map((agency) => <label key={agency.id}><input type="checkbox" checked={category.routingRules.some((rule) => rule.dependencyAgency.id === agency.id)} onChange={() => void toggleDependency(category, agency.id)} />{agency.name}</label>)}</fieldset></section>)}</div></>;
}
