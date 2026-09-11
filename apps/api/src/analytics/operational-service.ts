import { prisma } from "db";
import { compareInsight, insightsPeriods, isOpenDependencyState, isTerminalProjectState, operationalMetricKeys } from "@civicos/shared";
import type { AnalyticsFilter, InsightsPreset, OperationalAnalyticsReport, OperationalMetric, OperationalMetricKey, OperationalRecord } from "@civicos/shared";
import { readInsightsBenchmark } from "./validation";

const transitions = { orderBy: { createdAt: "asc" as const }, select: { toState: true, createdAt: true } };
const entries = { orderBy: { createdAt: "asc" as const }, select: { toStatus: true, createdAt: true } };
const agency = { select: { id: true, name: true } };
const completed = new Set(["COMPLETED", "AWAITING_VERIFICATION", "CLOSED"]);
const closed = new Set(["COMPLETED", "CLOSED"]);
const responses = new Set(["ASSIGNED", "DECLINED_UNAVAILABLE", "DECLINED_NOT_CONCERNED", "FULFILLED"]);
const openCoordination = new Set(["SENT", "ACKNOWLEDGED", "CLARIFICATION_REQUESTED", "INSPECTION_REQUIRED", "ENGINEER_ASSIGNED", "ACCEPTED", "IN_PROGRESS"]);
const round = (n: number) => Math.round(n * 10) / 10;
const hours = (a: Date, b: Date) => (b.getTime() - a.getTime()) / 3_600_000;

async function loadData(filter: AnalyticsFilter, end: Date) {
  // Part III §17.2: scope starts at authenticated agency ownership; no date-created cohort.
  const projects = await prisma.project.findMany({ where: {
    ...(filter.agencyId ? { agencyId: filter.agencyId } : {}),
    ...(filter.wardId ? { wardId: filter.wardId } : {}),
    ...(filter.categoryId ? { categoryId: filter.categoryId } : {}), createdAt: { lt: end },
  }, include: { agency, ward: agency, category: agency, stateTransitions: transitions,
    ticket: { select: { state: true, stateTransitions: transitions } },
  } });
  const ids = projects.map(p => p.id);
  const workflow = { select: { id: true, status: true, createdAt: true, sentAt: true, closedAt: true, entries } };
  const peer = { select: { id: true, actualStart: true, state: true, stateTransitions: transitions } };
  const [conflicts, roadConflicts, dependencies, coordination, evidence, recommendations, config] = await Promise.all([
    // Generic logs canonicalize project pairs. Include either side without returning peer private details.
    prisma.conflictLog.findMany({ where: { OR: [{ projectId: { in: ids } }, { conflictingProjectId: { in: ids } }], createdAt: { lt: end } }, include: { project: peer, conflictingProject: peer, projectAgency: agency, conflictingAgency: agency, coordinationRequests: workflow } }),
    prisma.roadConflictLog.findMany({ where: { projectId: { in: ids }, createdAt: { lt: end } }, include: { conflictingProject: peer, projectAgency: agency, conflictingAgency: agency, coordinationRequests: workflow, project: { select: { intervention: true } }, segment: { select: { roadName: true } } } }),
    prisma.dependency.findMany({ where: { projectId: { in: ids }, createdAt: { lt: end } }, include: { requestingAgency: agency, respondingAgency: agency, stateTransitions: transitions } }),
    prisma.coordinationRequest.findMany({ where: { projectId: { in: ids }, createdAt: { lt: end } }, include: { requestingAgency: agency, respondingAgency: agency, entries } }),
    prisma.completionEvidence.findMany({ where: { projectId: { in: ids }, uploadedAt: { not: null, lt: end } }, orderBy: [{ uploadedAt: "asc" }, { id: "asc" }], include: { verifications: { orderBy: { createdAt: "asc" } } } }),
    prisma.sequencingRecommendation.findMany({ where: { OR: ids.map(id => ({ projectIds: { array_contains: [id] } })), createdAt: { lt: end } }, include: { logs: { where: { actedAt: { lt: end } }, orderBy: [{ actedAt: "asc" }, { id: "asc" }] } } }),
    prisma.systemConfig.findUnique({ where: { key: "analytics.limited_sample_threshold" }, select: { value: true } }),
  ]);
  return { projects, conflicts, roadConflicts, dependencies, coordination, evidence, recommendations, config };
}
type Data = Awaited<ReturnType<typeof loadData>>;
type Project = Data["projects"][number];
type Period = { from: string; to: string };
type RawMetric = Omit<OperationalMetric, "previous" | "comparison">;
function stateAt(history: Array<{ toState: string; createdAt: Date }>, end: Date, fallback: string) {
  return history.filter(t => t.createdAt < end).at(-1)?.toState ?? fallback;
}
function coordinationState(request: { entries: Array<{ toStatus: string | null; createdAt: Date }>; sentAt: Date | null; closedAt: Date | null }, end: Date) {
  return request.entries.filter(e => e.toStatus && e.createdAt < end).at(-1)?.toStatus
    ?? (request.closedAt && request.closedAt < end ? "CLOSED" : request.sentAt && request.sentAt < end ? "SENT" : "DRAFT");
}
function baseRecord(p: Project): OperationalRecord {
  return { id: p.id, projectId: p.id, recordType: "work", reference: p.referenceNumber, title: p.title, status: p.state, agency: p.agency.name, ward: p.ward?.name, category: p.category?.name, occurredAt: p.createdAt.toISOString() };
}

