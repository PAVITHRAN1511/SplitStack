from services import (
    get_total_spending,
    get_category_spending,
    get_member_spending,
    get_monthly_spending,
)


expenses = [
    {
        "expense_id": 1,
        "user_id": 101,
        "group_id": 1,
        "amount": 500,
        "category": "Food",
        "expense_date": "2026-08-10",
    },
    {
        "expense_id": 2,
        "user_id": 102,
        "group_id": 1,
        "amount": 300,
        "category": "Travel",
        "expense_date": "2026-08-15",
    },
    {
        "expense_id": 3,
        "user_id": 101,
        "group_id": 1,
        "amount": 200,
        "category": "Food",
        "expense_date": "2026-09-02",
    },
]


print("Total:", get_total_spending(expenses))
print("Categories:", get_category_spending(expenses))
print("Members:", get_member_spending(expenses))
print("Monthly:", get_monthly_spending(expenses))