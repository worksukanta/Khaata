/**
 * Khaata shared type definitions.
 * Keep domain types aligned with API_CONTRACT.md (KH-API-001 v1.0).
 */

// ---------------------------------------------------------------------------
// Auth / User
// ---------------------------------------------------------------------------

export interface User {
  id: string
  email: string
  display_name: string
  timezone: string
}

// ---------------------------------------------------------------------------
// API response envelope shapes
// ---------------------------------------------------------------------------

export interface ApiError {
  error: {
    code: string
    message: string
    details?: Record<string, string[]>
  }
}

export interface PaginatedResponse<T> {
  count: number
  next: string | null
  previous: string | null
  results: T[]
}

// ---------------------------------------------------------------------------
// Book types
// ---------------------------------------------------------------------------

export type BookType = 'MONTHLY' | 'EVENT' | 'GENERAL'

export interface Book {
  id: string
  type: BookType
  name: string
  description?: string | null
  year?: number | null
  month?: number | null
  start_date?: string | null
  end_date?: string | null
  opening_balance: string
  is_archived: boolean
  created_at: string
  updated_at: string
}

/** Book types that users may create and edit directly (API_CONTRACT.md §3). */
export type ManagedBookType = Exclude<BookType, 'MONTHLY'>

export type BookOrdering = 'name' | '-name' | 'created_at' | '-created_at'

/** Query parameters supported by GET /books/. */
export interface BookListParams {
  type?: BookType
  search?: string
  is_archived?: boolean
  ordering?: BookOrdering
  page?: number
}

/** Body for POST /books/ (EVENT or GENERAL only). */
export interface CreateBookPayload {
  type: ManagedBookType
  name: string
  description?: string
  start_date?: string | null
  end_date?: string | null
}

/** Body for PATCH /books/{id}/ — only editable metadata. */
export interface UpdateBookPayload {
  name?: string
  description?: string
  start_date?: string | null
  end_date?: string | null
}

/** Result of POST /books/monthly/{year}/{month}/ensure/ (201 = created, 200 = existing). */
export interface EnsureMonthlyBookResult {
  book: Book
  created: boolean
}

// ---------------------------------------------------------------------------
// Transaction types
// ---------------------------------------------------------------------------

export type TransactionType = 'INCOME' | 'EXPENSE'

export interface Category {
  id: string
  name: string
  type: TransactionType
  is_default?: boolean
  is_active: boolean
  created_at?: string
  updated_at?: string
}

export interface PaymentMethod {
  id: string
  name: string
  is_active: boolean
  created_at?: string
  updated_at?: string
}

export interface Transaction {
  id: string
  book_id: string
  type: TransactionType
  amount: string
  transaction_date: string
  category: Pick<Category, 'id' | 'name' | 'type'> | null
  payment_method: Pick<PaymentMethod, 'id' | 'name'> | null
  description: string | null
  created_at: string
  updated_at: string
}

export type TransactionOrdering =
  | 'transaction_date'
  | '-transaction_date'
  | 'amount'
  | '-amount'
  | 'created_at'
  | '-created_at'

export interface TransactionListParams {
  book_id?: string
  type?: TransactionType
  category_id?: string
  payment_method_id?: string
  date_from?: string
  date_to?: string
  search?: string
  ordering?: TransactionOrdering
  page?: number
}

export interface CreateTransactionPayload {
  book_id: string
  type: TransactionType
  amount: string
  transaction_date: string
  category_id?: string | null
  payment_method_id?: string | null
  description?: string | null
}

export interface UpdateTransactionPayload {
  book_id?: string
  type?: TransactionType
  amount?: string
  transaction_date?: string
  category_id?: string | null
  payment_method_id?: string | null
  description?: string | null
}

export interface CategoryListParams {
  type?: TransactionType
  is_active?: boolean
  search?: string
  page?: number
}

export interface PaymentMethodListParams {
  is_active?: boolean
  search?: string
  page?: number
}

// ---------------------------------------------------------------------------
// Budget types
// ---------------------------------------------------------------------------

