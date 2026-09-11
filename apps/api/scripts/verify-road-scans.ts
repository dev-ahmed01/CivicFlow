import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { prisma } from "db";
import { roadScanSchema, potholeCandidateDetailSchema } from "@civicos/shared";

const base = process.env.SCAN_ACCEPTANCE_URL ?? "http://localhost:4407";
if (!["localhost", "127.0.0.1"].includes(new URL(base).hostname)) throw new Error("Local acceptance API required");
let checks = 0;
async function api(path: string, token: string, body?: unknown, method = body ? "POST" : "GET", expected = 200) {
  const response = await fetch(base + path, { method, headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
  const result = await response.json();
  assert.equal(response.status, expected, `${method} ${path}: ${JSON.stringify(result)}`); checks++;
  return result;
}
async function login(email: string) { return (await api("/auth/internal/login", "", { email, password: process.env.DEMO_INTERNAL_PASSWORD ?? "CivicOS@123" })).accessToken as string; }
async function main() {
  const head = await login("head.pwd@civicos.local"), engineer = await login("engineer.pwd@civicos.local"), other = await login("head.bwssb@civicos.local");
  const options = await api("/project-head/road-scans/options", head);
  const wardId = options.wards[0].id as string;
  await api("/project-head/road-scans", engineer, { type: "AREA", wardId }, "POST", 403);
  await api("/project-head/road-scans", other, { type: "AREA", wardId }, "POST", 403);
  await api("/project-head/road-scans", head, { type: "AREA", wardId: "10000000-0000-4000-8000-000000000001" }, "POST", 403);
  const scanId = (await api("/project-head/road-scans", head, { type: "AREA", wardId }, "POST", 201)).scan.id as string;
  await api(`/project-head/road-scans/${scanId}`, other, undefined, "GET", 404);
  const scan = roadScanSchema.parse((await api(`/project-head/road-scans/${scanId}/process`, head, {}, "POST")).scan);
  assert.equal(scan.status, "PARTIAL"); assert.equal(scan.camerasRequested, 8); assert.equal(scan.camerasProcessed, 8); assert.equal(scan.unusableCameras, 1); assert.ok(scan.rawDetections > scan.uniqueCandidates); checks += 5;
  const candidate = scan.candidates.find(item => item.status === "NEW" && item.camera.code === "DEMO-CAM-08") ?? scan.candidates.find(item => item.status === "NEW" && ["DEMO-CAM-01", "DEMO-CAM-02"].includes(item.camera.code));
  assert.ok(candidate, "A fresh clear-after demo candidate is required; previously reviewed candidates are preserved");
  const detail = potholeCandidateDetailSchema.parse((await api(`/project-head/pothole-candidates/${candidate.id}`, head)).candidate);
  assert.equal(detail.evidence.model.runtimeMode, "DEMO"); assert.ok(detail.observations.length >= 3); checks += 2;
  const deadline = new Date(Date.now() + 86400000).toISOString();
  const assigned = await api(`/project-head/pothole-candidates/${candidate.id}/assign-inspection`, head, { engineerId: "40000000-0000-4000-8000-000000000201", deadline }, "POST", 201);
  await api(`/project-head/pothole-candidates/${candidate.id}/assign-inspection`, head, { engineerId: "40000000-0000-4000-8000-000000000201", deadline }, "POST", 409);
  const inspectionId = assigned.inspectionId as string, ticketId = assigned.ticketId as string;
  assert.equal((await api(`/inspections/${inspectionId}`, engineer)).inspection.source, "AREA_SCAN"); checks++;
  await api(`/inspections/${inspectionId}/accept`, engineer, {}, "POST");
  await api(`/inspections/${inspectionId}/start`, engineer, {}, "POST");
  const bytes = new Uint8Array(readFileSync(resolve(process.cwd(), "../../packages/db/demo/road-scans/real_sample_02.jpg")));
  async function upload(path: string, notes?: string) {
    const target = await api(path, engineer, { action: "presign", fileName: "road-demo.jpg", contentType: "image/jpeg", sizeBytes: bytes.length, ...(notes ? { notes } : {}) }, "POST", 201);
    const put = await fetch(target.upload.uploadUrl, { method: "PUT", headers: target.upload.headers, body: bytes }); assert.equal(put.status, 200); checks++;
    await api(path, engineer, { action: "complete", evidenceId: target.evidenceId }, "POST"); return target.evidenceId as string;
  }
  await upload(`/inspections/${inspectionId}/evidence`);
  await api(`/inspections/${inspectionId}/submit`, engineer, { issueConfirmation: "CONFIRMED", severity: "MEDIUM", observations: "Demo field inspection confirms surface damage at the configured camera anchor.", recommendedWork: "Repair damaged asphalt and restore the road surface after coordination.", complexity: "LOW", coordinationRequired: false, recommendation: "PROCEED", latitude: candidate.camera.latitude, longitude: candidate.camera.longitude });
  await api(`/inspections/${inspectionId}/review`, head, { decision: "CREATE_WORK", note: "Reviewed field evidence; proceed with the scoped surface repair." });
  const plannedStart = new Date(Date.now() - 60000).toISOString(), plannedEnd = new Date(Date.now() + 86400000).toISOString();
  const created = await api("/projects", head, { ticketId, engineerId: "40000000-0000-4000-8000-000000000201", intervention: { segmentId: candidate.camera.roadSegmentId, purpose: "resurfacing", plannedStart, plannedEnd, affectedLengthM: 5, startOffsetM: 0, dependencyRefs: [] } }, "POST", 201);
  const projectId = created.project.id as string;
  assert.equal(created.project.origin, "SYSTEM_INTEGRATION"); checks++;
  await api(`/project-head/pothole-candidates/${candidate.id}/verification`, head, {}, "POST", 409);
  await api(`/projects/${projectId}/uptake`, engineer, {}, "POST");
  await api(`/projects/${projectId}/timeline`, engineer, { plannedStart, plannedEnd, workDescription: "Complete the reviewed asphalt repair and document field evidence.", dependencyFlags: [] }, "PATCH");
  await api(`/projects/${projectId}/start`, engineer, {}, "POST");
  await api(`/projects/${projectId}/status`, engineer, { state: "COMPLETED", note: "Demo repair completed with surface restoration." }, "PATCH");
  const evidenceId = await upload(`/projects/${projectId}/completion`, "Demo completion photo; surface repair submitted for human verification.");
  const verifyId = (await api(`/project-head/pothole-candidates/${candidate.id}/verification`, head, {}, "POST", 201)).scan.id as string;
  const verified = roadScanSchema.parse((await api(`/project-head/road-scans/${verifyId}/process`, head, {}, "POST")).scan);
  assert.equal(verified.verification?.result.verificationStatus, "NO_MATCHING_DEFECT_DETECTED");
  assert.equal((await api(`/projects/${projectId}`, head)).project.state, "AWAITING_VERIFICATION"); checks += 2;
  await api(`/project-head/projects/${projectId}/scan-completion-review`, head, { decision: "CONTINUE_CLOSURE", note: "Camera evidence and Engineer evidence reviewed; continue citizen verification." });
  assert.equal((await api(`/projects/${projectId}`, head)).project.state, "AWAITING_VERIFICATION"); checks++;
  // Existing invitation/quorum rules decide closure. Do not fabricate votes or transitions.
  const invitations = await prisma.completionVerificationRequest.findMany({ where: { completionEvidenceId: evidenceId }, include: { citizen: true } });
  assert.ok(invitations.length, "Normal citizen invitations must be created");
  for (const invitation of invitations) {
    if (!invitation.citizen.email) continue;
    const citizen = (await api("/auth/citizen/login", "", { userId: invitation.citizen.email, password: process.env.DEMO_INTERNAL_PASSWORD ?? "CivicOS@123" })).accessToken as string;
    await api("/project-head/road-scans", citizen, { type: "AREA", wardId }, "POST", 403);
    await api(`/completion-evidence/${evidenceId}/verify`, citizen, { decision: "VERIFIED", note: "Simulated local acceptance: repair evidence reviewed." });
  }
  assert.equal((await api(`/projects/${projectId}`, head)).project.state, "CLOSED"); checks++;
  console.log(JSON.stringify({ checks, scanId, candidateId: candidate.id, inspectionId, ticketId, projectId, verifyId, outcome: "PASS: human inspection, execution, camera verification and citizen closure" }, null, 2));
}
void main().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => prisma.$disconnect());
