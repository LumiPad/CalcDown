---
title: Charts (CalcDown example)
calcdown: 1.0
---

# Charts

This example demonstrates:

- A **combo** chart (`bar` + `line` series in one card)
- An optional **area fill** for a single-series line chart

%% Data

``` data
name: projection
primaryKey: year
sortBy: year
columns:
  year: integer
  revenue: number
  ebitda: number
  net_income: number
---
{"ebitda":2,"net_income":1,"revenue":5,"year":2027}
{"ebitda":8,"net_income":4,"revenue":28,"year":2028}
{"ebitda":55,"net_income":32,"revenue":82,"year":2029}
{"ebitda":62,"net_income":24,"revenue":96,"year":2030}
{"ebitda":65,"net_income":26,"revenue":96,"year":2031}
```

%% Calc

``` calc
const cashflow = std.data.scan(
  projection,
  (state, row) => ({
    cash: state.cash + row.net_income,
    year: row.year,
  }),
  { seed: { cash: 0 } }
);
```

%% View

``` view
[
  {
    "id": "revenue_profit",
    "library": "calcdown",
    "source": "projection",
    "spec": {
      "kind": "combo",
      "title": "Revenue & Profitability",
      "x": {
        "key": "year",
        "label": "Year"
      },
      "y": [
        {
          "key": "revenue",
          "kind": "bar",
          "label": "Revenue"
        },
        {
          "key": "ebitda",
          "kind": "line",
          "label": "EBITDA"
        },
        {
          "key": "net_income",
          "kind": "line",
          "label": "Net income"
        }
      ]
    },
    "type": "chart"
  },
  {
    "id": "cash",
    "library": "calcdown",
    "source": "cashflow",
    "spec": {
      "kind": "line",
      "title": "Cumulative Cash Flow",
      "x": {
        "key": "year",
        "label": "Year"
      },
      "y": {
        "area": true,
        "key": "cash",
        "label": "Cash"
      }
    },
    "type": "chart"
  }
]
```
