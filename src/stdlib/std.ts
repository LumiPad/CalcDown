/**
 * Purpose: Compose CalcDown std modules into the exported runtime surface.
 * Intent: Preserve existing std API while keeping implementation split and maintainable.
 */

import { createAssertModule } from "./std_assert.js";
import { createArrayModule } from "./std_array.js";
import { createDataModule } from "./std_data.js";
import { createDateModule } from "./std_date.js";
import { createFinanceModule } from "./std_finance.js";
import { createLogicModule } from "./std_logic.js";
import { createLookupModule } from "./std_lookup.js";
import { createMathModule } from "./std_math.js";
import { createStatsModule } from "./std_stats.js";
import { createTableModule } from "./std_table.js";
import { createTextModule } from "./std_text.js";
import { deepFreeze, makeModule, makeNowGetter, type StdRuntimeContext } from "./std_shared.js";

export type { StdRuntimeContext } from "./std_shared.js";

export function createStd(context?: StdRuntimeContext): Readonly<Record<string, unknown>> {
  const getNow = makeNowGetter(context);

  const data = createDataModule();
  const std = makeModule({
    math: createMathModule(),
    text: createTextModule(),
    logic: createLogicModule(),
    array: createArrayModule(),
    stats: createStatsModule(),
    data,
    table: createTableModule(data.sortBy),
    lookup: createLookupModule(),
    date: createDateModule(getNow),
    finance: createFinanceModule(),
    assert: createAssertModule(),
  });

  deepFreeze(std);
  return std;
}

export const std = createStd();

deepFreeze(std);
