import {
  LIMITS,
  QUEUE_FILE_TYPE,
  QUEUE_VERSION,
  STATUSES,
} from "./constants.js";
import { clipText } from "./text.js";

const ID_PATTERN = /^[A-Za-z0-9_-]{8,80}$/;

export function createId() {
  if (globalThis.crypto?.randomUUID) return crypto.randomUUID();
  return `d_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 12)}`;
}

export function createDraft(now = Date.now()) {
  return {
    id: createId(),
    title: "",
    body: "",
    parts: [],
    notes: "",
    suggestedAt: "",
    status: "idea",
    createdAt: now,
    updatedAt: now,
  };
}

function validTime(value, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) return fallback;
  return number;
}

export function sanitizeWhen(value) {
  const text = String(value ?? "").trim();
  const match = text.match(/^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2})(?::\d{2})?$/);
  return match ? match[1] : "";
}

export function sanitizeParts(value) {
  if (!Array.isArray(value)) return [];
  return value.slice(0, LIMITS.parts).map((part) => clipText(part, LIMITS.part));
}

export function sanitizeDraft(input, now = Date.now()) {
  if (!input || typeof input !== "object") return null;
  const createdAt = validTime(input.createdAt, now);
  return {
    id: typeof input.id === "string" && ID_PATTERN.test(input.id) ? input.id : createId(),
    title: clipText(input.title, LIMITS.title),
    body: clipText(input.body, LIMITS.body),
    parts: sanitizeParts(input.parts),
    notes: clipText(input.notes, LIMITS.notes),
    suggestedAt: sanitizeWhen(input.suggestedAt),
    status: STATUSES.includes(input.status) ? input.status : "idea",
    createdAt,
    updatedAt: validTime(input.updatedAt, createdAt),
  };
}

export function normalizeState(stored, now = Date.now()) {
  if (stored == null) {
    return { version: QUEUE_VERSION, drafts: [], repaired: false, unreadable: false };
  }
  if (typeof stored !== "object" || !Array.isArray(stored.drafts)) {
    return { version: QUEUE_VERSION, drafts: [], repaired: true, unreadable: true };
  }
  const seen = new Set();
  const drafts = [];
  let repaired = stored.version !== QUEUE_VERSION;
  for (const raw of stored.drafts) {
    if (drafts.length >= LIMITS.drafts) {
      repaired = true;
      break;
    }
    const draft = sanitizeDraft(raw, now);
    if (!draft) {
      repaired = true;
      continue;
    }
    if (seen.has(draft.id)) {
      repaired = true;
      continue;
    }
    if (!raw || raw.id !== draft.id || raw.status !== draft.status) repaired = true;
    seen.add(draft.id);
    drafts.push(draft);
  }
  return { version: QUEUE_VERSION, drafts, repaired, unreadable: false };
}

export function updateDraft(drafts, id, patch, now = Date.now()) {
  return drafts.map((draft) => {
    if (draft.id !== id) return draft;
    const next = { ...draft, parts: [...draft.parts], updatedAt: now };
    if (Object.prototype.hasOwnProperty.call(patch, "title")) next.title = clipText(patch.title, LIMITS.title);
    if (Object.prototype.hasOwnProperty.call(patch, "body")) next.body = clipText(patch.body, LIMITS.body);
    if (Object.prototype.hasOwnProperty.call(patch, "notes")) next.notes = clipText(patch.notes, LIMITS.notes);
    if (Object.prototype.hasOwnProperty.call(patch, "parts")) next.parts = sanitizeParts(patch.parts);
    if (Object.prototype.hasOwnProperty.call(patch, "suggestedAt")) next.suggestedAt = sanitizeWhen(patch.suggestedAt);
    if (Object.prototype.hasOwnProperty.call(patch, "status") && STATUSES.includes(patch.status)) {
      next.status = patch.status;
    }
    return next;
  });
}

export function deleteDraft(drafts, id) {
  return drafts.filter((draft) => draft.id !== id);
}

export function moveDraft(drafts, visibleIds, id, direction) {
  const index = visibleIds.indexOf(id);
  if (index < 0) return drafts;
  const swapId = visibleIds[index + (direction === "up" ? -1 : 1)];
  if (!swapId) return drafts;
  const next = drafts.slice();
  const from = next.findIndex((draft) => draft.id === id);
  const to = next.findIndex((draft) => draft.id === swapId);
  if (from < 0 || to < 0) return drafts;
  [next[from], next[to]] = [next[to], next[from]];
  return next;
}

export function visibleDrafts(drafts, { filter = "all", search = "" } = {}) {
  const query = search.trim().toLowerCase();
  return drafts.filter((draft) => {
    if (filter !== "all" && draft.status !== filter) return false;
    if (!query) return true;
    const haystack = [draft.title, draft.body, draft.notes, ...draft.parts].join("\n").toLowerCase();
    return haystack.includes(query);
  });
}

export function serializeQueue(drafts, now = Date.now()) {
  return {
    type: QUEUE_FILE_TYPE,
    version: QUEUE_VERSION,
    exportedAt: new Date(now).toISOString(),
    drafts: drafts.map((draft) => ({ ...draft, parts: [...draft.parts] })),
  };
}

export function parseQueueImport(data, now = Date.now()) {
  if (data == null || typeof data !== "object") {
    throw new Error("This file is not a draft queue export.");
  }
  const wrapped = !Array.isArray(data);
  if (wrapped && data.type && data.type !== QUEUE_FILE_TYPE) {
    throw new Error("This file is not a draft queue export.");
  }
  const source = wrapped ? data.drafts : data;
  if (!Array.isArray(source)) {
    throw new Error("This file has no drafts array.");
  }
  const normalized = normalizeState({ version: QUEUE_VERSION, drafts: source }, now);
  if (source.length > 0 && normalized.drafts.length === 0) {
    throw new Error("No usable drafts were found in that file.");
  }
  return {
    drafts: normalized.drafts,
    skipped: Math.max(0, source.length - normalized.drafts.length),
    newer: wrapped && Number(data.version) > QUEUE_VERSION,
  };
}

export function mergeDrafts(existing, incoming) {
  const seen = new Set(existing.map((draft) => draft.id));
  const added = [];
  for (const draft of incoming) {
    if (seen.has(draft.id)) continue;
    if (existing.length + added.length >= LIMITS.drafts) break;
    seen.add(draft.id);
    added.push(draft);
  }
  return {
    drafts: [...existing, ...added],
    added: added.length,
    skipped: incoming.length - added.length,
  };
}

export function firstPost(draft) {
  return draft?.body ?? "";
}

export function filledParts(draft) {
  return [draft.body, ...draft.parts].map((part) => String(part ?? "")).filter((part) => part.trim() !== "");
}
