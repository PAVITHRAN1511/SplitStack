from collections import defaultdict
from decimal import Decimal


def get_total_spending(expenses):
    """Calculate total spending from a list of expenses."""
    return sum(
        (Decimal(str(expense["amount"])) for expense in expenses),
        Decimal("0")
    )


def get_category_spending(expenses):
    """Calculate total spending for each category."""
    category_totals = defaultdict(Decimal)

    for expense in expenses:
        category_totals[expense["category"]] += Decimal(
            str(expense["amount"])
        )

    return dict(category_totals)


def get_member_spending(expenses):
    """Calculate total spending for each user."""
    member_totals = defaultdict(Decimal)

    for expense in expenses:
        member_totals[expense["user_id"]] += Decimal(
            str(expense["amount"])
        )

    return dict(member_totals)


def get_monthly_spending(expenses):
    """Calculate total spending for each month."""
    monthly_totals = defaultdict(Decimal)

    for expense in expenses:
        month = expense["expense_date"][:7]
        monthly_totals[month] += Decimal(
            str(expense["amount"])
        )

    return dict(monthly_totals)