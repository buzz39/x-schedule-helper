import {
  FILL_MESSAGE,
  PROBE_MESSAGE,
  STATUS_HELP,
  STATUS_LABELS,
  STATUSES,
} from "./lib/constants.js";
import {
  createDraft,
  deleteDraft,
  filledParts,
  firstPost,
  mergeDrafts,
  moveDraft,
  parseQueueImport,
  serializeQueue,
  updateDraft,
  visibleDrafts,
} from "./lib/drafts.js";
import { countLabel, draftHeading, formatReminder, isOverClassicLimit, listMeta, previewLine } from "./lib/format.js";
import { describeHandoff } from "./lib/handoff-copy.js";
import { handoffToX } from "./lib/handoff.js";
import { intentTextFits } from "./lib/plan.js";
import { loadQueue, saveQueue } from "./lib/storage.js";

const ui = {
  drafts: [],
  selectedId: null,
  filter: "all",
  search: "",
  banner: null,
  deleteArmed: false,
  saveState: "",
  editorKey: null,
};

let saveTimer = 0;
let saveChain = Promise.resolve();

function findDraft(id) {
  return ui.drafts.find((draft) => draft.id === id) || null;
}

function el(tag, props = {}, children = []) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    if (value == null || value === false) continue;
    if (key === "class") node.className = value;
    else if (key === "text") node.textContent = value;
    else if (key === "value") node.value = value;
    else if (key === "onclick") node.addEventListener("click", value);
    else node.setAttribute(key, value === true ? "" : String(value));
  }
  for (const child of children) {
    if (child) node.append(child);
  }
  return node;
}

function paintSave() {
  const node = document.getElementById("save-state");
  node.textContent = ui.saveState;
}

function enqueueSave() {
  saveChain = saveChain
    .then(() => saveQueue(ui.drafts))
    .then(() => {
      ui.saveState = "Saved";
      paintSave();
    })
    .catch((error) => {
      ui.saveState = "Not saved";
      paintSave();
      showBanner({
        tone: "error",
        text: error?.message || "Couldn’t save drafts in this browser.",
      });
    });
  return saveChain;
}

function scheduleSave() {
  ui.saveState = "Saving…";
  paintSave();
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    enqueueSave();
  }, 200);
}

function showBanner(banner) {
  ui.banner = banner;
  renderBanner();
}

function renderBanner() {
  const host = document.getElementById("banner");
  host.replaceChildren();
  if (!ui.banner) {
    host.hidden = true;
    return;
  }
  host.hidden = false;
  host.className = `banner banner-${ui.banner.tone || "info"}`;
  host.setAttribute("role", ui.banner.tone === "error" ? "alert" : "status");
  const text = document.createElement("p");
  text.textContent = ui.banner.text;
  host.append(text);
  if (ui.banner.detail) {
    const pre = document.createElement("pre");
    pre.className = "banner-text";
    pre.tabIndex = 0;
    pre.textContent = ui.banner.detail;
    host.append(pre);
  }
  const row = el("div", { class: "banner-actions" });
  for (const action of ui.banner.actions || []) {
    row.append(
      el("button", {
        type: "button",
        class: "btn btn-small",
        text: action.label,
        onclick: () => action.onClick(),
      }),
    );
  }
  row.append(
    el("button", {
      type: "button",
      class: "btn btn-small btn-quiet",
      text: "Dismiss",
      "aria-label": "Dismiss message",
      onclick: () => showBanner(null),
    }),
  );
  host.append(row);
}

function renderFilters() {
  const host = document.getElementById("filters");
  host.replaceChildren();
  for (const filter of ["all", ...STATUSES]) {
    const count = filter === "all" ? ui.drafts.length : ui.drafts.filter((draft) => draft.status === filter).length;
    const label = filter === "all" ? "All" : STATUS_LABELS[filter];
    host.append(
      el("button", {
        type: "button",
        class: "filter",
        "aria-pressed": ui.filter === filter ? "true" : "false",
        text: `${label} ${count}`,
        onclick: () => {
          ui.filter = filter;
          renderFilters();
          renderList();
        },
      }),
    );
  }
}

