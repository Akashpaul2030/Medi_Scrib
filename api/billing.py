"""Paddle billing: subscriptions plus one-off credit packs.

Paddle is a merchant of record — it is the legal seller, collects the money,
handles sales tax worldwide, and remits to us. That is what makes this workable
from Bangladesh, where Stripe does not onboard merchants.

Dormant until PADDLE_API_KEY is set — every endpoint except /billing/config
returns 503 before that, and the frontend hides the billing UI entirely.

Flow, and why it is shaped this way:

  1. The browser asks this API to start a checkout.
  2. We create a Paddle *transaction* server-side, stamped with the signed-in
     user's email in custom_data. Doing it here rather than in the browser is
     what makes attribution trustworthy — the user cannot rewrite whose account
     the payment lands on.
  3. Paddle returns a checkout URL on our own domain (`/checkout?_ptxn=…`).
     That page loads Paddle.js, which opens the payment overlay.
  4. Fulfilment happens in the webhook, never from a browser callback.

Credit amounts are derived from the *price id* in the completed transaction,
not from custom_data, so even a tampered checkout cannot mint credits: the user
has to actually pay for a price we recognise.
"""

import hashlib
import hmac
import os
import time

import httpx
from dotenv import load_dotenv
from fastapi import APIRouter, Depends, HTTPException, Request
from loguru import logger
from pydantic import BaseModel

from api.auth import get_user_id
from api.db import connect
from api.usage import add_credits, already_processed, get_state

load_dotenv()

router = APIRouter(prefix="/billing", tags=["billing"])

_FRONTEND_URL = os.getenv("FRONTEND_URL", "http://localhost:3000")

# Paddle keeps sandbox and live completely separate — different API host,
# different keys, different price ids.
_SANDBOX = os.getenv("PADDLE_ENV", "sandbox").lower() != "production"
_API_BASE = "https://sandbox-api.paddle.com" if _SANDBOX else "https://api.paddle.com"

# Webhook timestamps older than this are rejected as replays.
_SIGNATURE_TOLERANCE_SECONDS = 300

PLANS = {
    "founding": {"label": "ScribeAI — Founding partner", "amount": 3900,
                 "price_env": "PADDLE_PRICE_FOUNDING"},
    "solo": {"label": "ScribeAI — Solo", "amount": 4900,
             "price_env": "PADDLE_PRICE_SOLO"},
}

CREDIT_PACKS = {
    "pack_25": {"label": "25 note credits", "amount": 1500, "credits": 25,
                "price_env": "PADDLE_PRICE_PACK_25"},
    "pack_100": {"label": "100 note credits", "amount": 5000, "credits": 100,
                 "price_env": "PADDLE_PRICE_PACK_100"},
}


def _api_key() -> str:
    key = os.getenv("PADDLE_API_KEY", "")
    if not key:
        raise HTTPException(status_code=503, detail="Billing not configured")
    return key


def _price_id(spec: dict) -> str:
    price_id = os.getenv(spec["price_env"], "")
    if not price_id:
        # Unlike Stripe, Paddle has no inline price data — every charge must
        # reference a price created in the dashboard first.
        raise HTTPException(
            status_code=503,
            detail=f"{spec['price_env']} is not set; run scripts/paddle_setup.py",
        )
    return price_id


def _credits_for_price(price_id: str) -> int:
    """Map a paid price id back to the credits it grants. Returns 0 for prices
    that are not credit packs (subscriptions, or anything unrecognised)."""
    for spec in CREDIT_PACKS.values():
        if os.getenv(spec["price_env"], "") == price_id:
            return int(spec["credits"])
    return 0


def _plan_for_price(price_id: str) -> str | None:
    for name, spec in PLANS.items():
        if os.getenv(spec["price_env"], "") == price_id:
            return name
    return None


def _paddle_request(method: str, path: str, payload: dict | None = None) -> dict:
    try:
        response = httpx.request(
            method,
            f"{_API_BASE}{path}",
            headers={
                "Authorization": f"Bearer {_api_key()}",
                "Content-Type": "application/json",
            },
            json=payload,
            timeout=30,
        )
    except httpx.HTTPError as e:
        logger.exception("Paddle request failed")
        raise HTTPException(status_code=502, detail=f"Paddle unreachable: {e}")

    if response.status_code >= 400:
        logger.error("Paddle {} {} -> {} {}", method, path, response.status_code,
                     response.text[:500])
        raise HTTPException(status_code=502, detail=f"Paddle error: {response.text[:300]}")
    return response.json().get("data", {})


