# Khaata — Clean Fintech Design System (KH-UX-003)

## Design principles
Calm, readable, trustworthy, fast. Light mode in V1. Emerald is the primary brand color, not the sole indicator of income/success. Financial data is legible at a glance.

## Color tokens (starting palette; verify WCAG contrast in implementation)
| Token | Hex | Usage |
|---|---|---|
| brand-700 | #047857 | primary actions, selected navigation |
| brand-600 | #059669 | decorative progress and accents |
| brand-50 | #ECFDF5 | subtle selected backgrounds |
| surface | #FFFFFF | cards, form surfaces |
| background | #F8FAFC | app canvas |
| text-primary | #0F172A | main copy and amounts |
| text-secondary | #475569 | descriptions and labels |
| border | #E2E8F0 | dividers and fields |
| success-text | #047857 | positive status text |
| danger-text | #B91C1C | overspending/error text |
| danger-bg | #FEF2F2 | warning panels |
| warning-text | #92400E | approaching limit |
| warning-bg | #FFFBEB | caution panels |

Never rely on red/green alone: pair with words, values and icons. Check exact text/background combinations using a contrast audit.

## Typography
Font stack: Inter (if bundled/available), system-ui, sans-serif. Base 16px; body 14–16px; caption 12–13px; screen title 24px mobile / 30px desktop; KPI amount 24–32px; tabular numerals for financial columns. Use clear weight hierarchy and adequate line height.

## Layout and responsive rules
- Base 4px spacing scale: 4, 8, 12, 16, 24, 32, 48.
- Mobile 320–767px: single column; 16px horizontal gutters; cards with 16px padding; 12–16px radius; bottom nav with safe-area inset; charts horizontally scroll only if essential.
- Tablet 768–1023px: 2-column card grid where space permits.
- Desktop >=1024px: left sidebar 240px, max content width 1200px, 2–3 column dashboard layout.
- Buttons and inputs min height 44px; destructive actions require confirmation; floating Add must not obscure content.

## Components
AppShell, BottomNav, Sidebar, MonthPicker, CurrencyAmount, KPIStatCard, BudgetProgress, BudgetWarning, BookCard, TransactionRow, CategoryChip, PaymentMethodSelect, MoneyInput, DateInput, FilterSheet, EmptyState, ErrorState, LoadingSkeleton, ConfirmDialog, Toast, ChartLegend, CSVExportAction.

## Visual semantics
Income amount: plus sign and explicit Income label; expense: minus sign and Expense label. Net cash flow can be negative. Progress fill capped at 100% visually but label shows real utilization (e.g. 124%). Zero-limit with spending: 'Unbudgeted spending', not infinity. Charts have textual summary and accessible table alternative.

## Forms
One primary CTA per form. Field-level error immediately after submit and on blur where appropriate. Amount-first entry uses decimal keypad on mobile. Category/method/description optional. Preserve form data on network errors. Provide visible loading, disabled duplicate submit, and keyboard-friendly focus behavior.
