export const STATUSES = ["idea", "ready", "prepared", "posted"];

export const STATUS_LABELS = {
  idea: "Idea",
  ready: "Ready",
  prepared: "Prepared",
  posted: "Posted",
};

export const STATUS_HELP = {
  idea: "Still shaping",
  ready: "Ready to hand to X",
  prepared: "You put the text in X’s composer",
  posted: "You scheduled or published it in X",
};

export const STORAGE_KEY = "draftQueueV1";
export const QUEUE_FILE_TYPE = "x-draft-queue";
export const QUEUE_VERSION = 1;

export const LIMITS = {
  drafts: 500,
  title: 280,
  body: 10000,
  part: 10000,
  parts: 25,
  notes: 4000,
};

/** Encoded-text budget for X’s public compose link. Covers a full post, including CJK and emoji. */
export const MAX_INTENT_ENCODED = 6000;

export const COMPOSE_URL = "https://x.com/compose/post";
export const INTENT_BASE = "https://x.com/intent/post";

export const PROBE_MESSAGE = "draft-queue:probe";
export const FILL_MESSAGE = "draft-queue:fill";

/** Placeholders X paints inside an otherwise empty composer. Matched only as the entire string. */
export const EMPTY_PLACEHOLDERS = [
  "what's happening?",
  "what’s happening?",
  "post your reply",
  "tweet your reply",
];