# --------------------------------------------------------------------------
# local state
# --------------------------------------------------------------------------

def _upsert_subscription(email: str, plan: str, customer_id: str | None,
                         subscription_id: str | None, status: str) -> None:
    with connect() as conn:
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


def _remember_customer(email: str, customer_id: str | None) -> None:
    if not customer_id:
        return
    with connect() as conn:
        conn.execute(
            """INSERT INTO billing_customers (email, customer_id, updated_at)
               VALUES (?, ?, ?)
               ON CONFLICT(email) DO UPDATE SET
                   customer_id=excluded.customer_id,
                   updated_at=excluded.updated_at""",
            (email, str(customer_id), time.time()),
        )


def _customer_for(email: str) -> str | None:
    with connect() as conn:
        row = conn.execute(
            "SELECT customer_id FROM billing_customers WHERE email = ?", (email,)
        ).fetchone()
    return row[0] if row else None


def _email_for_customer(customer_id: str | None) -> str | None:
    """Subscription webhooks identify the customer, not the email, so this is
    how a renewal or cancellation gets attributed back to an account."""
    if not customer_id:
        return None
    with connect() as conn:
        row = conn.execute(
            "SELECT email FROM billing_customers WHERE customer_id = ?",
            (str(customer_id),),
        ).fetchone()
    return row[0] if row else None


def _get_subscription(email: str) -> dict | None:
    with connect() as conn:
        row = conn.execute(
            "SELECT plan, status, updated_at FROM subscriptions WHERE email = ?",
            (email,),
        ).fetchone()
    if row is None:
        return None
    return {"plan": row[0], "status": row[1], "updated_at": row[2]}


def _grant_credits_once(email: str, credits: int, transaction_id: str | None) -> int | None:
    """Add purchased credits, at most once per transaction.

    Paddle retries webhooks on any non-2xx, and the same transaction can also
    arrive under more than one event type. Keying the guard on the transaction
    is what stops one purchase being credited twice.
    """
    if not credits:
        return None
    if transaction_id and already_processed(f"txn:{transaction_id}"):
        return None
    return add_credits(email, credits, "purchase", transaction_id)


# --------------------------------------------------------------------------
# endpoints
# --------------------------------------------------------------------------

@router.get("/config")
def config() -> dict:
    """Public. The client token is safe to expose — it can only open a checkout,
    never read or move money."""
    return {
        "enabled": bool(os.getenv("PADDLE_API_KEY", "")),
        "provider": "paddle",
        "environment": "sandbox" if _SANDBOX else "production",
        "client_token": os.getenv("PADDLE_CLIENT_TOKEN", ""),
        "plans": {k: {"label": v["label"], "amount": v["amount"]} for k, v in PLANS.items()},
        "credit_packs": {
            k: {"label": v["label"], "amount": v["amount"], "credits": v["credits"]}
            for k, v in CREDIT_PACKS.items()
        },
    }


def _create_checkout(email: str, spec: dict, custom: dict) -> dict:
    transaction = _paddle_request("POST", "/transactions", {
        "items": [{"price_id": _price_id(spec), "quantity": 1}],
        "collection_mode": "automatic",
        # Server-set, so the browser cannot redirect someone else's payment
        # onto its own account.
        "custom_data": {"email": email, **custom},
        "checkout": {"url": f"{_FRONTEND_URL}/checkout"},
    })
    url = (transaction.get("checkout") or {}).get("url")
    if not url:
        raise HTTPException(status_code=502, detail="Paddle returned no checkout URL")
    return {"url": url, "transaction_id": transaction.get("id")}


class CheckoutRequest(BaseModel):
    plan: str = "founding"


@router.post("/checkout")
def create_checkout(req: CheckoutRequest, email: str = Depends(get_user_id)) -> dict:
    if req.plan not in PLANS:
        raise HTTPException(status_code=400, detail=f"Unknown plan {req.plan!r}")
    return _create_checkout(email, PLANS[req.plan], {"kind": "subscription", "plan": req.plan})


class CreditsRequest(BaseModel):
    pack: str = "pack_25"


@router.post("/credits/checkout")
def buy_credits(req: CreditsRequest, email: str = Depends(get_user_id)) -> dict:
    if req.pack not in CREDIT_PACKS:
        raise HTTPException(status_code=400, detail=f"Unknown pack {req.pack!r}")
    return _create_checkout(email, CREDIT_PACKS[req.pack], {"kind": "credits", "pack": req.pack})


