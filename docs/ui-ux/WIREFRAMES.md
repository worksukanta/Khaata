# Khaata — Mobile-first Wireframes (KH-UX-004)

These are structural low-fidelity wireframes, not final visual mockups. Target 360–390px mobile width; reflow to 320px without horizontal page scrolling.

## WF-01 Home — combined monthly
```text
┌────────────────────────────────┐
│ Khaata                 [Avatar]│
│ [<] October 2026 [>]           │
│ Combined monthly overview      │
│ ┌─────────────┬──────────────┐ │
│ │ Income      │ Expenses     │ │
│ │ ₹40,000     │ ₹17,000      │ │
│ └─────────────┴──────────────┘ │
│ Net cash flow     ₹23,000      │
│ ┌────────────────────────────┐ │
│ │ Monthly budget  ₹17k / 20k │ │
│ │ █████████████░░  85%       │ │
│ │ ₹3,000 remaining           │ │
│ └────────────────────────────┘ │
│ Expense by book type           │
│ Monthly ₹12k | Events ₹5k      │
│ General ₹0                    │
│ Spending by category [Chart]  │
│ Recent transactions [See all] │
│ Food - ₹250  Durga Puja - ₹500 │
├────────────────────────────────┤
│ Home  Books  [+]  Budgets Report│
└────────────────────────────────┘
```

## WF-02 Books
```text
┌────────────────────────────────┐
│ My Books             [+ Create]│
│ [Search books...             ] │
│ Monthly                       │
│ [October 2026  >]             │
│ [September 2026 >]            │
│ Events                        │
│ [Durga Puja 2026 >]           │
│ [Darjeeling Trip >]           │
│ General                       │
│ [Personal Misc >]             │
│ [Show archived]               │
├────────────────────────────────┤
│ Home  Books  [+]  Budgets Report│
└────────────────────────────────┘
```

## WF-03 Book detail
```text
┌────────────────────────────────┐
│ [Back] Durga Puja 2026   [...] │
│ Event book                    │
│ Income ₹0 | Expense ₹5,000     │
│ Net -₹5,000                   │
│ [Event budget status]         │
│ [Search] [Filter]             │
│ Today                        │
│  Food - Snacks       -₹250    │
│  Shopping           -₹1,200   │
│ [ + Add transaction ]         │
└────────────────────────────────┘
```

## WF-04 Quick add
```text
┌────────────────────────────────┐
│ [X] Add transaction           │
│ [Expense] [Income]            │
│             ₹ [250.00]        │
│ Book [October 2026       v]   │
│ Date [27 Oct 2026        v]   │
│ [More details v]              │
│   Category [Food         v]   │
│   Payment  [UPI          v]   │
│   Notes    [             ]    │
│ [Over budget? warning here]   │
│ [ Save transaction          ] │
└────────────────────────────────┘
```

## WF-05 Budgets
```text
┌────────────────────────────────┐
│ Budgets  [< October 2026 >]    │
│ Overall monthly budget        │
│ ₹17,000 spent / ₹20,000       │
│ █████████████░░ 85%           │
│ [Edit overall budget]         │
│ Food       ₹5,500 / ₹5,000    │
│ ███████████████ 110% OVER     │
│ Gym        ₹1,500 / ₹1,500    │
│ ███████████████ 100%          │
│ Uncategorised ₹200            │
│ [Event budgets >]             │
└────────────────────────────────┘
```

## WF-06 Reports
```text
┌────────────────────────────────┐
│ Reports  [October 2026 v]     │
│ [Filter] [Export CSV]          │
│ Combined income  ₹40,000      │
│ Combined expense ₹17,000      │
│ Net cash flow    ₹23,000      │
│ By book type [chart + values] │
│ By category  [chart + values] │
│ Transaction summary [rows]    │
└────────────────────────────────┘
```

## Desktop composition
Sidebar on left (Home, Books, Add, Budgets, Reports, Settings). Home: KPI row (3 cards); main column budget + category chart; secondary column book-type breakdown + recent entries. Books: filter/search header + responsive grid; transaction detail: two-column summary and list; forms centered at comfortable max width (480–560px). Do not stretch transaction forms across full desktop width.
