"""Create the ScribeAI product catalogue in Paddle, then print the price ids.

Run once per Paddle environment (sandbox first, then production) after putting
your API key in .env:

    python scripts/paddle_setup.py

Safe to re-run: products and prices are matched by name and reused. Paddle
prices are immutable once used, so changing an amount creates a new price and
leaves the old one for existing subscribers.

Copy the printed PADDLE_PRICE_* lines into .env and into your Fly secrets.
"""

import os
import sys
from pathlib import Path

import httpx
from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
load_dotenv(ROOT / ".env")

from api.billing import CREDIT_PACKS, PLANS  # noqa: E402


def main() -> int:
    key = os.getenv("PADDLE_API_KEY", "")
    if not key:
        print("PADDLE_API_KEY is not set in .env — nothing to do.")
        return 1

    sandbox = os.getenv("PADDLE_ENV", "sandbox").lower() != "production"
    base = "https://sandbox-api.paddle.com" if sandbox else "https://api.paddle.com"
    print(f"Connected to Paddle {'SANDBOX' if sandbox else 'PRODUCTION'} ({base}).\n")

    client = httpx.Client(
        base_url=base,
        headers={"Authorization": f"Bearer {key}", "Content-Type": "application/json"},
        timeout=30,
    )

    def call(method: str, path: str, payload: dict | None = None) -> dict:
        r = client.request(method, path, json=payload)
        if r.status_code >= 400:
            print(f"  ERROR {method} {path} -> {r.status_code}: {r.text[:400]}")
            raise SystemExit(1)
        return r.json()

    existing_products = {
        p["name"]: p for p in call("GET", "/products?per_page=200").get("data", [])
        if p.get("status") == "active"
    }

    def ensure_product(name: str) -> str:
        if name in existing_products:
            pid = existing_products[name]["id"]
            print(f"  product exists: {name} ({pid})")
            return pid
        data = call("POST", "/products", {"name": name, "tax_category": "standard"})["data"]
        print(f"  product created: {name} ({data['id']})")
        return data["id"]

    def ensure_price(product_id: str, name: str, amount: int, recurring: bool) -> str:
        prices = call("GET", f"/prices?product_id={product_id}&per_page=200").get("data", [])
        for pr in prices:
            if pr.get("status") != "active":
                continue
            same_amount = pr.get("unit_price", {}).get("amount") == str(amount)
            is_recurring = pr.get("billing_cycle") is not None
            if same_amount and is_recurring == recurring:
                print(f"  price exists: ${amount / 100:.2f} ({pr['id']})")
                return pr["id"]

        payload = {
            "product_id": product_id,
            "description": name,
            "unit_price": {"amount": str(amount), "currency_code": "USD"},
        }
        if recurring:
            payload["billing_cycle"] = {"interval": "month", "frequency": 1}
        data = call("POST", "/prices", payload)["data"]
        print(f"  price created: ${amount / 100:.2f} ({data['id']})")
        return data["id"]

    env_lines = []

    print("Subscription plans:")
    for spec in PLANS.values():
        product_id = ensure_product(spec["label"])
        price_id = ensure_price(product_id, spec["label"], spec["amount"], recurring=True)
        env_lines.append(f"{spec['price_env']}={price_id}")

    print("\nCredit packs:")
    for spec in CREDIT_PACKS.values():
        product_id = ensure_product(spec["label"])
        price_id = ensure_price(product_id, spec["label"], spec["amount"], recurring=False)
        env_lines.append(f"{spec['price_env']}={price_id}")

    print("\n" + "=" * 64)
    print("Add these to .env and to `fly secrets set`:\n")
    for line in env_lines:
        print("  " + line)
    print("\nUnlike Stripe, Paddle has no inline prices — checkout returns 503")
    print("until every one of these is set.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
