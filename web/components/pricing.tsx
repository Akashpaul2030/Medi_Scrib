import { ArrowRight, Check } from "./icons";

const FEATURES = [
  "Unlimited notes during the beta",
  "Structured SOAP with ICD-10 codes",
  "Flags for review on every note",
  "Upload documents or dictate audio",
  "Semantic search, Ask, and visit Compare",
  "Copy Markdown, JSON, or PDF export",
];

export function Pricing() {
  return (
    <section id="pricing" className="border-t border-line/80 bg-white">
      <div className="mx-auto max-w-[1180px] px-6 py-24 lg:py-28">
        <div className="grid grid-cols-1 items-center gap-14 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
          <div className="max-w-[480px]">
            <div className="text-[12px] font-medium uppercase tracking-[0.12em] text-teal">
              Early access
            </div>
            <h2 className="font-display mt-3 text-[34px] font-medium leading-[1.1] text-ink lg:text-[40px]">
              Free for design partners. Founding price locked for life.
            </h2>
            <p className="mt-4 text-[15.5px] text-ink/65">
              ScribeAI is in an 8-week design-partner beta with a small group of
              outpatient psychiatry clinicians. Use it weekly on sample notes,
              tell us honestly where it&rsquo;s wrong, and shape what gets
              built.
            </p>
            <div className="mt-6 flex flex-col gap-2 text-[13.5px] text-mute">
              <div className="flex items-center gap-2">
                <Check size={14} stroke={2} className="text-teal" /> No
                contract, no payment, no EHR setup.
              </div>
              <div className="flex items-center gap-2">
                <Check size={14} stroke={2} className="text-teal" /> No PHI —
                trial with sample or de-identified notes only.
              </div>
            </div>
          </div>

          <div className="relative">
            <div className="absolute -inset-3 -z-10 rounded-[20px] bg-gradient-to-br from-teal/[0.04] via-transparent to-coral/[0.04]" />
            <div className="overflow-hidden rounded-2xl border border-line bg-white shadow-card">
              <div className="p-8 lg:p-10">
                <div className="flex items-start justify-between">
                  <div>
                    <div className="text-[12px] font-medium uppercase tracking-[0.12em] text-mute">
                      Design partner
                    </div>
                    <div className="mt-3 flex items-baseline gap-1">
                      <span className="font-display text-[52px] font-medium leading-none text-ink">
                        $0
                      </span>
                      <span className="text-[14px] text-mute">
                        for 8 weeks
                      </span>
                    </div>
                    <div className="mt-1 text-[13px] text-mute">
                      Then founding pricing, locked for life.
                    </div>
                  </div>
                  <span
                    className="inline-flex items-center gap-1.5 rounded-full border border-coral/30 px-2.5 py-1 text-[11px] font-medium text-coral"
                    style={{ background: "rgba(249,112,102,0.08)" }}
                  >
                    <span className="block h-1.5 w-1.5 rounded-full bg-coral" />
                    5 spots
                  </span>
                </div>

                <ul className="mt-8 grid grid-cols-1 gap-x-6 gap-y-3 text-[14px] text-ink/80 sm:grid-cols-2">
                  {FEATURES.map((f) => (
                    <li key={f} className="flex items-start gap-2.5">
                      <span className="mt-[3px] flex h-4 w-4 items-center justify-center rounded-full bg-teal/10 text-teal">
                        <Check size={11} stroke={2.4} />
                      </span>
                      <span>{f}</span>
                    </li>
                  ))}
                </ul>

                <div className="mt-8 flex flex-wrap items-center gap-3">
                  <a
                    href="/app"
                    className="btn-primary inline-flex h-11 items-center gap-2 rounded-md px-5 text-[14.5px] font-medium shadow-softer"
                  >
                    Try the live demo
                    <ArrowRight size={16} stroke={2} />
                  </a>
                  <a
                    href="mailto:akashpaul2030@gmail.com?subject=ScribeAI%20design%20partner"
                    className="text-[13.5px] font-medium text-ink/70 hover:text-ink"
                  >
                    Email Akash, the founder →
                  </a>
                </div>
              </div>
              <div className="flex items-center justify-between border-t border-line/80 bg-paper px-8 py-3.5 text-[12px] text-mute lg:px-10">
                <span>
                  What you give back: use it weekly and a 15-minute feedback
                  call every two weeks.
                </span>
                <span className="font-mono tabular-nums">BETA-2026</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
