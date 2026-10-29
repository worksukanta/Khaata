# Khaata — Standalone V1 ERD

Canonical field definitions, constraints, and business invariants are in [DATABASE_DESIGN.md](DATABASE_DESIGN.md). This diagram is conceptual and omits some columns for readability.

```mermaid
erDiagram
  USER ||--o{ BOOK : owns
  USER ||--o{ CATEGORY : owns
  USER ||--o{ PAYMENT_METHOD : owns
  USER ||--o{ BUDGET : owns
  BOOK ||--o{ TRANSACTION : contains
  CATEGORY o|--o{ TRANSACTION : category
  PAYMENT_METHOD o|--o{ TRANSACTION : method
  BOOK o|--o{ BUDGET : event_budget
  BUDGET ||--o{ BUDGET_ALLOCATION : has
  CATEGORY ||--o{ BUDGET_ALLOCATION : allocated_to
  USER { uuid id PK string email UK }
  BOOK { uuid id PK uuid owner_id FK string type int year int month }
  TRANSACTION { uuid id PK uuid book_id FK uuid category_id FK uuid payment_method_id FK decimal amount string type date transaction_date datetime deleted_at }
  CATEGORY { uuid id PK uuid owner_id FK string name string type }
  PAYMENT_METHOD { uuid id PK uuid owner_id FK string name }
  BUDGET { uuid id PK uuid owner_id FK uuid book_id FK string scope int year int month decimal total_limit }
  BUDGET_ALLOCATION { uuid id PK uuid budget_id FK uuid category_id FK decimal amount }
```