function renderList() {
  const list = document.getElementById("draft-list");
  const empty = document.getElementById("empty");
  const visible = visibleDrafts(ui.drafts, { filter: ui.filter, search: ui.search });
  list.replaceChildren();
  if (visible.length === 0) {
    empty.hidden = false;
    empty.textContent = ui.drafts.length === 0
      ? "Your queue is empty. A new draft stays on this computer until you export it."
      : "No drafts match this filter.";
    return;
  }
  empty.hidden = true;
  visible.forEach((draft, index) => list.append(renderItem(draft, index, visible.length)));
}

function renderItem(draft, index, total) {
  const item = el("li", {
    class: draft.id === ui.selectedId ? "draft is-selected" : "draft",
    "data-draft-id": draft.id,
  });
  const open = el("button", {
    type: "button",
    class: "draft-open",
    "data-open": draft.id,
    "data-testid": "open-draft",
    "aria-current": draft.id === ui.selectedId ? "true" : "false",
  });
  open.append(
    el("span", { class: `pill pill-${draft.status}`, "data-pill": "true", text: STATUS_LABELS[draft.status] }),
    el("span", { class: "draft-heading", "data-heading": "true", text: draftHeading(draft) }),
    el("span", { class: "draft-preview", "data-preview": "true", text: previewLine(draft) }),
    el("span", { class: "draft-meta", "data-meta": "true", text: listMeta(draft) }),
  );
  const moves = el("div", { class: "draft-moves" });
  moves.append(moveButton("up", "Move draft up", index === 0, draft.id));
  moves.append(moveButton("down", "Move draft down", index === total - 1, draft.id));
  item.append(open, moves);
  return item;
}

function moveButton(direction, label, disabled, id) {
  return el("button", {
    type: "button",
    class: "btn btn-small btn-quiet",
    text: direction === "up" ? "Up" : "Down",
    "aria-label": label,
    "data-move": direction,
    "data-id": id,
    disabled,
  });
}

function syncListItem(draft) {
  const item = document.querySelector(`[data-draft-id="${CSS.escape(draft.id)}"]`);
  if (!item || (ui.filter !== "all" && ui.filter !== draft.status)) {
    renderList();
    return;
  }
  item.querySelector("[data-heading]").textContent = draftHeading(draft);
  item.querySelector("[data-preview]").textContent = previewLine(draft);
  item.querySelector("[data-meta]").textContent = listMeta(draft);
  const pill = item.querySelector("[data-pill]");
  pill.textContent = STATUS_LABELS[draft.status];
  pill.className = `pill pill-${draft.status}`;
}

function setCount(name, value) {
  const node = document.querySelector(`[data-count-for="${name}"]`);
  if (!node) return;
  node.textContent = countLabel(value);
  node.classList.toggle("is-over", isOverClassicLimit(value));
}

function syncActionState(draft) {
  const empty = draft.body.trim() === "";
  for (const id of ["prepare", "copy-text"]) {
    const button = document.getElementById(id);
    if (button) button.disabled = empty;
  }
}

function syncStatusButtons(draft) {
  for (const button of document.querySelectorAll("[data-status-option]")) {
    button.setAttribute("aria-pressed", button.dataset.statusOption === draft.status ? "true" : "false");
  }
  const help = document.getElementById("status-help");
  if (help) help.textContent = STATUS_HELP[draft.status] || "";
}

function editorKey(draft) {
  if (!draft) return "";
  return `${draft.id}:${draft.parts.length}:${ui.deleteArmed ? 1 : 0}`;
}

function paintEditor(draft) {
  const host = document.getElementById("editor");
  host.replaceChildren();
  document.body.classList.toggle("has-selection", Boolean(draft));
  if (!draft) {
    host.append(
      el("div", { class: "placeholder" }, [
        el("h2", { text: "Nothing selected" }),
        el("p", { text: "Choose a draft, or start a new one. The queue never posts for you." }),
      ]),
    );
    return;
  }

  const form = el("form", { id: "draft-form", autocomplete: "off" });
  form.addEventListener("submit", (event) => event.preventDefault());
  form.append(
    el("button", {
      type: "button",
      class: "btn btn-quiet back",
      text: "Back to queue",
      onclick: () => selectDraft(null),
    }),
  );
  form.append(textField("Queue title", "Shown only in this extension.", "field-title", draft.title, "Hook, campaign, or working name"));
  form.append(statusControl(draft));
  form.append(bodyField(draft));
  form.append(threadSection(draft));
  form.append(notesField(draft));
  form.append(whenField(draft));
  form.append(actionBar(draft));
  form.append(deleteRow(draft));
  host.append(form);
  bindEditor(form, draft.id);
  syncActionState(draft);
}

