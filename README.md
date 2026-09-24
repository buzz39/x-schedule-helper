# Draft Queue for X

A free, local-only Chrome extension (Manifest V3) for keeping a queue of posts and threads. When you choose **Prepare in X**, it hands the first post to [X’s own composer](https://x.com/compose/post). You press **Schedule** or **Post** yourself.

This is not an X client. It does not call the X API, does not log in for you, and does not publish anything.

## What it does

- Stores a queue of drafts in this browser: queue title, first post, optional thread posts, notes, and a schedule reminder.
- Lets you add, edit, delete, search, filter, and reorder drafts.
- Marks each draft as **Idea**, **Ready**, **Prepared**, or **Posted** only when you set that status.
- On **Prepare in X**, puts the first post into X’s composer:
  - If a new-post composer is already open, it tries to fill that box.
  - Otherwise it opens X’s public compose link, `https://x.com/intent/post?text=…`, which is the same kind of link a website uses for a share button. X prefills the composer. That link is not an API call.
  - If the post is too long for that link, or the page layout does not accept the text, it copies the post and opens `https://x.com/compose/post` so you can paste.
- Gives each thread post its own **Copy** button. Only the first post is handed over.
- Exports and imports the queue as a JSON file on your computer.

The schedule field is a reminder. It is never sent to X. Set the time in X’s scheduler after the text is in the composer.

## What it does not do

- It does not call `api.x.com`, the Twitter API, or any unofficial API.
- It does not read session cookies, passwords, or auth tokens, and it does not ask you to paste them.
- It does not click **Post**, **Schedule**, **Reply**, **Like**, **Repost**, **Follow**, or **Message**.
- It does not auto-post a thread, auto-reply, or run engagement automation.
- It does not detect whether X actually published the post. After you schedule or publish, set the status to **Posted** yourself.
- It does not upload images, polls, or alt text. The queue is text.
- It has no backend, no account, and no analytics. Nothing in the queue is sent to a server by this extension.

## Install in Chrome

Requires Chrome 114 or newer.

1. Download or clone this repository.
2. Open `chrome://extensions`.
3. Turn on **Developer mode**.
4. Click **Load unpacked**.
5. Select the `extension` folder (the folder that contains `manifest.json`).
6. Pin **Draft Queue**. Click the toolbar icon to open the side panel.

If X was already open when you installed the extension, reload that tab once. New visits pick up the helper automatically. The public compose link still works without that reload.

## Use X’s own Schedule button

1. Write a draft. The **queue title** stays in the extension. The **first post** is what goes to X.
2. Optionally set **Schedule reminder** so you remember the time. X does not receive it.
3. Click **Prepare in X**.
4. Check the composer. If it is empty, click **Copy text** and paste with Ctrl+V or ⌘V.
5. In X, click **Schedule** (the calendar on the Post button) or **Post**. Pick the time there.
6. Back in the extension, click **Mark prepared** once you see the text in the composer. After you schedule or publish, set the status to **Posted**.

A thread stays in the queue as extra posts. Prepare fills only the first one. In X, use X’s thread control to add the next post, then copy that post from the queue and paste it. This extension will not post the rest of the thread for you.

## Import and export

**Export** downloads `x-draft-queue-YYYY-MM-DD.json`. **Import** reads that file and asks whether to replace the queue or add to it. The file looks like this:

```json
{
  "type": "x-draft-queue",
  "version": 1,
  "exportedAt": "2026-09-24T12:00:00.000Z",
  "drafts": [
    {
      "id": "draft_0001",
      "title": "Launch note",
      "body": "First post",
      "parts": ["Second post"],
      "notes": "",
      "suggestedAt": "2026-09-24T09:30",
      "status": "ready",
      "createdAt": 1700000000000,
      "updatedAt": 1700000000000
    }
  ]
}
```

`suggestedAt` is a `datetime-local` value (`YYYY-MM-DDTHH:mm`) with no time zone. Status is `idea`, `ready`, `prepared`, or `posted`.

## How a draft gets into the composer

Prepare never presses a button on x.com. It tries three handoffs, in order:

1. **Open composer.** If the active X tab, or another X tab, already shows a new-post composer, the content script inserts plain text. It looks for:
   - `[data-testid="tweetTextarea_0"]` inside `[role="dialog"]` (the compose modal, including when it is open over a tweet)
   - that same test id on `/compose/post`, `/intent/post`, and Home
   - on the dedicated compose and intent pages only, the first contenteditable textbox, then a textarea
   Tweet pages are skipped so a reply box is not filled. If the composer already has text, it is left alone.
   Insertion tries `document.execCommand("insertText")`, then a `text/plain` paste event, then a `beforeinput` event. Those are the hooks X’s editor (Draft.js / Lexical) usually listens to. Setting `innerHTML` does not update that editor, so this extension does not do that.
2. **Public compose link.** If nothing open can be filled, and the encoded text fits, a new tab opens `https://x.com/intent/post?text=…`. X’s page reads that query and prefills the composer. You still have to press Schedule or Post.
3. **Clipboard.** If the text is long, or insertion fails without changing the box, the post is copied and `https://x.com/compose/post` is opened. Paste it yourself. If the copy fails, the text is shown in the panel so you can select it.

## When X changes its site

X can rename elements, move the composer into a shadow tree, or stop prefilling intent links. Any of that breaks automatic fill. The panel then tells you to copy and paste. Selectors live in `extension/lib/fill.js`. Update those, not the posting buttons — this extension should keep refusing to click them.

A composer inside a closed shadow root is not filled. Reload X after installing so the content script is present in tabs that were already open. You need to be logged in to X in that browser profile; this extension does not log in for you.

The character count is the number of Unicode code points. It is not X’s weighted count (links, emoji). Posts over 280 characters may still be allowed on your account. The extension does not truncate them.

## Privacy and permissions

| Permission | Why |
| --- | --- |
| `storage` | Saves the queue with `chrome.storage.local` on this computer. |
| `sidePanel` | Opens the queue beside the page. |
| `https://x.com/*` and `https://twitter.com/*` | Runs the content script that can fill a composer, and finds an X tab that is already open. |

There is no `<all_urls>`, `tabs`, `cookies`, `identity`, `scripting`, or `webRequest` permission. The extension does not load remote code, fonts, or analytics.

Opening `x.com` is your browser navigating to X. The extension does not add its own server in the middle.

## Project layout

```
extension/           Load this folder as an unpacked extension
  manifest.json
  background.js      Opens the side panel from the toolbar icon
  sidepanel.html     Queue UI
  content/compose.js Runs only on x.com and twitter.com
  lib/               Draft model, handoff plan, composer fill
test/                node:test
scripts/make-icons.py
```

## Development

```bash
node --test
python3 scripts/make-icons.py
```

No install step and no package dependencies. The tests cover the queue, the decision to fill vs. open a compose link vs. copy, and the rule that reply boxes and posting controls are left alone.

## Limitations

- Chrome only. The side panel needs Chrome 114+.
- Text only. No media, polls, or multiple accounts.
- One post is placed at a time. Threads are copied by you.
- X’s interface will change. Clipboard + `https://x.com/compose/post` is the fallback when it does.
- Intent links can be dropped or trimmed by X. If the composer opens empty, paste.
- Status is your word. The extension cannot see that a post went out.
