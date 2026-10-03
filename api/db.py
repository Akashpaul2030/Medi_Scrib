"""Shared SQLite connection and schema for billing + usage state.

Everything clinical lives in Qdrant; this file holds only the commercial
state: who is subscribed, how many notes they have structured this month, and
how many purchased credits they have left.

Deployed on Fly.io this file sits on a mounted volume (see fly.toml). If the
volume is ever lost, subscriptions can be rebuilt from Stripe — it is the
source of truth — and usage counters simply reset, which errs in the user's
favour.
"""

import os
import sqlite3
from pathlib import Path

from dotenv import load_dotenv

# This module is imported before anything else calls load_dotenv, and DB_PATH
# is read at import time — without this, BILLING_DB set in .env is ignored and
# the database silently lands somewhere else.
load_dotenv()

DB_PATH = Path(os.getenv("BILLING_DB", "billing.db"))

_SCHEMA = """
CREATE TABLE IF NOT EXISTS subscriptions (
    email TEXT PRIMARY KEY,
    plan TEXT NOT NULL,
    stripe_customer_id TEXT,
    stripe_subscription_id TEXT,
    status TEXT NOT NULL,
    updated_at REAL NOT NULL
);

-- One row per user per billing period ("YYYY-MM"). Counts billable actions,
-- which today means structured notes.
CREATE TABLE IF NOT EXISTS usage_counters (
    email TEXT NOT NULL,
    period TEXT NOT NULL,
    used INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (email, period)
);

-- Purchased overage credits. These do not expire and are only consumed once
-- the monthly allowance is exhausted.
CREATE TABLE IF NOT EXISTS credits (
    email TEXT PRIMARY KEY,
    balance INTEGER NOT NULL DEFAULT 0
);

-- Append-only audit of credit movements, so a disputed charge can be traced.
CREATE TABLE IF NOT EXISTS credit_ledger (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT NOT NULL,
    delta INTEGER NOT NULL,
    reason TEXT NOT NULL,
    stripe_ref TEXT,
    created_at REAL NOT NULL
);

-- Stripe event ids already applied, so a webhook redelivery cannot grant
-- credits twice.
CREATE TABLE IF NOT EXISTS processed_events (
    event_id TEXT PRIMARY KEY,
    created_at REAL NOT NULL
);

-- Maps a user to their payment-provider customer id, including people who only
-- ever buy credit packs and so have no subscription row. Also read in reverse
-- to attribute provider webhooks (which identify by customer, not email).
CREATE TABLE IF NOT EXISTS billing_customers (
    email TEXT PRIMARY KEY,
    customer_id TEXT NOT NULL,
    updated_at REAL NOT NULL
);

CREATE INDEX IF NOT EXISTS billing_customers_by_customer
    ON billing_customers (customer_id);
"""


def connect() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH, timeout=15)
    # WAL keeps concurrent readers from blocking the writer; uvicorn runs sync
    # endpoints in a threadpool so concurrent access is normal here.
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA busy_timeout=10000")
    return conn


def init_db() -> None:
    with connect() as conn:
        conn.executescript(_SCHEMA)
