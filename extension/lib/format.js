import { STATUS_LABELS } from "./constants.js";
import { codePointLength, excerpt } from "./text.js";

export function formatReminder(value, locales) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat(locales, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

export function countLabel(value) {
  return `${codePointLength(value)} / 280`;
}

export function isOverClassicLimit(value) {
  return codePointLength(value) > 280;
}

export function draftHeading(draft) {
  const title = draft.title.trim();
  if (title) return title;
  const line = draft.body.trim().split("\n").find((item) => item.trim());
  return line ? excerpt(line, 80) : "Untitled draft";
}

export function previewLine(draft) {
  const body = draft.body.trim();
  if (!body) return "No post text yet";
  return excerpt(body, 96);
}

export function listMeta(draft, locales) {
  const bits = [STATUS_LABELS[draft.status] || "Idea"];
  const extra = draft.parts.filter((part) => part.trim()).length;
  if (extra === 1) bits.push("1 more post");
  if (extra > 1) bits.push(`${extra} more posts`);
  const reminder = formatReminder(draft.suggestedAt, locales);
  if (reminder) bits.push(`Reminder ${reminder}`);
  return bits.join(" · ");
}
