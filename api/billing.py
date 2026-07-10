"""Stripe billing for founding-customer subscriptions.

Dormant until STRIPE_SECRET_KEY is set in .env — every endpoint except
/billing/config returns 503 before that, and the frontend hides billing UI
entirely. The app itself is never gated: design partners stay free; checkout
is an opt-in upgrade.

Subscription state is stored in a local SQLite file (billing.db) keyed by the
same email used as X-User-Id, so no auth changes are needed. Two paths keep it
in sync: /billing/confirm (called by the frontend after redirect back from
Checkout — works with zero webhook setup) and /billing/webhook (authoritative
once a webhook endpoint is configured in the Stripe dashboard).
"""

import os
import sqlite3
import time
from pathlib import Path

from fastapi import APIRouter, Header, HTTPException, Request
from loguru import logger
from pydantic import BaseModel

router = APIRouter(prefix="/billing", tags=["billing"])

_DB_PATH = Path(os.getenv("BILLING_DB", "billing.db"))
_FRONTEND_URL = os.getenv("FRONTEND_URL", "http://localhost:3000")

# Amounts in cents. Founding price is reserved for design partners.
PLANS = {
    "founding": {"label": "ScribeAI — Founding partner", "amount": 3900},
    "solo": {"label": "ScribeAI — Solo", "amount": 4900},
}


def _get_user_email(x_user_id: str = Header("anonymous", alias="X-User-Id")) -> str:
    return x_user_id or "anonymous"


def _stripe():
    key = os.getenv("STRIPE_SECRET_KEY", "")
    if not key:
        raise HTTPException(status_code=503, detail="Billing not configured")
    import stripe

    stripe.api_key = key
    return stripe


def _db() -> sqlite3.Connection:
    conn = sqlite3.connect(_DB_PATH)
    conn.execute(
        """CREATE TABLE IF NOT EXISTS subscriptions (
            email TEXT PRIMARY KEY,
            plan TEXT NOT NULL,
            stripe_customer_id TEXT,
            stripe_subscription_id TEXT,
            status TEXT NOT NULL,
            updated_at REAL NOT NULL
        )"""
    )
    return conn


def _upsert_subscription(email: str, plan: str, customer_id: str | None,
                         subscription_id: str | None, status: str) -> None:
    with _db() as conn:
        conn.execute(
            """INSERT INTO subscriptions (email, plan, stripe_customer_id,
                   stripe_subscription_id, status, updated_at)
               VALUES (?, ?, ?, ?, ?, ?)
               ON CONFLICT(email) DO UPDATE SET
                   plan=excluded.plan,
                   stripe_customer_id=excluded.stripe_customer_id,
                   stripe_subscription_id=excluded.stripe_subscription_id,
                   status=excluded.status,
                   updated_at=excluded.updated_at""",
            (email, plan, customer_id, subscription_id, status, time.time()),
        )


def _get_subscription(email: str) -> dict | None:
    with _db() as conn:
        row = conn.execute(
            "SELECT plan, status, updated_at FROM subscriptions WHERE email = ?",
            (email,),
        ).fetchone()
    if row is None:
        return None
    return {"plan": row[0], "status": row[1], "updated_at": row[2]}


@router.get("/config")
def config() -> dict:
    return {
        "enabled": bool(os.getenv("STRIPE_SECRET_KEY", "")),
        "plans": {k: {"label": v["label"], "amount": v["amount"]} for k, v in PLANS.items()},
    }


class CheckoutRequest(BaseModel):
    plan: str = "founding"


@router.post("/checkout")
def create_checkout(req: CheckoutRequest, email: str = Header("anonymous", alias="X-User-Id")) -> dict:
    if req.plan not in PLANS:
        raise HTTPException(status_code=400, detail=f"Unknown plan {req.plan!r}")
    if not email or email == "anonymous":
        raise HTTPException(status_code=400, detail="Sign in before subscribing")
    stripe = _stripe()
    plan = PLANS[req.plan]
    try:
        session = stripe.checkout.Session.create(
            mode="subscription",
            customer_email=email,
            line_items=[{
                "quantity": 1,
                "price_data": {
                    "currency": "usd",
                    "unit_amount": plan["amount"],
                    "recurring": {"interval": "month"},
                    "product_data": {"name": plan["label"]},
                },
            }],
            success_url=f"{_FRONTEND_URL}/app?billing=success&session_id={{CHECKOUT_SESSION_ID}}",
            cancel_url=f"{_FRONTEND_URL}/app?billing=cancelled",
            metadata={"email": email, "plan": req.plan},
        )
    except Exception as e:
        logger.exception("Checkout session creation failed")
        raise HTTPException(status_code=502, detail=f"Stripe error: {e}")
    return {"url": session.url}


@router.get("/status")
def status(email: str = Header("anonymous", alias="X-User-Id")) -> dict:
    sub = _get_subscription(email)
    active = sub is not None and sub["status"] in ("active", "trialing")
    return {"active": active, "subscription": sub}


class ConfirmRequest(BaseModel):
    session_id: str


@router.post("/confirm")
def confirm(req: ConfirmRequest, email: str = Header("anonymous", alias="X-User-Id")) -> dict:
    """Fallback sync path: called by the frontend when Stripe redirects back
    with ?session_id=. Verifies against the Stripe API — the client-supplied id
    is only trusted after retrieval shows it is paid and belongs to this email."""
    stripe = _stripe()
    try:
        session = stripe.checkout.Session.retrieve(req.session_id)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Unknown session: {e}")
    if session.payment_status != "paid":
        raise HTTPException(status_code=402, detail="Checkout not completed")
    session_email = (session.metadata or {}).get("email") or session.customer_email
    if session_email != email:
        raise HTTPException(status_code=403, detail="Session does not belong to this user")
    plan = (session.metadata or {}).get("plan", "founding")
    _upsert_subscription(
        email=session_email,
        plan=plan,
        customer_id=str(session.customer) if session.customer else None,
        subscription_id=str(session.subscription) if session.subscription else None,
        status="active",
    )
    return {"active": True, "plan": plan}


@router.post("/webhook")
async def webhook(request: Request) -> dict:
    stripe = _stripe()
    secret = os.getenv("STRIPE_WEBHOOK_SECRET", "")
    if not secret:
        raise HTTPException(status_code=503, detail="STRIPE_WEBHOOK_SECRET not set")
    payload = await request.body()
    signature = request.headers.get("stripe-signature", "")
    try:
        event = stripe.Webhook.construct_event(payload, signature, secret)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Invalid webhook signature: {e}")

    kind = event["type"]
    obj = event["data"]["object"]
    if kind == "checkout.session.completed":
        email = (obj.get("metadata") or {}).get("email") or obj.get("customer_email")
        plan = (obj.get("metadata") or {}).get("plan", "founding")
        if email:
            _upsert_subscription(email, plan, obj.get("customer"), obj.get("subscription"), "active")
    elif kind in ("customer.subscription.updated", "customer.subscription.deleted"):
        sub_id = obj.get("id")
        new_status = "cancelled" if kind.endswith("deleted") else obj.get("status", "active")
        with _db() as conn:
            conn.execute(
                "UPDATE subscriptions SET status = ?, updated_at = ? WHERE stripe_subscription_id = ?",
                (new_status, time.time(), sub_id),
            )
    else:
        logger.debug("Unhandled Stripe event type: {}", kind)
    return {"received": True}