function textField(label, hint, id, value, placeholder) {
  const wrap = el("label", { class: "field" }, [
    el("span", { text: label }),
    el("input", { id, type: "text", value, maxlength: "280", placeholder }),
  ]);
  if (hint) wrap.append(el("span", { class: "hint", text: hint }));
  return wrap;
}

function statusControl(draft) {
  const wrap = el("div", { class: "field" });
  wrap.append(el("span", { text: "Status" }));
  const group = el("div", { class: "statuses", role: "group", "aria-label": "Status" });
  for (const status of STATUSES) {
    group.append(
      el("button", {
        type: "button",
        class: "status-option",
        "data-status-option": status,
        "aria-pressed": draft.status === status ? "true" : "false",
        title: STATUS_HELP[status],
        text: STATUS_LABELS[status],
        onclick: () => setStatus(draft.id, status),
      }),
    );
  }
  wrap.append(group, el("p", { class: "hint", id: "status-help", text: STATUS_HELP[draft.status] }));
  return wrap;
}

function bodyField(draft) {
  const wrap = el("label", { class: "field" }, [
    el("span", { text: "First post" }),
  ]);
  const area = el("textarea", { id: "field-body", rows: "6", maxlength: "10000", placeholder: "Write the post…" });
  area.value = draft.body;
  wrap.append(
    area,
    el("span", {
      class: isOverClassicLimit(draft.body) ? "count is-over" : "count",
      "data-count-for": "body",
      text: countLabel(draft.body),
    }),
    el("span", {
      class: "hint",
      text: "This is the text handed to X. The count is plain characters, not X’s weighted limit.",
    }),
  );
  return wrap;
}

function threadSection(draft) {
  const wrap = el("fieldset", { class: "thread" });
  wrap.append(
    el("legend", { text: "Thread" }),
    el("p", {
      class: "hint",
      text: "Optional later posts. Prepare sends only the first post. In X, add the next post with X’s own thread control, then copy it from here.",
    }),
  );
  draft.parts.forEach((part, index) => wrap.append(partEditor(part, index, draft)));
  wrap.append(
    el("button", {
      type: "button",
      class: "btn",
      text: "Add post",
      "data-testid": "add-part",
      onclick: () => addPart(draft.id),
    }),
  );
  return wrap;
}

function partEditor(part, index, draft) {
  const wrap = el("div", { class: "part" });
  const area = el("textarea", {
    id: `field-part-${index}`,
    rows: "3",
    maxlength: "10000",
    "aria-label": `Thread post ${index + 2}`,
  });
  area.value = part;
  area.addEventListener("input", () => {
    const current = findDraft(draft.id);
    const parts = [...current.parts];
    parts[index] = area.value;
    onText(draft.id, { parts });
    setCount(`part-${index}`, area.value);
    const copy = wrap.querySelector("[data-copy-part]");
    if (copy) copy.disabled = area.value.trim() === "";
  });
  const actions = el("div", { class: "part-actions" });
  actions.append(
    el("button", {
      type: "button",
      class: "btn btn-small",
      text: "Copy",
      disabled: part.trim() === "",
      "data-copy-part": String(index),
      onclick: () => copyValue(area.value, "Copied that post."),
    }),
    el("button", {
      type: "button",
      class: "btn btn-small btn-quiet",
      text: "Up",
      disabled: index === 0,
      onclick: () => movePart(draft.id, index, -1),
    }),
    el("button", {
      type: "button",
      class: "btn btn-small btn-quiet",
      text: "Down",
      disabled: index === draft.parts.length - 1,
      onclick: () => movePart(draft.id, index, 1),
    }),
    el("button", {
      type: "button",
      class: "btn btn-small btn-quiet",
      text: "Remove",
      onclick: () => removePart(draft.id, index),
    }),
  );
  wrap.append(
    area,
    el("span", {
      class: isOverClassicLimit(part) ? "count is-over" : "count",
      "data-count-for": `part-${index}`,
      text: countLabel(part),
    }),
    actions,
  );
  return wrap;
}

function notesField(draft) {
  const wrap = el("label", { class: "field" }, [el("span", { text: "Notes" })]);
  const area = el("textarea", {
    id: "field-notes",
    rows: "3",
    maxlength: "4000",
    placeholder: "Source, link, or why this exists",
  });
  area.value = draft.notes;
  wrap.append(area, el("span", { class: "hint", text: "Notes stay in the queue. They are not sent to X." }));
  return wrap;
}

