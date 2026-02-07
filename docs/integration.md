# Integrating CalcDown (browser-first)

CalcDown is designed to be embedded into other tools (editors, Markdown renderers, note apps, etc.).

This repo provides a small, dependency-light “web integration” layer in `src/web/` (compiled to `dist/web/`) so integrators do not need to re-implement demo glue code.

## Minimal evaluation (no UI)

```ts
import { runCalcdown } from "../dist/web/index.js";

const markdown = `---\ncalcdown: 1.0\n---\n\n\`\`\`calc\nconst x = 1 + 2;\n\`\`\``;
const res = runCalcdown(markdown);

console.log(res.values.x); // 3
console.log(res.views);    // validated calcdown views (if any)
console.log(res.evalMessages);
```

## Rendering standardized views

If the document contains CalcDown `view` blocks (`library: "calcdown"`), you can render them as DOM:

```ts
import { runCalcdown, renderCalcdownViews } from "../dist/web/index.js";

const res = runCalcdown(markdown);
renderCalcdownViews({
  container: document.querySelector<HTMLElement>("#views")!,
  views: res.views,
  values: res.values,
});
```

## Value formatting (tables, cards, charts)

Many CalcDown views accept a `format` for values.

- `format: "percent"` formats numbers as **percent points** (e.g. `14.77` → `14.77%`).
- For **ratio** percentages (`0..1`), use `format: "percent01"` (e.g. `0.1477` → `14.77%`) or `format: { kind: "percent", scale: 100 }`.
- For currency formatting, use `format: { kind: "currency", currency: "USD" }` (explicit), or in the built-in web renderer use `format: "currency"` / `format: { kind: "currency" }` to infer the ISO code from declared CalcDown types.

Note: in the built-in web renderer, `format: "currency"` will try to infer the ISO currency code from declared CalcDown types (e.g. `Currency[USD]`) and propagate it through common derived expressions (arithmetic, `std.math.sum`, `std.table.map` outputs). If it can’t infer a code, it falls back to plain number formatting.

## Styling (optional)

The view renderer emits simple, stable class names (`view`, `view-title`, `cards`, `card`, etc.). For quick integrations, you can install a small default stylesheet:

```ts
import { installCalcdownStyles } from "../dist/web/index.js";

installCalcdownStyles();
```

The default stylesheet is scoped under `.calcdown-root` (so it should not leak onto the rest of your page). `mountCalcdown(...)` and `mountCalcdownDocument(...)` create this wrapper automatically. If you call `renderCalcdownViews(...)` directly, wrap your container:

```html
<div class="calcdown-root">
  <div id="views"></div>
</div>
```

### Theming via CSS variables

The default stylesheet uses CSS custom properties (theme tokens) defined on `.calcdown-root`. Override these to match your site’s theme without rewriting selectors:

```css
.calcdown-root {
  --calcdown-font-family: system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif;
  --calcdown-text: #0f172a;
  --calcdown-muted: #64748b;
  --calcdown-surface: #ffffff;
  --calcdown-view-bg: #fbfcff;
  --calcdown-border: #e2e8f0;
  --calcdown-border-strong: #cbd5e1;
  --calcdown-code-inline-bg: #f6f7fb;
  --calcdown-radius: 12px;

  /* Document rendering (`mountCalcdownDocument`) */
  --calcdown-doc-max-width: 980px; /* set to 100% for full-width */
}
```

If you want full control, don’t call `installCalcdownStyles()` and provide your own CSS targeting the emitted class names. (For reference, the shipped CSS string is exported as `CALCDOWN_BASE_CSS`.)

## Markdown-extension style (mount + cleanup)

For “Mermaid-style” integrations (render a fenced block to a DOM node and clean up later), use `mountCalcdown`:

```ts
import { mountCalcdown } from "../dist/web/index.js";

const el = document.querySelector<HTMLElement>("#preview")!;
const handle = mountCalcdown(el, markdown, { showMessages: false });

// Re-render when the source changes:
handle.update(nextMarkdown);

// Cleanup when the block is removed/unmounted:
handle.destroy();
```

## Rendering full documents (narrative + blocks)

If you want a standalone renderer that also renders the document’s Markdown narrative and inserts CalcDown blocks in-place, use `mountCalcdownDocument`:

```ts
import { mountCalcdownDocument } from "../dist/web/index.js";

mountCalcdownDocument(el, markdown, { showMessages: false });
```

Optional: pass `{ showSourceBlocks: true }` to also render `data` and `calc` blocks as code.

Note: the built-in narrative renderer is intentionally small (headings/paragraphs/lists/links/inline code) and treats these as “invisible” comments:

- Lines whose first non-whitespace characters are `%%` (Mermaid-style line comments)
- HTML comments `<!-- ... -->` (including multi-line)

## Table editing (optional)

If you provide `onEditTableCell`, CalcDown table views with `spec.editable: true` will render inputs and emit edit events.

You are responsible for applying the edit to your own state (in-memory overrides, or the 1.0 patcher) and calling `handle.update(...)` again.

## Inputs form helper

If you want a simple “inputs → recompute” loop:

```ts
import { parseProgram } from "../dist/index.js";
import { readInputOverrides, renderInputsForm, runCalcdown } from "../dist/web/index.js";

const parsed = parseProgram(markdown);
const inputsEl = document.querySelector<HTMLElement>("#inputs")!;
renderInputsForm({
  container: inputsEl,
  inputs: parsed.program.inputs,
  onChange: () => recompute(),
});

function recompute() {
  const overrides = readInputOverrides(inputsEl);
  const res = runCalcdown(markdown, { overrides });
  // render views, messages, etc.
}
```

## YAML `view` blocks

The parser accepts JSON or YAML for `view` blocks.

- In the static demos, this is enabled via an `importmap` mapping `"js-yaml"` to `node_modules/js-yaml/dist/js-yaml.mjs`.
- In a bundler setup, install and bundle `js-yaml` normally.

If you want to avoid YAML support, keep `view` blocks as JSON.

## Example page

See `docs/integration-example.html` for a copy/paste “drop this into any page” integration template.

## External data sources (browser)

For `data` blocks with `source: ...` and `hash: sha256:...`, you can load and verify external tables:

```ts
import { parseProgram } from "../dist/index.js";
import { loadExternalTables, runCalcdown } from "../dist/web/index.js";

const parsed = parseProgram(markdown);
const originUrl = location.href;
const external = await loadExternalTables(parsed.program.tables, originUrl);

const res = runCalcdown(markdown, { overrides: external.overrides });
```
