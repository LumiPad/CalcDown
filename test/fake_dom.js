export class FakeTextNode {
  constructor(text, ownerDocument) {
    this.nodeType = 3;
    this.ownerDocument = ownerDocument;
    this.parentNode = null;
    this.value = String(text);
  }

  get textContent() {
    return this.value;
  }

  set textContent(v) {
    this.value = String(v);
  }

  remove() {
    if (this.parentNode) this.parentNode.removeChild(this);
  }
}

export class FakeElement {
  constructor(tagName, ownerDocument, namespaceURI = null) {
    this.nodeType = 1;
    this.ownerDocument = ownerDocument;
    this.namespaceURI = namespaceURI;
    this.parentNode = null;

    this.tagName = String(tagName).toLowerCase();
    this.children = [];
    this.attributes = Object.create(null);
    this.style = Object.create(null);
    this.dataset = Object.create(null);
    this.className = "";

    this._listeners = new Map();
    this._classSet = new Set();
    this.classList = {
      add: (...tokens) => {
        for (const raw of tokens) {
          const token = String(raw);
          if (!token) continue;
          this._classSet.add(token);
        }
        this.className = Array.from(this._classSet).join(" ");
      },
    };

    // input-ish defaults (only used when tagName === "input")
    this.type = "";
    this.value = "";
    this.checked = false;
    this.min = "";
    this.max = "";
    this.step = "";
  }

  get childNodes() {
    return this.children;
  }

  get firstChild() {
    return this.children[0] ?? null;
  }

  get isConnected() {
    return this.parentNode !== null;
  }

  appendChild(node) {
    if (node && typeof node === "object") node.parentNode = this;
    this.children.push(node);
    return node;
  }

  removeChild(node) {
    const idx = this.children.indexOf(node);
    if (idx !== -1) this.children.splice(idx, 1);
    if (node && typeof node === "object") node.parentNode = null;
    return node;
  }

  remove() {
    if (this.parentNode) this.parentNode.removeChild(this);
  }

  setAttribute(name, value) {
    this.attributes[String(name)] = String(value);
  }

  getAttribute(name) {
    const v = this.attributes[String(name)];
    return v === undefined ? null : v;
  }

  addEventListener(type, handler) {
    const key = String(type);
    const arr = this._listeners.get(key) ?? [];
    arr.push(handler);
    this._listeners.set(key, arr);
  }

  dispatchFakeEvent(type) {
    const key = String(type);
    const arr = this._listeners.get(key) ?? [];
    for (const handler of arr) handler({ type: key, target: this });
  }

  querySelectorAll(selector) {
    const sel = String(selector).trim();
    if (sel !== "input[data-name]") return [];
    const out = [];
    for (const n of walk(this)) {
      if (!n || typeof n !== "object") continue;
      if (n.nodeType !== 1) continue;
      if (n.tagName !== "input") continue;
      if (!n.dataset || typeof n.dataset !== "object") continue;
      if (n.dataset.name) out.push(n);
    }
    return out;
  }

  get textContent() {
    return this.children.map((c) => (c && typeof c === "object" ? c.textContent ?? "" : "")).join("");
  }

  set textContent(v) {
    this.children = [new FakeTextNode(v, this.ownerDocument)];
  }

  get valueAsNumber() {
    if (this.tagName !== "input") return Number.NaN;
    if (!this.value) return Number.NaN;
    const n = Number(this.value);
    return Number.isFinite(n) ? n : Number.NaN;
  }
}

export class FakeDocument {
  constructor(opts = {}) {
    const { withHead = true } = opts;
    this.documentElement = new FakeElement("html", this);
    if (withHead) {
      this.head = new FakeElement("head", this);
      this.documentElement.appendChild(this.head);
    } else {
      this.head = null;
    }
  }

  createElement(tagName) {
    return new FakeElement(tagName, this);
  }

  createElementNS(ns, tagName) {
    return new FakeElement(tagName, this, ns);
  }

  createTextNode(text) {
    return new FakeTextNode(text, this);
  }

  getElementById(id) {
    const want = String(id);
    for (const node of walk(this.documentElement)) {
      if (!node || typeof node !== "object") continue;
      if (node.nodeType !== 1) continue;
      if (node.id === want) return node;
      if (node.getAttribute && node.getAttribute("id") === want) return node;
    }
    return null;
  }
}

export function walk(node, out = []) {
  out.push(node);
  if (node && typeof node === "object" && Array.isArray(node.children)) {
    for (const c of node.children) walk(c, out);
  }
  return out;
}

export function nodesByTag(root, tagName) {
  const want = String(tagName).toLowerCase();
  return walk(root).filter((n) => n && typeof n === "object" && n.nodeType === 1 && n.tagName === want);
}

export function withFakeDom(fn, opts = {}) {
  const { document = new FakeDocument(), window = undefined } = opts;

  const prevDoc = globalThis.document;
  const prevWin = globalThis.window;
  globalThis.document = document;
  if (window !== undefined) globalThis.window = window;

  try {
    return fn({ document, window });
  } finally {
    globalThis.document = prevDoc;
    globalThis.window = prevWin;
  }
}

export function createFakeWindow() {
  let nextId = 1;
  const timers = new Map();

  const win = {
    setTimeout(fn) {
      const id = nextId++;
      timers.set(id, fn);
      return id;
    },
    clearTimeout(id) {
      timers.delete(id);
    },
  };

  return {
    window: win,
    runAllTimers() {
      const pending = Array.from(timers.entries());
      timers.clear();
      for (const [, fn] of pending) fn();
    },
    timerCount() {
      return timers.size;
    },
  };
}