function whenField(draft) {
  const wrap = el("div", { class: "field" });
  wrap.append(el("span", { text: "Schedule reminder" }));
  const row = el("div", { class: "when-row" });
  row.append(
    el("input", {
      id: "field-when",
      type: "datetime-local",
      step: "60",
      value: draft.suggestedAt,
    }),
    el("button", {
      type: "button",
      class: "btn btn-small btn-quiet",
      text: "Clear",
      onclick: () => {
        const input = document.getElementById("field-when");
        if (input) input.value = "";
        onText(draft.id, { suggestedAt: "" });
      },
    }),
  );
  wrap.append(
    row,
    el("span", { class: "hint", text: "A reminder for you. Prepare does not set a time in X." }),
  );
  return wrap;
}

function actionBar(draft) {
  const bar = el("div", { class: "editor-actions" });
  bar.append(
    el("button", {
      type: "button",
      class: "btn btn-primary",
      id: "prepare",
      "data-testid": "prepare",
      text: "Prepare in X",
      onclick: () => prepare(draft.id),
    }),
    el("button", {
      type: "button",
      class: "btn",
      id: "copy-text",
      "data-testid": "copy-text",
      text: "Copy text",
      onclick: () => copyValue(firstPost(findDraft(draft.id)), "Copied the first post."),
    }),
  );
  if (filledParts(draft).length > 1) {
    bar.append(
      el("button", {
        type: "button",
        class: "btn",
        text: "Copy thread as notes",
        onclick: () => copyValue(filledParts(findDraft(draft.id)).join("\n\n---\n\n"), "Copied the thread for your notes."),
      }),
    );
  }
  bar.append(
    el("p", {
      class: "hint",
      text: "Prepare never presses Schedule, Post, Reply, Like, Follow, or DM.",
    }),
  );
  return bar;
}

function deleteRow(draft) {
  return el("div", { class: "danger-row" }, [
    el("button", {
      type: "button",
      class: ui.deleteArmed ? "btn btn-danger is-armed" : "btn btn-danger",
      text: ui.deleteArmed ? "Delete this draft now" : "Delete draft",
      onclick: () => armOrDelete(draft.id),
    }),
  ]);
}

function bindEditor(form, id) {
  form.querySelector("#field-title").addEventListener("input", (event) => {
    onText(id, { title: event.target.value });
  });
  form.querySelector("#field-body").addEventListener("input", (event) => {
    onText(id, { body: event.target.value });
    setCount("body", event.target.value);
    syncActionState(findDraft(id));
  });
  form.querySelector("#field-notes").addEventListener("input", (event) => {
    onText(id, { notes: event.target.value });
  });
  const when = form.querySelector("#field-when");
  when.addEventListener("change", () => onText(id, { suggestedAt: when.value }));
}

function onText(id, patch) {
  ui.drafts = updateDraft(ui.drafts, id, patch);
  const draft = findDraft(id);
  if (draft) {
    syncListItem(draft);
    if (Object.prototype.hasOwnProperty.call(patch, "body")) syncActionState(draft);
  }
  scheduleSave();
}

function setStatus(id, status) {
  ui.drafts = updateDraft(ui.drafts, id, { status });
  const draft = findDraft(id);
  if (draft) {
    syncStatusButtons(draft);
    syncListItem(draft);
  }
  renderFilters();
  enqueueSave();
}

function selectDraft(id, options = {}) {
  if (id === ui.selectedId && id !== null && !options.force) return;
  ui.selectedId = id;
  ui.deleteArmed = false;
  ui.editorKey = null;
  render();
  if (options.focus === "title") document.getElementById("field-title")?.focus();
}

function addPart(id) {
  const draft = findDraft(id);
  const nextIndex = draft.parts.length;
  ui.drafts = updateDraft(ui.drafts, id, { parts: [...draft.parts, ""] });
  ui.editorKey = null;
  render();
  enqueueSave();
  document.getElementById(`field-part-${nextIndex}`)?.focus();
}

function removePart(id, index) {
  const draft = findDraft(id);
  const parts = draft.parts.filter((_, partIndex) => partIndex !== index);
  ui.drafts = updateDraft(ui.drafts, id, { parts });
  ui.editorKey = null;
  render();
  enqueueSave();
}

