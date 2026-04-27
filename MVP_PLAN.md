# ScribeAI — MVP Plan

> **Goal**: ship a web-only AI medical scribe (text in, structured SOAP out)
> on a tight budget, hosted on Azure with serverless GPU inference, validated
> with 5 paying clinicians within 12 weeks.

**Status**: planning
**Last updated**: 2026-04-26
**Owner**: Akash

---

## 1. MVP scope

**In scope**
- Web app only (desktop + tablet responsive — no native mobile)
- Free-text dictation input → structured SOAP note (JSON + Markdown)
- Inline edit + copy / download / export
- One specialty (psychiatry / outpatient mental health)
- Single-tenant (one clinic per deployment) for the first 3 customers
- Synthetic / de-identified data only for the first 3 months

**Out of scope (deliberately)**
- Mobile apps (iOS / Android)
- Audio capture / ASR (text input only — paste or type)
- EHR integration (copy-paste into Epic/Cerner is fine for MVP)
- Multi-tenant accounts, billing UI, team management
- ICD-10 / CPT coding suggestions
- Fine-tuning, RAG over patient history
- Real PHI processing, HIPAA paperwork
  *(Add HIPAA + BAA when first paying customer requires it — usually customer #2 or #3.)*

**Done when**
- 3 of 5 design partners use the tool weekly without prompting
- Median note generation < 15 seconds
- Self-reported edit rate < 20%

---

## 2. Architecture

```
+-------------------+      +--------------------+      +-------------------+
|  Next.js frontend | ---> |  FastAPI backend   | ---> | Serverless GPU    |
|  (Azure Static    |      |  (Azure Container  |      | (RunPod / Modal)  |
|   Web Apps)       |      |   Apps)            |      | Qwen 2.5 14B      |
+-------------------+      +---------+----------+      +-------------------+
                                     |
                          +----------+----------+
                          |  Postgres + Blob    |
                          |  (Azure DB for PG   |
                          |   Flex + Blob)      |
                          +---------------------+
```

- Frontend stays on Azure Static Web Apps (free).
- FastAPI control plane stays on Azure Container Apps (always-on, cheap).
- GPU inference is **separate** — runs on RunPod/Modal with scale-to-zero so you only pay when generating.
- Postgres holds users, notes, audit log; Blob holds exported files.

---

## 3. Tech stack

| Layer | Choice | Why |
|---|---|---|
| Frontend | Next.js 14 + Tailwind (already built in `web/`) | Already done |
| Backend | FastAPI + Instructor + Pydantic | Same pattern as our extraction pipeline |
| LLM | **Qwen 2.5 14B Instruct** (Q4 GGUF) | Best small-model JSON adherence; fits 24GB GPU |
| Inference server | vLLM or llama.cpp server | OpenAI-compatible endpoint |
| GPU host | RunPod (RTX 3090 community cloud) | $0.20–0.34/hr, scale to zero |
| Database | Azure Database for PostgreSQL Flexible (B1ms) | $15/mo, encrypted at rest |
| Object storage | Azure Blob Storage | Pennies per month at MVP scale |
| Secrets | Azure Key Vault | $1/mo |
| Auth | Magic link via Resend (no passwords) | Fast to ship, no auth headaches |
| Email | Resend free tier (3K emails/mo) | $0 |
| Monitoring | Azure App Insights free tier | $0 |
| Frontend hosting | Azure Static Web Apps | Free |
| Backend hosting | Azure Container Apps (consumption tier) | ~$30/mo at MVP load |
| CI/CD | GitHub Actions | Free for public repo, $0 |

---

## 4. About the GPU choice

### RTX 3090 verdict
- **Good fit for the model**: 24GB VRAM, runs Qwen 2.5 14B Q4 at ~30–40 tokens/sec — well above the speed needed.
- **Could even run Qwen 2.5 32B Q4** at ~15–20 tok/sec if you want more accuracy.
- **Not on Azure**: consumer card, not in Azure catalog.
- **Available on**: RunPod ($0.20–0.34/hr community, $0.44/hr secure), Vast.ai (cheaper but flakier).
- **Cold start**: 30–90 seconds to load the model. Not a problem at MVP traffic.

### Why not pure Azure for GPU
| Azure GPU option | $/hr | Fit |
|---|---:|---|
| NC4as T4 v3 (T4, 16GB) | ~$0.53 | Too little VRAM for 14B Q4 in safe margin |
| NC8as T4 v3 (T4, 16GB) | ~$0.75 | Same VRAM constraint |
| NC6s v3 (V100, 16GB) | ~$3.06 | Overkill, expensive |
| NC24ads A100 v4 (A100 80GB) | ~$3.67 | Overkill for MVP |
| Container Apps + GPU (T4 / A100) | varies | New feature, scale-to-zero, but T4 still tight |

**Verdict**: hybrid is ~5–10× cheaper than all-Azure at MVP scale. Stay hybrid until you have ARR to justify migrating GPU to Azure later.

### Recommended GPU setup
- **Provider**: RunPod
- **GPU**: RTX 3090 (community cloud) or RTX 4090 if you want headroom (~$0.40/hr)
- **Pattern**: deploy as a RunPod **Serverless** endpoint (not a Pod) → scales to zero between requests
- **Server**: vLLM with OpenAI-compatible API
- **Auth**: API key in Azure Key Vault, FastAPI calls the RunPod endpoint as if it were OpenAI

---

## 5. Monthly cost estimate (MVP scale: 5 customers, ~1,000 notes/month)

| Item | Provider | Cost (USD) |
|---|---|---:|
| Frontend hosting | Azure Static Web Apps (Free tier) | $0 |
| Backend (FastAPI) | Azure Container Apps | $30 |
| Database | Azure DB for PG Flexible (B1ms) | $15 |
| Object storage | Azure Blob (~5 GB) | $1 |
| Key Vault | Azure | $1 |
| App Insights | Azure (free tier) | $0 |
| GPU inference | RunPod 3090 (~5 hr active/month) | $5–10 |
| Domain + SSL | Namecheap | $1 |
| Email | Resend free tier | $0 |
| Vanta (SOC 2 prep) — *optional from day 1* | Vanta | $15 |
| **Total** | | **~$70/month** |

**Scale assumptions**: 1,000 notes/month × 18 sec average GPU time = ~5 GPU-hours/month. Even 10× growth keeps you under $200/month.

---

## 6. Compliance posture (MVP stage)

| Stage | Customers | Compliance work |
|---|---|---|
| Weeks 1–8 | 0–5 design partners | Synthetic data only. No PHI. No HIPAA scope. |
| Months 3–6 | First 3 paying customers | Sign single-page agreement; require customers to de-identify before submitting. Start Vanta evidence collection. |
| Months 6–9 | 5–10 customers | Sign first BAA. Move LLM to BAA-signed provider (Azure OpenAI or Bedrock) for any real PHI. SOC 2 Type I in progress. |
| Months 9–12 | 10+ customers | SOC 2 Type II. Start HITRUST e1 prep if going US enterprise. |

**Key rule**: **the moment you accept real PHI, your hybrid GPU setup needs to change** — RunPod is not BAA-eligible. At that point, migrate inference to **Azure Container Apps with GPU** (BAA-eligible) or **Azure OpenAI** (BAA-eligible). Plan for this migration around month 4–6.

---

## 7. Repo structure

```
F:/Unstructure Data to Structure/
├── MVP_PLAN.md                    (this file)
├── web/                           (Next.js frontend — DONE)
│   ├── app/
│   ├── components/
│   └── package.json
├── api/                           (FastAPI backend — TO BUILD)
│   ├── main.py
│   ├── schemas.py
│   ├── structure.py
│   ├── render.py
│   ├── db.py
│   ├── auth.py
│   └── requirements.txt
├── inference/                     (RunPod handler — TO BUILD)
│   ├── handler.py
│   ├── Dockerfile
│   └── requirements.txt
├── synthetic/                     (test fixtures — TO BUILD)
│   ├── case_001.txt
│   ├── case_001.expected.json
│   └── ... (20 cases total)
├── tests/                         (pytest — TO BUILD)
│   └── test_extraction.py
├── infra/                         (deployment scripts — TO BUILD)
│   ├── azure_setup.sh             (or Bicep / Terraform)
│   └── runpod_endpoint.json
└── docs/
    └── design_pkg/                (the Claude Design bundle, kept for reference)
```

---

## 8. 4-week build plan

### Week 1 — Backend skeleton + synthetic data
- [ ] Create `api/` FastAPI project with `/structure` endpoint
- [ ] Implement Pydantic SOAPNote schema
- [ ] Wire Instructor against OpenAI (gpt-4o-mini) for development
- [ ] Hand-write 20 synthetic dictations + expected JSON in `synthetic/`
- [ ] Write `tests/test_extraction.py` parametrized over the 20 cases
- [ ] All tests pass on at least 18/20

**Exit**: `pytest -v` runs locally and passes. No frontend wiring yet.

### Week 2 — Frontend wiring + local end-to-end
- [ ] Connect existing Next.js `web/` to local FastAPI
- [ ] Build the actual app screen (separate from landing): textarea → button → structured output
- [ ] Inline edit on output sections
- [ ] Copy as Markdown / Download JSON buttons
- [ ] Add loading states and error states

**Exit**: paste → structure → edit → export works end-to-end on `localhost`.

### Week 3 — Deploy + GPU swap
- [ ] Provision Azure resources: Static Web App, Container App, Postgres, Key Vault
- [ ] Deploy frontend to Azure Static Web Apps via GitHub Actions
- [ ] Deploy backend to Azure Container Apps
- [ ] Stand up RunPod serverless endpoint with vLLM + Qwen 2.5 14B
- [ ] Swap Instructor client from OpenAI to RunPod (OpenAI-compatible base URL)
- [ ] Re-run synthetic test suite against the deployed stack
- [ ] Domain + SSL set up

**Exit**: production URL works. Tests pass against deployed stack. Median latency < 15s.

### Week 4 — Polish + first clinician demos
- [ ] Magic-link auth (one user account = one clinic)
- [ ] Past notes list (simple table)
- [ ] Audit log table (who created/edited/exported)
- [ ] First 3 clinician demos scheduled and run
- [ ] Iterate prompt + schema based on real feedback

**Exit**: 1+ clinician says "send me v0.2 next week."

---

## 9. Validation gates (don't move past these)

| After | Gate |
|---|---|
| Week 1 | 18/20 synthetic cases pass |
| Week 2 | You demo the local app to a friend in 30s and they "get it" |
| Week 3 | Production stack handles 20 real-shaped notes without errors |
| Week 4 | At least 1 clinician asks to keep using it next week |
| Week 8 | 3 of 5 design partners use it weekly without you reminding them |
| Week 12 | First $1 of revenue (even $1, from 1 customer) |

If any gate fails, fix the gate before moving on. Don't pile features on a broken foundation.

---

## 10. Setup commands (one-time, when you start each phase)

### Local dev (week 1)
```bash
# in F:/Unstructure Data to Structure/
python -m venv .venv
source .venv/Scripts/activate
pip install fastapi uvicorn instructor pydantic openai jinja2 pytest python-dotenv tenacity loguru
echo OPENAI_API_KEY=sk-... > .env
```

### Azure (week 3)
```bash
# install Azure CLI, then
az login
az group create -n scribeai-mvp -l eastus
# then provision via Bicep or CLI — see infra/azure_setup.sh
```

### RunPod (week 3)
```bash
# in inference/
docker build -t scribeai-inference .
# push to RunPod via their CLI; create serverless endpoint
```

### Frontend (already done)
```bash
cd web
npm install
npm run dev
```

---

## 11. Risks + mitigations

| Risk | Likelihood | Mitigation |
|---|---|---|
| Qwen 2.5 14B accuracy too low for psychiatry | Medium | Have GPT-4o-mini as cloud fallback; test 20 synthetic cases before committing |
| RunPod cold start hurts UX | Medium | Add "Generating note…" spinner with friendly copy; 30–90s acceptable for MVP |
| Azure costs balloon | Low | Set spending alerts at $50, $100, $200; review monthly |
| First customer demands HIPAA before week 12 | Medium | Have Azure OpenAI account ready as drop-in replacement for RunPod; 1-day swap |
| Clinicians don't show up for demos | High | Always book 5 if you need 3; email reminders day-of |
| You fall in love with code, neglect sales | Very high | Hard rule: 50% of weekly hours on customer conversations, not code |

---

## 12. What this plan deliberately does NOT do

- Build a mobile app (separate decision; revisit at month 6+)
- Run any model on-device (separate decision; revisit when Gemma 3n quality is validated)
- Integrate with EHRs (massive scope; only start when 5+ customers explicitly demand it)
- Process audio (use text input until customers explicitly ask for audio)
- Build a marketing site beyond the landing page already done
- Hire anyone

Stay narrow. Ship the loop. Get to revenue.

---

## 13. References + memory

- Frontend code: `web/` (already built; Next.js 14 + Tailwind, ScribeAI branding)
- Design source: `docs/design_pkg/` (the Claude Design bundle for the landing page)
- Earlier conversation notes: `memory/MEMORY.md`
- Earlier privacy + GTM thinking: see chat history with Claude Code

---

## 14. The one-line summary

> Build a calm, narrow text-in/SOAP-out web app, deploy it to Azure with a
> RunPod GPU sidecar, charge $99/month, sign 5 customers in 12 weeks. Add
> HIPAA, mobile, audio, EHR, and on-device only when a paying customer
> demands it.
