"""Free-tier limits and paid overage credits.

The billable unit is one structured note. A user draws first on their monthly
allowance (10 on free, 150 on a paid plan), and only when that is exhausted
does a purchased credit get spent. Nothing is charged for reading, searching,
or asking questions about notes already created.

``consume`` does the check and the decrement inside one immediate transaction
so two concurrent requests cannot both spend the last credit.
"""

import os
import time
from datetime import datetime, timezone

from dotenv import load_dotenv
from pydantic import BaseModel

from api.db import connect

# Same reason as db.py: these are read at import time, before the app's other
# modules get around to loading .env.
load_dotenv()

FREE_MONTHLY_NOTES = int(os.getenv("FREE_MONTHLY_NOTES", "10"))
PAID_MONTHLY_NOTES = int(os.getenv("PAID_MONTHLY_NOTES", "150"))

_PAID_STATUSES = ("active", "trialing")


class QuotaState(BaseModel):
    plan: str                # "free" | "founding" | "solo"
    period: str              # "YYYY-MM"
    allowance: int           # notes included in the plan this month
    used: int                # notes structured this month
    remaining_allowance: int
    credits: int             # purchased overage credits
    can_structure: bool
    reason: str | None = None


def current_period() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m")


def _plan_for(conn, email: str) -> str:
    row = conn.execute(
        "SELECT plan, status FROM subscriptions WHERE email = ?", (email,)
    ).fetchone()
    if row is None or row[1] not in _PAID_STATUSES:
        return "free"
    return row[0]


def _allowance_for(plan: str) -> int:
    return FREE_MONTHLY_NOTES if plan == "free" else PAID_MONTHLY_NOTES


def get_state(email: str) -> QuotaState:
    """Read-only snapshot — safe to call on every page load."""
    period = current_period()
    with connect() as conn:
        plan = _plan_for(conn, email)
        used = conn.execute(
            "SELECT used FROM usage_counters WHERE email = ? AND period = ?",
            (email, period),
        ).fetchone()
        used = used[0] if used else 0
        credits = conn.execute(
            "SELECT balance FROM credits WHERE email = ?", (email,)
        ).fetchone()
        credits = credits[0] if credits else 0

    allowance = _allowance_for(plan)
    remaining = max(0, allowance - used)
    can = remaining > 0 or credits > 0
    return QuotaState(
        plan=plan,
        period=period,
        allowance=allowance,
        used=used,
        remaining_allowance=remaining,
        credits=credits,
        can_structure=can,
        reason=None if can else "Monthly limit reached and no credits remaining.",
    )


class QuotaExceeded(Exception):
    """Raised by ``consume`` when the user has neither allowance nor credits."""

    def __init__(self, state: QuotaState):
        self.state = state
        super().__init__(state.reason or "Quota exceeded")


def consume(email: str, count: int = 1) -> QuotaState:
    """Spend one billable unit. Raises ``QuotaExceeded`` if there is nothing
    left to spend. Allowance is used before purchased credits."""
    period = current_period()
    with connect() as conn:
        # BEGIN IMMEDIATE takes the write lock up front, so the read-then-write
        # below cannot interleave with another request's.
        conn.execute("BEGIN IMMEDIATE")
        try:
            plan = _plan_for(conn, email)
            allowance = _allowance_for(plan)

            row = conn.execute(
                "SELECT used FROM usage_counters WHERE email = ? AND period = ?",
                (email, period),
            ).fetchone()
            used = row[0] if row else 0

            row = conn.execute(
                "SELECT balance FROM credits WHERE email = ?", (email,)
            ).fetchone()
            credits = row[0] if row else 0

            from_allowance = min(count, max(0, allowance - used))
            from_credits = count - from_allowance

            if from_credits > credits:
                conn.rollback()
                state = QuotaState(
                    plan=plan, period=period, allowance=allowance, used=used,
                    remaining_allowance=max(0, allowance - used), credits=credits,
                    can_structure=False,
                    reason="Monthly limit reached and no credits remaining.",
                )
                raise QuotaExceeded(state)

            # The counter always advances by the full amount so that "used this
            # month" reflects real usage; credits are tracked separately.
            conn.execute(
                """INSERT INTO usage_counters (email, period, used) VALUES (?, ?, ?)
                   ON CONFLICT(email, period) DO UPDATE SET used = used + ?""",
                (email, period, count, count),
            )
            if from_credits:
                conn.execute(
                    "UPDATE credits SET balance = balance - ? WHERE email = ?",
                    (from_credits, email),
                )
                conn.execute(
                    """INSERT INTO credit_ledger (email, delta, reason, stripe_ref, created_at)
                       VALUES (?, ?, ?, NULL, ?)""",
                    (email, -from_credits, "note_structured", time.time()),
                )
            conn.commit()
        except QuotaExceeded:
            raise
        except Exception:
            conn.rollback()
            raise

    return get_state(email)