function movePart(id, index, delta) {
  const draft = findDraft(id);
  const target = index + delta;
  if (target < 0 || target >= draft.parts.length) return;
  const parts = [...draft.parts];
  [parts[index], parts[target]] = [parts[target], parts[index]];
  ui.drafts = updateDraft(ui.drafts, id, { parts });
  ui.editorKey = null;
  render();
  enqueueSave();
}

function moveDraftBy(id, direction) {
  const visibleIds = visibleDrafts(ui.drafts, { filter: ui.filter, search: ui.search }).map((draft) => draft.id);
  ui.drafts = moveDraft(ui.drafts, visibleIds, id, direction);
  renderList();
  enqueueSave();
}

function armOrDelete(id) {
  if (!ui.deleteArmed) {
    ui.deleteArmed = true;
    ui.editorKey = null;
    render();
    return;
  }
  ui.drafts = deleteDraft(ui.drafts, id);
  ui.selectedId = null;
  ui.deleteArmed = false;
  ui.editorKey = null;
  render();
  enqueueSave();
  showBanner({ tone: "info", text: "Draft deleted from this browser." });
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const area = document.createElement("textarea");
      area.value = text;
      area.setAttribute("readonly", "");
      area.style.position = "fixed";
      area.style.opacity = "0";
      document.body.append(area);
      area.select();
      const ok = document.execCommand("copy");
      area.remove();
      return ok;
    } catch {
      return false;
    }
  }
}

async function copyValue(text, success) {
  if (!String(text || "").trim()) {
    showBanner({ tone: "warn", text: "There’s nothing to copy yet." });
    return;
  }
  const ok = await copyText(text);
  showBanner(
    ok
      ? { tone: "success", text: success }
      : { tone: "warn", text: "Couldn’t copy automatically. Select the draft text and copy it yourself.", detail: text },
  );
}

function sendMessage(tabId, message, timeoutMs) {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(value);
    };
    const timer = setTimeout(() => finish(null), timeoutMs);
    try {
      chrome.tabs.sendMessage(tabId, message, (response) => {
        if (chrome.runtime.lastError) finish(null);
        else finish(response ?? null);
      });
    } catch {
      finish(null);
    }
  });
}

