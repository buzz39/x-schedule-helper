function walk(node) {
  const found = [];
  for (const child of node.children || []) {
    found.push(child, ...walk(child));
  }
  return found;
}

function matchesSimple(el, simple) {
  const attrs = [...simple.matchAll(/\[([^\]]+)\]/g)];
  let rest = simple;
  for (const match of attrs) rest = rest.replace(match[0], "");
  rest = rest.trim();
  if (rest && rest.toLowerCase() !== String(el.tagName || "").toLowerCase()) return false;
  if (!rest && attrs.length === 0) return false;
  for (const match of attrs) {
    const body = match[1];
    const prefix = body.match(/^([A-Za-z0-9_-]+)\^="(.*)"$/);
    const exact = body.match(/^([A-Za-z0-9_-]+)="(.*)"$/);
    const read = (name) => (typeof el.getAttribute === "function" ? el.getAttribute(name) : null);
    if (prefix) {
      if (!String(read(prefix[1]) || "").startsWith(prefix[2])) return false;
    } else if (exact) {
      if (read(exact[1]) !== exact[2]) return false;
    } else {
      return false;
    }
  }
  return true;
}

function matchesComplex(el, selector) {
  const parts = selector.trim().split(/\s+/);
  const last = parts.pop();
  if (!matchesSimple(el, last)) return false;
  if (parts.length === 0) return true;
  const ancestor = parts.join(" ");
  let parent = el.parent;
  while (parent) {
    if (matchesComplex(parent, ancestor)) return true;
    parent = parent.parent;
  }
  return false;
}

export function queryAll(root, selector) {
  const selectors = selector.split(",").map((part) => part.trim()).filter(Boolean);
  const results = [];
  for (const candidate of walk(root)) {
    if (selectors.some((part) => matchesComplex(candidate, part))) results.push(candidate);
  }
  return results;
}

export function createDocument() {
  const doc = {
    children: [],
    selected: null,
    execLog: [],
    clicks: 0,
    selectors: [],
  };
  doc.defaultView = {
    getSelection() {
      return {
        removeAllRanges() {},
        addRange() {},
      };
    },
    DataTransfer: class DataTransfer {
      setData(type, value) {
        this[type] = value;
      }
      getData(type) {
        return this[type] || "";
      }
    },
    ClipboardEvent: class ClipboardEvent {
      constructor(type, init = {}) {
        this.type = type;
        this.clipboardData = init.clipboardData;
      }
    },
    InputEvent: class InputEvent {
      constructor(type, init = {}) {
        this.type = type;
        Object.assign(this, init);
      }
    },
  };
  doc.createRange = () => ({
    selectNodeContents(node) {
      doc.selected = node;
    },
  });
  doc.execCommand = (command, _ui, value) => {
    doc.execLog.push(command);
    if (command === "insertText" && doc.selected) {
      doc.selected.innerText = value;
      doc.selected.textContent = value;
      return doc.insertTextResult !== false;
    }
    return false;
  };
  doc.querySelector = (selector) => {
    doc.selectors.push(selector);
    return queryAll(doc, selector)[0] || null;
  };
  doc.querySelectorAll = (selector) => queryAll(doc, selector);
  doc.append = (child) => {
    child.parent = doc;
    doc.children.push(child);
    return child;
  };
  return doc;
}

export function createElement(doc, tag, attrs = {}, text = "") {
  const element = {
    ownerDocument: doc,
    tagName: String(tag).toUpperCase(),
    attrs: { ...attrs },
    children: [],
    parent: null,
    innerText: text,
    textContent: text,
    value: text,
    hidden: Boolean(attrs.hidden),
    isContentEditable: attrs.contenteditable === "true",
    events: [],
    clicks: 0,
    focus() {
      element.focused = true;
    },
    select() {
      element.selectedAll = true;
    },
    click() {
      element.clicks += 1;
      doc.clicks += 1;
    },
    getAttribute(name) {
      return Object.prototype.hasOwnProperty.call(element.attrs, name) ? element.attrs[name] : null;
    },
    querySelector(selector) {
      return queryAll(element, selector)[0] || null;
    },
    querySelectorAll(selector) {
      return queryAll(element, selector);
    },
    dispatchEvent(event) {
      element.events.push(event);
      if (event.type === "paste" && event.clipboardData && doc.pasteWrites) {
        const pasted = event.clipboardData.getData("text/plain");
        element.innerText = pasted;
        element.textContent = pasted;
      }
      return true;
    },
    append(child) {
      child.parent = element;
      element.children.push(child);
      return child;
    },
  };
  return element;
}
