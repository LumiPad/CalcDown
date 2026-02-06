/**
 * Purpose: Provide stable exports for CalcDown data-block parsing utilities.
 * Intent: Keep call sites unchanged while internals live in focused modules.
 */

export { parseDataBlock } from "./data_parse.js";
export { coerceRowsToTable } from "./data_rows.js";
