/**
 * Purpose: Validate parsed CalcDown views into normalized contract structures.
 * Intent: Keep per-view schema checks isolated by view type.
 */

import type { CalcdownMessage } from "./types.js";
import { ParsedView } from "./views.js";
import { parseExpression } from "./calcscript/parser.js";
import { asString, bannedKeys, defaultLabelForKey, err, isPlainObject, sanitizeId } from "./view_contract_common.js";
import { validateFormat } from "./view_contract_format.js";
import type {
  CalcdownCardsView,
  CalcdownChartView,
  CalcdownLayoutView,
  CalcdownTableView,
  CalcdownView,
  ChartAxisSpec,
  ConditionalFormatPresetStyle,
  ConditionalFormatRule,
  ConditionalFormatStyle,
  ConditionalFormatStyleObject,
  LayoutItem,
  LayoutSpec,
  TableViewColumn,
} from "./view_contract_types.js";

function validateCardsView(view: ParsedView, messages: CalcdownMessage[]): CalcdownCardsView | null {
  const line = view.line;
  const id = view.id ? sanitizeId(view.id) : null;
  if (!id) {
    err(messages, line, "CD_VIEW_SCHEMA_MISSING_ID", "cards view is missing required field: id");
    return null;
  }
  const specRaw = view.spec;
  if (!isPlainObject(specRaw)) {
    err(messages, line, "CD_VIEW_SCHEMA_MISSING_SPEC", "cards view is missing required object: spec");
    return null;
  }

  const title = asString(specRaw.title) ?? undefined;
  const itemsRaw = specRaw.items;
  if (!Array.isArray(itemsRaw)) {
    err(messages, line, "CD_VIEW_CARDS_ITEMS_ARRAY", "cards.spec.items must be an array");
    return null;
  }

  const items = [];
  for (const it of itemsRaw) {
    if (!isPlainObject(it)) continue;
    const key = asString(it.key);
    if (!key) continue;
    const label = asString(it.label) ?? defaultLabelForKey(key);
    const format = validateFormat(it.format, line, messages) ?? undefined;
    items.push(Object.assign(Object.create(null), { key, label, ...(format ? { format } : {}) }));
  }

  if (items.length === 0) {
    err(messages, line, "CD_VIEW_CARDS_ITEMS_EMPTY", "cards.spec.items must include at least one item with a string 'key'");
    return null;
  }

  return {
    id,
    type: "cards",
    library: "calcdown",
    spec: Object.assign(Object.create(null), { ...(title ? { title } : {}), items }),
    line,
  };
}

function validateTableColumns(raw: unknown, line: number, messages: CalcdownMessage[]): TableViewColumn[] | null {
  if (raw === undefined) return null;
  if (!Array.isArray(raw)) return null;
  const cols: TableViewColumn[] = [];

  const validateConditionalStyle = (styleRaw: unknown): ConditionalFormatStyle | null => {
    if (typeof styleRaw === "string") {
      const preset =
        styleRaw === "positive" ||
        styleRaw === "negative" ||
        styleRaw === "neutral" ||
        styleRaw === "warning" ||
        styleRaw === "highlight"
          ? (styleRaw as ConditionalFormatPresetStyle)
          : null;
      if (!preset) {
        err(messages, line, "CD_VIEW_TABLE_CONDFORM_STYLE", "conditionalFormat.style must be a supported preset or style object");
        return null;
      }
      return preset;
    }

    if (!isPlainObject(styleRaw)) {
      err(messages, line, "CD_VIEW_TABLE_CONDFORM_STYLE", "conditionalFormat.style must be a supported preset or style object");
      return null;
    }

    const allowedKeys = new Set(["color", "backgroundColor", "fontWeight"]);
    const out: ConditionalFormatStyleObject = Object.create(null);
    for (const key of Object.keys(styleRaw)) {
      if (!allowedKeys.has(key)) {
        err(messages, line, "CD_VIEW_TABLE_CONDFORM_STYLE", `Unsupported conditionalFormat.style key: ${key}`);
        continue;
      }
      const val = asString(styleRaw[key]);
      if (!val) {
        err(messages, line, "CD_VIEW_TABLE_CONDFORM_STYLE", `conditionalFormat.style.${key} must be a non-empty string`);
        continue;
      }
      (out as Record<string, string>)[key] = val;
    }

    if (Object.keys(out).length === 0) {
      err(messages, line, "CD_VIEW_TABLE_CONDFORM_STYLE", "conditionalFormat.style object must include at least one supported property");
      return null;
    }
    return out;
  };

  const validateConditionalFormat = (cfRaw: unknown): ConditionalFormatRule[] | null => {
    if (cfRaw === undefined) return null;
    if (!Array.isArray(cfRaw)) {
      err(messages, line, "CD_VIEW_TABLE_CONDFORM_ARRAY", "conditionalFormat must be an array");
      return null;
    }
    const rules: ConditionalFormatRule[] = [];
    for (const ruleRaw of cfRaw) {
      if (!isPlainObject(ruleRaw)) {
        err(messages, line, "CD_VIEW_TABLE_CONDFORM_RULE", "conditionalFormat rules must be objects");
        continue;
      }
      const when = asString(ruleRaw.when);
      if (!when) {
        err(messages, line, "CD_VIEW_TABLE_CONDFORM_WHEN", "conditionalFormat.when must be a non-empty string");
        continue;
      }
      try {
        parseExpression(when);
      } catch (e) {
        err(messages, line, "CD_VIEW_TABLE_CONDFORM_WHEN", e instanceof Error ? e.message : "Invalid conditionalFormat.when expression");
        continue;
      }

      const style = validateConditionalStyle(ruleRaw.style);
      if (!style) continue;
      rules.push(Object.assign(Object.create(null), { when, style }));
    }
    return rules.length ? rules : null;
  };

  for (const c of raw) {
    if (!isPlainObject(c)) continue;
    const key = asString(c.key);
    if (!key) continue;
    if (bannedKeys.has(key)) {
      err(messages, line, "CD_VIEW_SCHEMA_DISALLOWED_KEY", `Disallowed column key: ${key}`);
      continue;
    }
    const label = asString(c.label) ?? defaultLabelForKey(key);
    const format = validateFormat(c.format, line, messages) ?? undefined;
    const conditionalFormat = validateConditionalFormat(c.conditionalFormat) ?? undefined;
    cols.push(Object.assign(Object.create(null), { key, label, ...(format ? { format } : {}), ...(conditionalFormat ? { conditionalFormat } : {}) }));
  }
  return cols.length ? cols : null;
}