export type BudgetScope = 'MONTHLY_OVERALL' | 'EVENT'
export type BudgetStatus = 'ON_TRACK' | 'NEAR_LIMIT' | 'OVER_BUDGET' | 'UNBUDGETED_SPENDING' | 'NOT_SET'
/** Statuses produced by the budget endpoints (`NOT_SET` is report-only). */
export type BudgetFigureStatus = Exclude<BudgetStatus, 'NOT_SET'>

/** One category allocation inside a Budget (openapi.yaml BudgetAllocation). */
export interface BudgetAllocation {
  category: { id: string; name: string; type: 'EXPENSE'; is_active: boolean }
  amount: string
  spent: string
  /** Signed decimal string; negative when overspent. */
  remaining: string
  utilization_percent: string | null
  status: BudgetFigureStatus
}

/** Budget with server-derived figures (openapi.yaml Budget). Money values are decimal strings. */
export interface Budget {
  id: string
  scope: BudgetScope
  book_id: string | null
  year: number | null
  month: number | null
  total_limit: string
  allocations: BudgetAllocation[]
  allocated_total: string
  unallocated: string
  spent: string
  /** Signed decimal string; negative when overspent. */
  remaining: string
  /** `null` only for UNBUDGETED_SPENDING. */
  utilization_percent: string | null
  status: BudgetFigureStatus
  unallocated_spent: string
  uncategorised_spent: string
  created_at: string
  updated_at: string
}

/** Query parameters supported by GET /budgets/. */
export interface BudgetListParams {
  scope?: BudgetScope
  year?: number
  month?: number
  book_id?: string
  page?: number
}

/** Body for POST /budgets/. */
export type CreateBudgetPayload =
  | { scope: 'MONTHLY_OVERALL'; year: number; month: number; total_limit: string }
  | { scope: 'EVENT'; book_id: string; total_limit: string }

/** Body for PATCH /budgets/{id}/ (only the limit is edited by the UI). */
export interface UpdateBudgetPayload {
  total_limit?: string
}

/** One item of PUT /budgets/{id}/allocations/. */
export interface AllocationInput {
  category_id: string
  amount: string
}

// ---------------------------------------------------------------------------
// Report types (openapi.yaml MonthlyReport / BudgetUtilizationReport)
// ---------------------------------------------------------------------------

export interface ReportPeriod {
  year: number
  month: number
}

export interface BookTypeBreakdownItem {
  book_type: BookType
  income: string
  expenses: string
}

export interface CategoryBreakdownItem {
  /** `null` for uncategorised expenses. */
  category_id: string | null
  category_name: string
  total: string
}

/** Monthly overall budget summary; every figure is null when `status` is NOT_SET. */
export interface MonthlyReportBudget {
  total_limit: string | null
  spent: string | null
  remaining: string | null
  utilization_percent: string | null
  status: BudgetStatus
}

export interface MonthlyReport {
  period: ReportPeriod
  currency: 'INR'
  income_total: string
  expense_total: string
  /** Signed decimal string; negative when expenses exceed income. */
  net_cash_flow: string
  book_type_breakdown: BookTypeBreakdownItem[]
  category_breakdown: CategoryBreakdownItem[]
  budget: MonthlyReportBudget
  recent_transactions: Transaction[]
}

export interface BudgetUtilizationReport {
  period: ReportPeriod
  budget: Budget | null
}

/** Book summary embedded in GET /reports/books/{id}/ (openapi.yaml BookReport). */
export interface BookReportBook {
  id: string
  type: BookType
  name: string
  is_archived: boolean
}

/** Book-scoped totals over all active transactions of one owned book (any date). */
export interface BookReport {
  book: BookReportBook
  income_total: string
  expense_total: string
  /** Signed decimal string; negative when expenses exceed income. */
  net_cash_flow: string
  /** opening_balance + income_total - expense_total; signed decimal string. */
  closing_balance: string
  category_breakdown: CategoryBreakdownItem[]
  /** Event budget for EVENT books; always null for MONTHLY/GENERAL or when absent. */
  budget: Budget | null
}

/**
 * Query parameters of GET /exports/transactions.csv — the transaction list
 * filters without `ordering` and `page` (the export is unpaginated and has a
 * fixed ordering).
 */
export type TransactionExportParams = Omit<TransactionListParams, 'ordering' | 'page'>