def refund(email: str, count: int = 1) -> None:
    """Undo a ``consume`` when the work it paid for failed. Returns the unit to
    wherever it came from: the monthly counter first, then credits.

    Best-effort — a failed refund must never mask the original error, so this
    logs and swallows rather than raising.
    """
    period = current_period()
    try:
        with connect() as conn:
            conn.execute("BEGIN IMMEDIATE")
            try:
                row = conn.execute(
                    "SELECT used FROM usage_counters WHERE email = ? AND period = ?",
                    (email, period),
                ).fetchone()
                used = row[0] if row else 0
                if used <= 0:
                    conn.rollback()
                    return

                plan = _plan_for(conn, email)
                allowance = _allowance_for(plan)
                # If the counter had run past the allowance, this unit was paid
                # for with a credit, so the credit is what comes back.
                paid_with_credit = used > allowance

                conn.execute(
                    "UPDATE usage_counters SET used = MAX(0, used - ?) WHERE email = ? AND period = ?",
                    (count, email, period),
                )
                if paid_with_credit:
                    conn.execute(
                        """INSERT INTO credits (email, balance) VALUES (?, ?)
                           ON CONFLICT(email) DO UPDATE SET balance = balance + ?""",
                        (email, count, count),
                    )
                    conn.execute(
                        """INSERT INTO credit_ledger (email, delta, reason, stripe_ref, created_at)
                           VALUES (?, ?, ?, NULL, ?)""",
                        (email, count, "refund_failed_structure", time.time()),
                    )
                conn.commit()
            except Exception:
                conn.rollback()
                raise
    except Exception:  # pragma: no cover - defensive
        from loguru import logger

        logger.exception("Failed to refund usage for {}", email)


def add_credits(email: str, amount: int, reason: str, stripe_ref: str | None = None) -> int:
    """Grant purchased credits. Returns the new balance."""
    with connect() as conn:
        conn.execute("BEGIN IMMEDIATE")
        try:
            conn.execute(
                """INSERT INTO credits (email, balance) VALUES (?, ?)
                   ON CONFLICT(email) DO UPDATE SET balance = balance + ?""",
                (email, amount, amount),
            )
            conn.execute(
                """INSERT INTO credit_ledger (email, delta, reason, stripe_ref, created_at)
                   VALUES (?, ?, ?, ?, ?)""",
                (email, amount, reason, stripe_ref, time.time()),
            )
            row = conn.execute(
                "SELECT balance FROM credits WHERE email = ?", (email,)
            ).fetchone()
            conn.commit()
        except Exception:
            conn.rollback()
            raise
    return row[0] if row else 0


def already_processed(event_id: str) -> bool:
    """Webhook idempotency guard. Records the id and reports whether it had
    already been seen."""
    with connect() as conn:
        try:
            conn.execute(
                "INSERT INTO processed_events (event_id, created_at) VALUES (?, ?)",
                (event_id, time.time()),
            )
            conn.commit()
            return False
        except Exception:
            # Primary-key collision: this event was applied before.
            return True