function validateTableView(view: ParsedView, messages: CalcdownMessage[]): CalcdownTableView | null {
  const line = view.line;
  const id = view.id ? sanitizeId(view.id) : null;
  if (!id) {
    err(messages, line, "CD_VIEW_SCHEMA_MISSING_ID", "table view is missing required field: id");
    return null;
  }
  const source = view.source ? view.source.trim() : null;
  if (!source) {
    err(messages, line, "CD_VIEW_SCHEMA_MISSING_SOURCE", "table view is missing required field: source");
    return null;
  }
  const specRaw = view.spec;
  if (!isPlainObject(specRaw)) {
    err(messages, line, "CD_VIEW_SCHEMA_MISSING_SPEC", "table view is missing required object: spec");
    return null;
  }

  const title = asString(specRaw.title) ?? undefined;
  const columns = validateTableColumns(specRaw.columns, line, messages) ?? undefined;
  const editable = typeof specRaw.editable === "boolean" ? specRaw.editable : false;
  const limit =
    typeof specRaw.limit === "number" &&
    Number.isFinite(specRaw.limit) &&
    Number.isInteger(specRaw.limit) &&
    specRaw.limit >= 0
      ? specRaw.limit
      : undefined;

  return {
    id,
    type: "table",
    library: "calcdown",
    source,
    spec: Object.assign(Object.create(null), {
      ...(title ? { title } : {}),
      ...(columns ? { columns } : {}),
      editable,
      ...(limit !== undefined ? { limit } : {}),
    }),
    line,
  };
}

function validateAxisSpec(raw: unknown, line: number, messages: CalcdownMessage[]): ChartAxisSpec | null {
  if (!isPlainObject(raw)) return null;
  const key = asString(raw.key);
  if (!key) return null;
  if (bannedKeys.has(key)) {
    err(messages, line, "CD_VIEW_SCHEMA_DISALLOWED_KEY", `Disallowed axis key: ${key}`);
    return null;
  }
  const label = asString(raw.label) ?? defaultLabelForKey(key);
  const format = validateFormat(raw.format, line, messages) ?? undefined;

  const hasKind = Object.prototype.hasOwnProperty.call(raw, "kind");
  const kindRaw = hasKind ? asString(raw.kind) : null;
  const kind = kindRaw === "line" ? "line" : kindRaw === "bar" || kindRaw === "column" ? "bar" : null;
  if (hasKind && !kind) {
    err(messages, line, "CD_VIEW_CHART_SERIES_KIND", "chart axis spec kind must be 'line' or 'bar'");
    return null;
  }

  const hasArea = Object.prototype.hasOwnProperty.call(raw, "area");
  const areaRaw = hasArea ? raw.area : undefined;
  if (hasArea && typeof areaRaw !== "boolean") {
    err(messages, line, "CD_VIEW_CHART_SERIES_AREA", "chart axis spec area must be a boolean");
    return null;
  }

  return Object.assign(Object.create(null), {
    key,
    label,
    ...(format ? { format } : {}),
    ...(kind ? { kind } : {}),
    ...(areaRaw === true ? { area: true } : {}),
  });
}

