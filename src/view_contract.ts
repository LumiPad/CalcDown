/**
 * Purpose: Expose stable CalcDown view-contract APIs and schema types.
 * Intent: Keep the public module thin while internals remain modular.
 */

export { defaultLabelForKey } from "./view_contract_common.js";
export { validateViewsFromBlocks } from "./view_contract_validate.js";
export type {
  CalcdownViewType,
  ValueFormat,
  CardsViewSpecItem,
  CalcdownCardsView,
  ConditionalFormatPresetStyle,
  ConditionalFormatStyleObject,
  ConditionalFormatStyle,
  ConditionalFormatRule,
  TableViewColumn,
  CalcdownTableView,
  ChartAxisSpec,
  CalcdownChartView,
  LayoutItem,
  LayoutSpec,
  CalcdownLayoutView,
  CalcdownView,
} from "./view_contract_types.js";