@router.post("/portal")
def portal(email: str = Depends(get_user_id)) -> dict:
    """Paddle-hosted page for updating card details or cancelling."""
    customer_id = _customer_for(email)
    if not customer_id:
        raise HTTPException(status_code=400, detail="No billing customer for this account yet")
    data = _paddle_request("POST", f"/customers/{customer_id}/portal-sessions", {})
    url = ((data.get("urls") or {}).get("general") or {}).get("overview")
    if not url:
        raise HTTPException(status_code=502, detail="Paddle returned no portal URL")
    return {"url": url}


@router.get("/status")
def status(email: str = Depends(get_user_id)) -> dict:
    sub = _get_subscription(email)
    active = sub is not None and sub["status"] in ("active", "trialing")
    return {"active": active, "subscription": sub, "usage": get_state(email).model_dump()}


# --------------------------------------------------------------------------
# webhook
# --------------------------------------------------------------------------

def _verify_signature(raw_body: bytes, header: str, secret: str) -> None:
    """Paddle-Signature looks like `ts=1671552777;h1=<hex>`; the signed payload
    is `<ts>:<raw body>` hashed with HMAC-SHA256 under the endpoint secret.

    The body must be the untouched bytes — re-serialising the JSON produces a
    different hash and every event would be rejected.
    """
    parts = dict(
        piece.split("=", 1) for piece in header.split(";") if "=" in piece
    )
    ts, received = parts.get("ts"), parts.get("h1")
    if not ts or not received:
        raise HTTPException(status_code=400, detail="Malformed Paddle-Signature header")

    try:
        age = abs(time.time() - int(ts))
    except ValueError:
        raise HTTPException(status_code=400, detail="Bad timestamp in Paddle-Signature")
    if age > _SIGNATURE_TOLERANCE_SECONDS:
        raise HTTPException(status_code=400, detail="Paddle signature too old")

    expected = hmac.new(
        secret.encode("utf-8"),
        f"{ts}:".encode("utf-8") + raw_body,
        hashlib.sha256,
    ).hexdigest()

    if not hmac.compare_digest(expected, received):
        raise HTTPException(status_code=400, detail="Invalid Paddle signature")


def _items_price_ids(obj: dict) -> list[str]:
    ids = []
    for item in obj.get("items") or []:
        price = item.get("price") or {}
        price_id = price.get("id") or item.get("price_id")
        if price_id:
            ids.append(price_id)
    return ids


@router.post("/webhook")
async def webhook(request: Request) -> dict:
    secret = os.getenv("PADDLE_WEBHOOK_SECRET", "")
    if not secret:
        raise HTTPException(status_code=503, detail="PADDLE_WEBHOOK_SECRET not set")

    raw = await request.body()
    _verify_signature(raw, request.headers.get("paddle-signature", ""), secret)

    event = await request.json()
    event_id = event.get("event_id")
    kind = event.get("event_type")
    obj = event.get("data") or {}

    # Guard the event itself as well as the transaction, so a redelivery of the
    # exact same event is cheap to ignore.
    if event_id and already_processed(event_id):
        return {"received": True, "duplicate": True}

    custom = obj.get("custom_data") or {}
    customer_id = obj.get("customer_id")
    email = custom.get("email") or _email_for_customer(customer_id)

    if kind == "transaction.completed":
        if not email:
            # Nothing we can attribute; log loudly rather than silently drop a
            # payment someone made.
            logger.error("Paddle transaction {} completed with no attributable email",
                         obj.get("id"))
            return {"received": True, "unattributed": True}

        _remember_customer(email, customer_id)
        for price_id in _items_price_ids(obj):
            credits = _credits_for_price(price_id)
            if credits:
                _grant_credits_once(email, credits, obj.get("id"))
            plan = _plan_for_price(price_id)
            if plan:
                _upsert_subscription(email, plan, customer_id,
                                     obj.get("subscription_id"), "active")

    elif kind in ("subscription.activated", "subscription.created",
                  "subscription.updated", "subscription.resumed"):
        if email:
            _remember_customer(email, customer_id)
            plan = next(
                (p for pid in _items_price_ids(obj) if (p := _plan_for_price(pid))),
                "founding",
            )
            _upsert_subscription(email, plan, customer_id, obj.get("id"),
                                 obj.get("status", "active"))

    elif kind in ("subscription.canceled", "subscription.paused"):
        with connect() as conn:
            conn.execute(
                "UPDATE subscriptions SET status = ?, updated_at = ? "
                "WHERE stripe_subscription_id = ?",
                ("cancelled", time.time(), obj.get("id")),
            )

    else:
        logger.debug("Unhandled Paddle event type: {}", kind)

    return {"received": True}