async function waitAndFill(tabId, text) {
  const deadline = Date.now() + 8000;
  while (Date.now() < deadline) {
    const probe = await sendMessage(tabId, { type: PROBE_MESSAGE }, 500);
    if (probe?.canFill) return sendMessage(tabId, { type: FILL_MESSAGE, text }, 5000);
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  return { ok: false, reason: "not-found" };
}

function createApi(copyPromise, text) {
  return {
    listXTabs() {
      return chrome.tabs.query({ url: ["https://x.com/*", "https://twitter.com/*"] });
    },
    async activeTabId() {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      return tab?.id ?? null;
    },
    probe(tabId) {
      return sendMessage(tabId, { type: PROBE_MESSAGE }, 700);
    },
    fill(tabId, value) {
      return sendMessage(tabId, { type: FILL_MESSAGE, text: value }, 5000);
    },
    async focus(tabId, windowId) {
      await chrome.tabs.update(tabId, { active: true });
      if (windowId != null) await chrome.windows.update(windowId, { focused: true });
    },
    open(url) {
      return chrome.tabs.create({ url, active: true });
    },
    copy() {
      if (copyPromise) return copyPromise;
      return copyText(text);
    },
    fillWhenReady(tabId, value) {
      return waitAndFill(tabId, value);
    },
  };
}

async function prepare(id) {
  const draft = findDraft(id);
  if (!draft) return;
  const text = draft.body;
  const button = document.getElementById("prepare");
  if (button) button.disabled = true;
  const copyPromise = intentTextFits(text) ? null : copyText(text);
  try {
    if (typeof chrome === "undefined" || !chrome.tabs) {
      showBanner({ tone: "error", text: "Prepare works from the installed Chrome extension." });
      return;
    }
    const result = await handoffToX(text, createApi(copyPromise, text));
    const message = describeHandoff(result, {
      reminder: formatReminder(draft.suggestedAt),
      hasThread: draft.parts.some((part) => part.trim()),
      status: draft.status,
      body: text,
    });
    const actions = [];
    if (message.offerPrepared) {
      actions.push({ label: "Mark prepared", onClick: () => setStatusFromBanner(id) });
    }
    showBanner({ tone: message.tone, text: message.text, detail: message.detail, actions });
  } catch {
    showBanner({ tone: "error", text: "Prepare failed before it could open X. Use Copy text." });
  } finally {
    const current = findDraft(id);
    if (button && current) button.disabled = current.body.trim() === "";
  }
}

function setStatusFromBanner(id) {
  setStatus(id, "prepared");
  showBanner({
    tone: "success",
    text: "Marked prepared. After you schedule or publish in X, set the status to Posted.",
  });
}

function render() {
  renderFilters();
  renderList();
  const draft = findDraft(ui.selectedId);
  const key = editorKey(draft);
  // A null key means the editor must rebuild. "" is the real key for "no draft".
  if (key !== ui.editorKey) {
    ui.editorKey = key;
    paintEditor(draft);
  } else if (draft) {
    syncStatusButtons(draft);
    syncActionState(draft);
  }
  paintSave();
}

function exportQueueFile() {
  const payload = serializeQueue(ui.drafts);
  const blob = new Blob([`${JSON.stringify(payload, null, 2)}\n`], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `x-draft-queue-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
  showBanner({ tone: "success", text: "Exported the queue as JSON. The file stays on this computer." });
}

async function onImportFile(file) {
  try {
    if (!file) return;
    if (file.size > 2_000_000) throw new Error("That file is larger than 2 MB.");
    let data;
    try {
      data = JSON.parse(await file.text());
    } catch {
      throw new Error("That file is not valid JSON.");
    }
    const parsed = parseQueueImport(data);
    const extra = [
      parsed.skipped ? `Skipped ${parsed.skipped} unusable row${parsed.skipped === 1 ? "" : "s"}.` : "",
      parsed.newer ? "The file is from a newer version. Unknown fields were dropped." : "",
    ].filter(Boolean).join(" ");
    showBanner({
      tone: "info",
      text: `Found ${parsed.drafts.length} draft${parsed.drafts.length === 1 ? "" : "s"}. ${extra}`.trim(),
      actions: [
        { label: "Replace queue", onClick: () => applyImport(parsed.drafts, "replace") },
        { label: "Add to queue", onClick: () => applyImport(parsed.drafts, "merge") },
      ],
    });
  } catch (error) {
    showBanner({ tone: "error", text: error.message || "Could not import that file." });
  }
}

function applyImport(drafts, mode) {
  if (mode === "replace") {
    ui.drafts = drafts;
    ui.selectedId = null;
    ui.deleteArmed = false;
  } else {
    ui.drafts = mergeDrafts(ui.drafts, drafts).drafts;
  }
  ui.editorKey = null;
  render();
  enqueueSave();
  showBanner({
    tone: "success",
    text: mode === "replace" ? "Replaced the queue with the imported file." : "Added imported drafts to the queue.",
  });
}

function bindStatic() {
  document.getElementById("new-draft").addEventListener("click", () => {
    const draft = createDraft();
    ui.drafts = [draft, ...ui.drafts];
    ui.selectedId = null;
    selectDraft(draft.id, { focus: "title", force: true });
    enqueueSave();
  });
  document.getElementById("export-queue").addEventListener("click", exportQueueFile);
  document.getElementById("import-queue").addEventListener("click", () => {
    document.getElementById("import-file").click();
  });
  document.getElementById("import-file").addEventListener("change", (event) => {
    const [file] = event.target.files || [];
    event.target.value = "";
    onImportFile(file);
  });
  document.getElementById("search").addEventListener("input", (event) => {
    ui.search = event.target.value;
    renderList();
  });
  document.getElementById("draft-list").addEventListener("click", (event) => {
    const move = event.target.closest("[data-move]");
    if (move && !move.disabled) {
      moveDraftBy(move.dataset.id, move.dataset.move);
      return;
    }
    const open = event.target.closest("[data-open]");
    if (open) selectDraft(open.dataset.open);
  });
}

async function init() {
  bindStatic();
  const state = await loadQueue();
  ui.drafts = state.drafts;
  if (state.unreadable) {
    showBanner({
      tone: "error",
      text: "Saved drafts couldn’t be read. Creating or editing a draft will replace the unreadable data.",
    });
  }
  render();
}

init().catch(() => {
  showBanner({ tone: "error", text: "Draft Queue couldn’t read browser storage." });
});
