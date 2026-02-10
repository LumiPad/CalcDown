---
title: CalcDown demo (projections via scan)
calcdown: 1.1
---

# Projections (scan)

This example demonstrates:

- Building a projection table with `std.data.scan` (no loops or array indexing)
- Deriving table rows with `std.table.map`

%% Inputs

``` inputs
start_year       : integer = 2027
years            : integer = 5 [min: 1, max: 25]
starting_revenue : number  = 28 [min: 0]
revenue_growth   : percent = 25.0 [min: -100, max: 200]
ebitda_margin    : percent = 30.0 [min: -100, max: 100]
tax_rate         : percent = 20.0 [min: 0, max: 100]
initial_cash     : number  = 0
```

%% Calc

``` calc
const growth = revenue_growth / 100;
const ebitda_pct = ebitda_margin / 100;
const tax_pct = tax_rate / 100;

const year_seq = std.data.sequence(years, { start: start_year, step: 1 });

const revenue_by_year = std.data.scan(
  year_seq,
  (state, year) => ({
    year: year,
    revenue: state.revenue * (1 + growth),
  }),
  { seed: { revenue: starting_revenue / (1 + growth) } }
);

const projection = std.table.map(revenue_by_year, (row) => ({
  year: row.year,
  revenue: row.revenue,
  ebitda: row.revenue * ebitda_pct,
  net_income: row.revenue * ebitda_pct * (1 - tax_pct),
}));

const cashflow = std.data.scan(
  projection,
  (state, row) => ({
    year: row.year,
    cash: state.cash + row.net_income,
  }),
  { seed: { cash: initial_cash } }
);

const final_revenue = std.data.last(projection).revenue;
const total_net_income = std.math.sum(projection.net_income);
const final_cash = std.data.last(cashflow).cash;
```

%% View

``` view
[
  {
    "id": "summary",
    "library": "calcdown",
    "spec": {
      "items": [
        {
          "format": "integer",
          "key": "start_year",
          "label": "Start year"
        },
        {
          "format": "integer",
          "key": "years",
          "label": "Years"
        },
        {
          "format": {
            "digits": 2,
            "kind": "number"
          },
          "key": "final_revenue",
          "label": "Final revenue"
        },
        {
          "format": {
            "digits": 2,
            "kind": "number"
          },
          "key": "total_net_income",
          "label": "Total net income"
        },
        {
          "format": {
            "digits": 2,
            "kind": "number"
          },
          "key": "final_cash",
          "label": "Final cash"
        }
      ],
      "title": "Summary"
    },
    "type": "cards"
  },
  {
    "id": "rev_profit",
    "library": "calcdown",
    "source": "projection",
    "spec": {
      "kind": "combo",
      "title": "Revenue & profitability",
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
      "title": "Cumulative cash",
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
  },
  {
    "id": "projection",
    "library": "calcdown",
    "source": "projection",
    "spec": {
      "columns": [
        {
          "format": "integer",
          "key": "year",
          "label": "Year"
        },
        {
          "format": {
            "digits": 2,
            "kind": "number"
          },
          "key": "revenue",
          "label": "Revenue"
        },
        {
          "format": {
            "digits": 2,
            "kind": "number"
          },
          "key": "ebitda",
          "label": "EBITDA"
        },
        {
          "conditionalFormat": [
            {
              "style": "negative",
              "when": "value < 0"
            },
            {
              "style": "positive",
              "when": "value > 0"
            }
          ],
          "format": {
            "digits": 2,
            "kind": "number"
          },
          "key": "net_income",
          "label": "Net income"
        }
      ],
      "title": "Projection"
    },
    "type": "table"
  },
  {
    "id": "main",
    "library": "calcdown",
    "spec": {
      "direction": "column",
      "items": [
        {
          "ref": "summary"
        },
        {
          "ref": "rev_profit"
        },
        {
          "ref": "cash"
        },
        {
          "ref": "projection"
        }
      ],
      "title": "Projections"
    },
    "type": "layout"
  }
]
```