function aggregate(data: Data, period: Period, now: Date, threshold: number, subset = data.projects) {
  const end = new Date(Math.min(Date.parse(period.to), now.getTime() + 1));
  const start = new Date(period.from);
  const inPeriod = (d: Date | null | undefined): d is Date => !!d && d >= start && d < end;
  const exists = (d: Date | null | undefined): d is Date => !!d && d < end;
  const projects = subset.filter(p => p.createdAt < end);
  const byId = new Map(projects.map(p => [p.id, p]));
  const projectState = (p: Project) => stateAt(p.stateTransitions, end, end > now ? p.state : "UNKNOWN");
  const details = Object.fromEntries(operationalMetricKeys.map(key => [key, []])) as unknown as Record<OperationalMetricKey, OperationalRecord[]>;
  const metrics: RawMetric[] = [];
  function metric(key: OperationalMetricKey, label: string, unit: OperationalMetric["unit"], direction: OperationalMetric["direction"], description: string, rows: OperationalRecord[]) {
    details[key] = rows;
    const numerator = rows.filter(r => r.included).length;
    const value = unit === "percent" ? (rows.length ? round(numerator / rows.length * 100) : null)
      : unit === "hours" ? (rows.length ? round(rows.reduce((sum, r) => sum + r.durationHours!, 0) / rows.length) : null)
      : unit === "meters" ? round(rows.reduce((sum, r) => sum + r.lengthMeters!, 0)) : rows.length;
    metrics.push({ key, label, value, unit, direction, description, limitedSample: rows.length > 0 && rows.length < threshold,
      ...(unit === "percent" ? { numerator, denominator: rows.length } : { sampleSize: rows.length }) });
  }
  const executionStart = (p: { actualStart: Date | null; stateTransitions: Array<{ toState: string; createdAt: Date }> }) => {
    const times = [p.actualStart, ...p.stateTransitions.filter(t => t.toState === "ACTIVE").map(t => t.createdAt)].filter((d): d is Date => !!d);
    return times.length ? new Date(Math.min(...times.map(d => d.getTime()))) : undefined;
  };
  const conflictRows: OperationalRecord[] = [];
  for (const c of [...data.conflicts, ...data.roadConflicts]) {
    if (!inPeriod(c.createdAt)) continue;
    const p = byId.get(c.projectId) ?? ("timelineFingerprint" in c ? byId.get(c.conflictingProjectId!) : undefined);
    if (!p) continue;
    const other = "timelineFingerprint" in c ? (p.id === c.projectId ? c.conflictingProject : c.project) : c.conflictingProject;
    const ownStart = executionStart(p), otherStart = other ? executionStart(other) : undefined;
    const starts = [ownStart, otherStart].filter((d): d is Date => !!d);
    const firstStart = starts.length ? new Date(Math.min(...starts.map(d => d.getTime()))) : undefined;
    const preStates = new Set(["CREATED", "PENDING_UPTAKE", "UPTAKEN", "TIMELINE_SET", "CONFLICT_CHECKED", "READY_TO_START"]);
    const before = firstStart ? c.createdAt < firstStart : preStates.has(projectState(p)) && (!other || preStates.has(stateAt(other.stateTransitions, end, end > now ? other.state : "UNKNOWN")));
    const statuses = c.coordinationRequests.map(r => coordinationState(r, end));
    conflictRows.push({ ...baseRecord(p), id: c.id, reference: c.id, recordType: "type" in c ? "road-conflict" : "conflict", occurredAt: c.createdAt.toISOString(), executionStart: firstStart?.toISOString(),
      counterpartAgency: p.agency.id === c.projectAgencyId ? c.conflictingAgency?.name : c.projectAgency.name,
      status: statuses.some(s => closed.has(s)) ? "RESOLVED" : "UNRESOLVED", coordinationStatus: statuses.join(", ") || "No linked coordination", included: before,
      detail: `${"type" in c ? c.type : c.severity}. ${before ? "Detected before execution" : firstStart ? "Detected at or after execution began" : "Execution timing not established"}.`, evidenceIds: c.coordinationRequests.map(r => r.id) });
  }
  metric("conflicts-before-execution", "Pre-execution detection rate", "percent", "higher", "Conflicts detected strictly before either related work began / all conflicts detected in the period. Missing start histories are not assumed successful.", conflictRows);
  metric("conflicts-resolved", "Conflict resolution rate", "percent", "higher", "Conflicts detected in the period with linked coordination COMPLETED or CLOSED by period end / all conflicts detected in the period.", conflictRows.map(r => ({ ...r, included: r.status === "RESOLVED" })));

  const dependencyRows = data.dependencies.flatMap(d => {
    const p = byId.get(d.projectId); if (!p || !inPeriod(d.createdAt)) return [];
    const first = d.stateTransitions.find(t => responses.has(t.toState))?.createdAt ?? d.respondedAt;
    if (!exists(first) || first < d.createdAt) return [];
    return [{ ...baseRecord(p), id: d.id, reference: d.id, recordType: "dependency" as const, status: stateAt(d.stateTransitions, end, "REQUESTED"), agency: d.requestingAgency.name, counterpartAgency: d.respondingAgency.name, occurredAt: d.createdAt.toISOString(), responseAt: first.toISOString(), durationHours: hours(d.createdAt, first), detail: d.requirement }];
  });
  metric("dependency-response-time", "Average dependency response", "hours", "lower", "Mean hours from dependency creation in the period to first ASSIGNED, DECLINED_UNAVAILABLE, DECLINED_NOT_CONCERNED or FULFILLED response by period end. Unanswered requests excluded.", dependencyRows);
  const blocked = projects.flatMap(p => {
    if (projectState(p) === "UNKNOWN" || isTerminalProjectState(projectState(p))) return [];
    const blockers = data.dependencies.filter(d => d.projectId === p.id && d.createdAt < end && d.requestingAgencyId !== d.respondingAgencyId && isOpenDependencyState(stateAt(d.stateTransitions, end, "REQUESTED")));
    return blockers.length ? [{ ...baseRecord(p), status: "BLOCKED", evidenceIds: blockers.map(d => d.id), counterpartAgency: [...new Set(blockers.map(d => d.respondingAgency.name))].join(", ") }] : [];
  });
  metric("works-blocked", "Works blocked by another agency", "count", "context", "Period-end snapshot of non-terminal works with open inter-agency dependencies. Historical works without state history are excluded. Compare absolute counts, considering workload.", blocked);
  const coordination = data.coordination.filter(r => byId.has(r.projectId) && exists(r.sentAt));
  const coordinationRow = (r: Data["coordination"][number]): OperationalRecord => ({ ...baseRecord(byId.get(r.projectId)!), id: r.id, reference: r.id, recordType: "coordination", title: r.subject, status: coordinationState(r, end), agency: r.requestingAgency.name, counterpartAgency: r.respondingAgency.name, occurredAt: r.sentAt!.toISOString(), responseAt: r.closedAt?.toISOString(), deadline: r.responseDeadline.toISOString() });
  metric("coordination-turnaround", "Coordination turnaround", "hours", "lower", "Mean closedAt − sentAt for requests closed in the period with both valid timestamps.", coordination.filter(r => inPeriod(r.closedAt) && r.closedAt >= r.sentAt!).map(r => ({ ...coordinationRow(r), durationHours: hours(r.sentAt!, r.closedAt!) })));
  metric("overdue-coordination", "Overdue coordination requests", "count", "context", "Period-end snapshot: open sent coordination requests with responseDeadline before the snapshot time. Raw count change is not efficiency.", coordination.filter(r => openCoordination.has(coordinationState(r, end)) && r.responseDeadline < end).map(coordinationRow));
  const coordinated = new Set(coordination.filter(r => inPeriod(r.sentAt) || inPeriod(r.closedAt) || r.entries.some(e => inPeriod(e.createdAt))).map(r => r.projectId));
  metric("works-coordinated", "Works coordinated", "count", "context", "Distinct works with a coordination request sent, closed or updated in the period.", projects.filter(p => coordinated.has(p.id)).map(baseRecord));

  const firstByProject = new Map<string, Data["evidence"][number]>();
  for (const e of [...data.evidence].sort((a, b) => a.uploadedAt!.getTime() - b.uploadedAt!.getTime() || a.id.localeCompare(b.id))) {
    if (exists(e.uploadedAt) && byId.has(e.projectId) && !firstByProject.has(e.projectId)) firstByProject.set(e.projectId, e);
  }
  const firstRows = [...firstByProject.values()].flatMap(e => {
    const v = e.verifications.filter(v => exists(v.createdAt));
    if (!v.length || !inPeriod(v[0]!.createdAt)) return [];
    const rework = v.some(v => v.decision === "REWORK_REQUESTED"), verified = v.some(v => v.decision === "VERIFIED");
    return [{ ...baseRecord(byId.get(e.projectId)!), id: e.id, reference: e.id, recordType: "completion" as const, status: rework ? "REWORK_REQUESTED" : "VERIFIED", occurredAt: v[0]!.createdAt.toISOString(), uploadedAt: e.uploadedAt!.toISOString(), evidenceIds: [e.id, ...v.map(v => v.id)], detail: v.map(v => `${v.decision} at ${v.createdAt.toISOString()}`).join("; "), included: verified && !rework }];
  });
  metric("first-time-completion", "First-time completion rate", "percent", "higher", "First uploaded attempts first assessed in the period with VERIFIED and no REWORK_REQUESTED by period end / all first attempts first assessed in the period.", firstRows);
  metric("rework-rate", "First-attempt rework rate", "percent", "lower", "First attempts assessed in the period with REWORK_REQUESTED / all first attempts assessed in the period.", firstRows.map(r => ({ ...r, included: r.status === "REWORK_REQUESTED" })));
  const evidenceFor = (p: Project) => data.evidence.filter(e => e.projectId === p.id && exists(e.uploadedAt));
  const closures = projects.flatMap(p => {
    if (!p.ticket) return [];
    const history = p.ticket.stateTransitions.filter(t => exists(t.createdAt));
    if (!["CLOSED", "RESOLVED"].includes(history.at(-1)?.toState ?? "")) return [];
    // Consecutive RESOLVED → CLOSED is one closure episode, not two completions.
    let i = history.length - 1;
    while (i > 0 && ["CLOSED", "RESOLVED"].includes(history[i - 1]!.toState)) i--;
    if (!inPeriod(history[i]?.createdAt)) return [];
    const ev = evidenceFor(p), verified = ev.some(e => e.verifications.some(v => exists(v.createdAt) && v.decision === "VERIFIED"));
    return [{ ...baseRecord(p), status: verified ? "VERIFIED_CLOSURE" : "UNVERIFIED_CLOSURE", occurredAt: history[i]!.createdAt.toISOString(), included: verified, evidenceIds: ev.map(e => e.id) }];
  });
  metric("verified-closure", "Verified closure rate", "percent", "higher", "Ticket-backed works entering a resolved/closed episode in the period with uploaded VERIFIED completion by period end / all such closures still resolved/closed at period end.", closures);
  const completions = projects.flatMap(p => {
    if (!p.ticket || !completed.has(projectState(p))) return [];
    const finished = p.stateTransitions.find(t => completed.has(t.toState))?.createdAt ?? p.actualCompletion;
    if (!inPeriod(finished)) return [];
    const ev = evidenceFor(p).map(e => e.id);
    const evidenceIds = ev;
    return [{ ...baseRecord(p), occurredAt: finished.toISOString(), included: evidenceIds.length > 0, evidenceIds }];
  });
  metric("evidence-backed-completion", "Evidence-backed completion rate", "percent", "higher", "Ticket-backed works completed in the period with uploaded CompletionEvidence / all ticket-backed completions in the period. Planned works are excluded: their workflow has no required completion-evidence type.", completions);

  const risks = data.roadConflicts.filter(c => byId.has(c.projectId) && inPeriod(c.createdAt) && ["REPEATED_EXCAVATION_RISK", "DUPLICATE_INTERVENTION"].includes(c.type));
  const accepted = data.recommendations.flatMap(r => {
    const log = r.logs.filter(l => exists(l.actedAt)).at(-1);
    return log?.outcome === "ACCEPTED" ? [{ recommendation: r, log }] : [];
  });
  const matching = (risk: Data["roadConflicts"][number]) => accepted.filter(({ recommendation: r, log }) => r.segmentId === risk.segmentId && Array.isArray(r.projectIds) && r.projectIds.includes(risk.projectId) && (!risk.conflictingProjectId || r.projectIds.includes(risk.conflictingProjectId)) && log.actedAt >= risk.createdAt);
  const riskRows = risks.map(r => ({ ...baseRecord(byId.get(r.projectId)!), id: r.id, reference: r.id, recordType: "road-conflict" as const, status: r.type, occurredAt: r.createdAt.toISOString(), detail: `${r.segment.roadName}: ${r.reason}`, evidenceIds: matching(r).map(m => m.log.id) }));
  metric("repeated-excavation", "Repeat-excavation risks detected", "count", "context", "Repeated-excavation and duplicate-intervention advisories recorded in the period.", riskRows);
  metric("risks-addressed", "Repeat-excavation risks addressed", "count", "context", "Period risks linked by segment and all involved project IDs to a recommendation whose latest outcome by period end is ACCEPTED after detection. This does not prove physical avoidance.", riskRows.filter(r => r.evidenceIds.length));
  const interventions = new Map<string, OperationalRecord>();
  for (const r of risks.filter(r => matching(r).length)) {
    const i = r.project.intervention;
    if (i && Number.isFinite(i.affectedLengthM) && i.affectedLengthM >= 0) interventions.set(i.id, { ...baseRecord(byId.get(r.projectId)!), id: i.id, reference: i.id, recordType: "intervention", status: "COORDINATED_RISK", lengthMeters: i.affectedLengthM, evidenceIds: matching(r).map(m => m.log.id) });
  }
  metric("coordinated-road-length", "Road length associated with coordinated risk", "meters", "context", "Sum of affectedLengthM for distinct owned interventions with addressed period risks; each intervention counted once. Overlapping physical spans may remain.", [...interventions.values()]);
  const acceptedRows = accepted.filter(({ log, recommendation: r }) => inPeriod(log.actedAt) && Array.isArray(r.projectIds) && r.projectIds.some(id => typeof id === "string" && byId.has(id))).map(({ recommendation: r, log }) => {
    const p = projects.find(p => Array.isArray(r.projectIds) && r.projectIds.includes(p.id))!;
    return { ...baseRecord(p), id: r.id, reference: r.id, recordType: "sequencing" as const, status: log.outcome, occurredAt: log.actedAt.toISOString(), evidenceIds: [log.id], detail: "Latest recorded recommendation outcome at period end is ACCEPTED." };
  });
  metric("sequencing-accepted", "Accepted sequencing recommendations", "count", "context", "Distinct scoped recommendations with latest outcome ACCEPTED in the period; repeated acceptance logs do not multiply the count.", acceptedRows);
  return { metrics, details };
}

