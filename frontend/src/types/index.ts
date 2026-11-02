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
  is_active: boolean
}

export interface PaymentMethod {
  id: string
  name: string
  is_active: boolean
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

// ---------------------------------------------------------------------------
// Budget types
// ---------------------------------------------------------------------------

export type BudgetScope = 'MONTHLY_OVERALL' | 'EVENT'
export type BudgetStatus = 'ON_TRACK' | 'NEAR_LIMIT' | 'OVER_BUDGET' | 'UNBUDGETED_SPENDING' | 'NOT_SET'