function validateAxisSpecList(raw: unknown, line: number, messages: CalcdownMessage[]): ChartAxisSpec[] | null {
  if (!Array.isArray(raw)) return null;
  const out: ChartAxisSpec[] = [];
  for (const item of raw) {
    const axis = validateAxisSpec(item, line, messages);
    if (axis) out.push(axis);
  }
  return out.length ? out : null;
}

function validateChartView(view: ParsedView, messages: CalcdownMessage[]): CalcdownChartView | null {
  const line = view.line;
  const id = view.id ? sanitizeId(view.id) : null;
  if (!id) {
    err(messages, line, "CD_VIEW_SCHEMA_MISSING_ID", "chart view is missing required field: id");
    return null;
  }
  const source = view.source ? view.source.trim() : null;
  if (!source) {
    err(messages, line, "CD_VIEW_SCHEMA_MISSING_SOURCE", "chart view is missing required field: source");
    return null;
  }
  const specRaw = view.spec;
  if (!isPlainObject(specRaw)) {
    err(messages, line, "CD_VIEW_SCHEMA_MISSING_SPEC", "chart view is missing required object: spec");
    return null;
  }

  const title = asString(specRaw.title) ?? undefined;
  const kindRaw = asString(specRaw.kind);
  const kind =
    kindRaw === "line"
      ? "line"
      : kindRaw === "bar" || kindRaw === "column"
        ? "bar"
        : kindRaw === "combo"
          ? "combo"
          : null;
  if (!kind) {
    err(messages, line, "CD_VIEW_CHART_KIND", "chart.spec.kind must be 'line', 'bar', or 'combo'");
    return null;
  }

  const x = validateAxisSpec(specRaw.x, line, messages);
  const yList = validateAxisSpecList(specRaw.y, line, messages);
  const y = yList ?? validateAxisSpec(specRaw.y, line, messages);
  if (!x || !y) {
    err(
      messages,
      line,
      "CD_VIEW_CHART_AXES",
      "chart.spec.x is required (object with string 'key'); chart.spec.y is required (object with string 'key' or array of such objects)"
    );
    return null;
  }

  if (kind === "combo" && (!yList || yList.length < 2)) {
    err(messages, line, "CD_VIEW_CHART_COMBO", "chart.spec.kind='combo' requires chart.spec.y to be an array with at least 2 series");
    return null;
  }

  return {
    id,
    type: "chart",
    library: "calcdown",
    source,
    spec: Object.assign(Object.create(null), { ...(title ? { title } : {}), kind, x, y }),
    line,
  };
}

function validateLayoutSpec(raw: unknown, line: number, messages: CalcdownMessage[]): LayoutSpec | null {
  if (!isPlainObject(raw)) return null;

  const title = asString(raw.title) ?? undefined;
  const directionRaw = asString(raw.direction);
  const direction = directionRaw === "row" || directionRaw === "column" ? directionRaw : "column";

  const itemsRaw = raw.items;
  if (!Array.isArray(itemsRaw)) return null;

  const items: LayoutItem[] = [];
  for (const it of itemsRaw) {
    if (!isPlainObject(it)) continue;
    const ref = asString(it.ref);
    if (ref) {
      items.push({ kind: "ref", ref });
      continue;
    }
    const nested = validateLayoutSpec(it, line, messages);
    if (nested) items.push({ kind: "layout", spec: nested });
  }

  if (items.length === 0) {
    err(messages, line, "CD_VIEW_LAYOUT_ITEMS", "layout.spec.items must include at least one {ref} entry (or nested layout object)");
    return null;
  }

  return Object.assign(Object.create(null), { ...(title ? { title } : {}), direction, items });
}

function validateLayoutView(view: ParsedView, messages: CalcdownMessage[]): CalcdownLayoutView | null {
  const line = view.line;
  const id = view.id ? sanitizeId(view.id) : null;
  if (!id) {
    err(messages, line, "CD_VIEW_SCHEMA_MISSING_ID", "layout view is missing required field: id");
    return null;
  }
  const spec = validateLayoutSpec(view.spec, line, messages);
  if (!spec) {
    err(messages, line, "CD_VIEW_SCHEMA_MISSING_SPEC", "layout view is missing required object: spec");
    return null;
  }
  return { id, type: "layout", library: "calcdown", spec, line };
}

export function validateCalcdownParsedView(view: ParsedView, messages: CalcdownMessage[]): CalcdownView | null {
  const type = view.type ? view.type.trim() : null;
  if (!type || (type !== "cards" && type !== "table" && type !== "chart" && type !== "layout")) {
    err(messages, view.line, "CD_VIEW_UNKNOWN_TYPE", `Unknown calcdown view type: ${type ?? "(missing)"}`);
    return null;
  }

  if (type === "cards") return validateCardsView(view, messages);
  if (type === "table") return validateTableView(view, messages);
  if (type === "chart") return validateChartView(view, messages);
  return validateLayoutView(view, messages);
}
