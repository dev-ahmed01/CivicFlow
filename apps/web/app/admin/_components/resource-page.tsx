"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { adminApiFetch } from "../_lib/api";

type ResourceConfig = {
  title: string;
  description: string;
  endpoint: string;
  collectionKey: string;
  template: Record<string, unknown>;
  itemPath: (item: Record<string, unknown>) => string;
  prepare?: (item: Record<string, unknown>) => Record<string, unknown>;
};

function displayValue(value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

export function AdminResourcePage({ config }: { config: ResourceConfig }) {
  const [items, setItems] = useState<Record<string, unknown>[]>([]);
  const [editing, setEditing] = useState<Record<string, unknown>>();
  const [json, setJson] = useState(() => JSON.stringify(config.template, null, 2));
  const [error, setError] = useState<string>();
  const [message, setMessage] = useState<string>();
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    try {
      const result = await adminApiFetch<Record<string, Record<string, unknown>[]>>(config.endpoint);
      setItems(result[config.collectionKey] ?? []);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Could not load records"); }
  }, [config.collectionKey, config.endpoint]);
  useEffect(() => { void load(); }, [load]);
  const columns = useMemo(() => [...new Set(items.flatMap((item) => Object.keys(item)))].filter((key) => !["boundary", "createdAt", "phoneVerifiedAt"].includes(key)).slice(0, 7), [items]);

  const reset = () => { setEditing(undefined); setJson(JSON.stringify(config.template, null, 2)); };
  const startEdit = (item: Record<string, unknown>) => {
    setEditing(item);
    setJson(JSON.stringify(config.prepare ? config.prepare(item) : item, null, 2));
    setMessage(undefined); setError(undefined);
  };
  const submit = async (event: FormEvent) => {
    event.preventDefault(); setBusy(true); setError(undefined); setMessage(undefined);
    try {
      const body = JSON.parse(json) as Record<string, unknown>;
      await adminApiFetch(editing ? config.itemPath(editing) : config.endpoint, { method: editing ? "PUT" : "POST", body: JSON.stringify(body) });
      setMessage(editing ? "Record updated. New workflow checks will use it immediately." : "Record created."); reset(); await load();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Could not save record"); }
    finally { setBusy(false); }
  };
  const remove = async (item: Record<string, unknown>) => {
    if (!window.confirm("Delete this record? Referenced workflow records will be protected by the server.")) return;
    setError(undefined); setMessage(undefined);
    try { await adminApiFetch(config.itemPath(item), { method: "DELETE" }); setMessage("Record deleted."); await load(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Could not delete record"); }
  };

  return <>
    <header className="portal-heading"><div><p className="eyebrow">Part III §20</p><h1>{config.title}</h1><p>{config.description}</p></div></header>
    {error ? <p className="error" role="alert">{error}</p> : null}{message ? <p className="success" role="status">{message}</p> : null}
    <section className="admin-resource-grid"><div className="table-card"><table><thead><tr>{columns.map((column) => <th key={column}>{column.replace(/([A-Z])/g, " $1")}</th>)}<th>Actions</th></tr></thead><tbody>{items.map((item, index) => <tr key={String(item.id ?? item.key ?? index)}>{columns.map((column) => <td key={column} title={displayValue(item[column])}>{displayValue(item[column]).slice(0, 70)}</td>)}<td><div className="row-actions"><button type="button" onClick={() => startEdit(item)}>Edit</button><button className="danger" type="button" onClick={() => void remove(item)}>Delete</button></div></td></tr>)}</tbody></table>{items.length === 0 ? <p className="empty-state">No records found.</p> : null}</div>
      <form className="portal-panel json-editor" onSubmit={(event) => void submit(event)}><div><p className="eyebrow">{editing ? "Edit record" : "New record"}</p><h2>{editing ? "Update configuration" : `Add ${config.title.toLowerCase().replace(/s$/, "")}`}</h2></div><label>JSON fields<textarea spellCheck={false} value={json} onChange={(event) => setJson(event.target.value)} /></label><small>IDs reference the live records used by ticket routing and validation. Values are validated by the API.</small><div><button disabled={busy} type="submit">{busy ? "Saving…" : editing ? "Save changes" : "Create"}</button>{editing ? <button className="secondary" type="button" onClick={reset}>Cancel</button> : null}</div></form>
    </section>
  </>;
}

export type { ResourceConfig };