export async function buildOperationalAnalytics(filter: AnalyticsFilter, now = new Date(), preset: InsightsPreset = filter.from || filter.to ? "custom" : "last7"): Promise<OperationalAnalyticsReport> {
  const periods = insightsPeriods(preset, now, filter.from?.toISOString().slice(0, 10), filter.to?.toISOString().slice(0, 10));
  const data = await loadData(filter, new Date(Math.min(Date.parse(periods.current.to), now.getTime() + 1)));
  const config = Number(data.config?.value);
  const threshold = Number.isInteger(config) && config > 0 ? config : 5;
  const compare = (current: RawMetric[], previous: RawMetric[]): OperationalMetric[] => current.map(m => {
    const p = previous.find(p => p.key === m.key)!;
    return { ...m, previous: { value: p.value, numerator: p.numerator, denominator: p.denominator, sampleSize: p.sampleSize }, comparison: compareInsight(m.value, p.value, m.direction, m.unit) };
  });
  const current = aggregate(data, periods.current, now, threshold), previous = aggregate(data, periods.previous, now, threshold);
  const dimensions: OperationalAnalyticsReport["dimensions"] = [];
  for (const kind of ["ward", "category"] as const) {
    const groups = new Map(data.projects.flatMap(p => p[kind] ? [[p[kind]!.id, p[kind]!.name] as const] : []));
    for (const [id, name] of groups) {
      const subset = data.projects.filter(p => p[kind]?.id === id);
      dimensions.push({ kind, id, name, metrics: compare(aggregate(data, periods.current, now, threshold, subset).metrics, aggregate(data, periods.previous, now, threshold, subset).metrics) });
    }
  }
  const trend: OperationalAnalyticsReport["trend"] = [];
  const days = (Date.parse(periods.current.to) - Date.parse(periods.current.from)) / 86_400_000;
  let cursor = Date.parse(periods.current.from);
  while (cursor < Math.min(Date.parse(periods.current.to), now.getTime())) {
    const local = new Date(cursor + 19_800_000);
    const next = days > 120 ? Date.UTC(local.getUTCFullYear(), local.getUTCMonth() + 1, 1) - 19_800_000 : cursor + (days > 31 ? 7 : 1) * 86_400_000;
    const period = { from: new Date(cursor).toISOString(), to: new Date(Math.min(next, Date.parse(periods.current.to))).toISOString() };
    const values = aggregate(data, period, now, threshold).metrics;
    trend.push({ ...period, metrics: compare(values, values) });
    cursor = next;
  }
  return { generatedAt: now.toISOString(), filters: { agencyId: filter.agencyId, wardId: filter.wardId, categoryId: filter.categoryId }, periods, sampleThreshold: threshold,
    containsDemoRecords: data.projects.some(p => p.title.startsWith("[Insights demo]")), metrics: compare(current.metrics, previous.metrics), details: current.details, previousDetails: previous.details, dimensions, trend,
    options: { wards: [...new Map(data.projects.flatMap(p => p.ward ? [[p.ward.id, p.ward] as const] : [])).values()], categories: [...new Map(data.projects.flatMap(p => p.category ? [[p.category.id, p.category] as const] : [])).values()] },
    validation: await readInsightsBenchmark(), notes: [
      "Civil dates use Asia/Kolkata. Period ends are exclusive; current results stop at the generated time. Incomplete calendar periods are compared with the complete previous calendar period.",
      "Conflicts use detection cohorts; dependencies use creation cohorts; first attempts use first assessment; turnaround uses closure dates; blocked/overdue counts are period-end snapshots. Outcomes after each cutoff are excluded.",
      "Historical snapshots require recorded state transitions. Missing execution history is not credited as pre-execution detection; missing closure/completion dates cannot enter dated rates. Current ownership, ward and work type are used; historical reassignment is not reconstructed.",
      "A completion attempt is one uploaded CompletionEvidence record. Road length sums distinct interventions, not unique physical road spans. Accepted sequencing demonstrates coordination, not excavation avoidance.",
    ] };
}
