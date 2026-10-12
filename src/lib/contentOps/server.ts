import "server-only";
import { prisma } from "@/lib/prisma";
import { workspaceUserId } from "@/lib/team/workspace";
import type { Capability } from "@/lib/team/roles";
import type { ContentOperation, ContentOperationEvent, ContentRepository } from "@/generated/prisma";

/** An operation row with the relations the DTO reads — present whenever the query included them. */
type OperationRow = ContentOperation & {
  repository?: ContentRepository | null;
  events?: ContentOperationEvent[];
};

/**
 * The workspace this request acts on, or null when the caller may not do `capability`.
 * Content Operations is editorial work, so reading is open to the whole team while creating a pull
 * request — the only action here that leaves the instance — needs the publish capability.
 */
export async function contentOpsUserId(capability: Capability = "read"): Promise<string | null> {
  return workspaceUserId(capability);
}
export function repositoryDto(repo: ContentRepository | null | undefined) {
  if (!repo) return null;
  return {
    id: repo.id, name: repo.name, owner: repo.owner, repo: repo.repo,
    baseBranch: repo.baseBranch, contentRoot: repo.contentRoot,
    createdAt: repo.createdAt, updatedAt: repo.updatedAt,
  };
}

function json(value: unknown) {
  if (typeof value !== "string" || !value) return null;
  try { return JSON.parse(value); } catch { return null; }
}

export function operationDto(operation: OperationRow | null) {
  // Callers re-fetch the row right before passing it in and 404 on null themselves; the reads
  // below stay unguarded exactly as they were, so the non-null assertion only restates that.
  const op = operation!;
  return {
    id: op.id,
    title: op.title,
    keyword: op.keyword,
    operationType: op.operationType,
    sourceType: op.sourceType,
    sourceRef: op.sourceRef,
    targetUrl: op.targetUrl,
    filePath: op.filePath,
    content: op.content,
    status: op.status,
    gates: json(op.gates),
    prNumber: op.prNumber,
    prUrl: op.prUrl,
    branchName: op.branchName,
    commitSha: op.commitSha,
    error: op.error,
    approvedAt: op.approvedAt,
    prCreatedAt: op.prCreatedAt,
    mergedAt: op.mergedAt,
    liveAt: op.liveAt,
    siteId: op.siteId ?? null,
    trackedKeywordId: op.trackedKeywordId ?? null,
    indexingLinkedAt: op.indexingLinkedAt ?? null,
    measurementStartedAt: op.measurementStartedAt ?? null,
    lastMeasuredAt: op.lastMeasuredAt ?? null,
    outcome: json(op.outcomeJson),
    createdAt: op.createdAt,
    updatedAt: op.updatedAt,
    repository: repositoryDto(op.repository),
    events: Array.isArray(op.events) ? op.events.map((event: ContentOperationEvent) => ({
      id: event.id, fromStatus: event.fromStatus, toStatus: event.toStatus,
      note: event.note, meta: json(event.meta), createdAt: event.createdAt,
    })) : [],
  };
}

export async function ownedOperation(userId: string, id: string) {
  return prisma.contentOperation.findFirst({
    where: { id, userId },
    include: { repository: true, events: { orderBy: { createdAt: "desc" }, take: 40 } },
  });
}

export async function recordTransition(
  operationId: string,
  userId: string,
  fromStatus: string | null,
  toStatus: string,
  note = "",
  meta?: unknown,
) {
  return prisma.contentOperationEvent.create({
    data: { operationId, userId, fromStatus, toStatus, note: note.slice(0, 500), meta: meta == null ? null : JSON.stringify(meta) },
  });
}
