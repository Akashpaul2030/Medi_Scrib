import { ArrowRight, Check } from "./icons";

const FEATURES = [
  "Unlimited notes",
  "SOAP, DAP, and progress note formats",
  "Medical vocabulary & abbreviations",
  "Export to EHR (copy-paste or API)",
  "Audio deleted after signing",
  "30-day money back",
];

export function Pricing() {
  return (
    <section id="pricing" className="border-t border-line/80 bg-white">
      <div className="mx-auto max-w-[1180px] px-6 py-24 lg:py-28">
        <div className="grid grid-cols-1 items-center gap-14 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
          <div className="max-w-[480px]">
            <div className="text-[12px] font-medium uppercase tracking-[0.12em] text-teal">
              Pricing
            </div>
            <h2 className="font-display mt-3 text-[34px] font-medium leading-[1.1] text-ink lg:text-[40px]">
              One plan. No per-note fees.
            </h2>
            <p className="mt-4 text-[15.5px] text-ink/65">
              We price ScribeAI for the way clinicians actually work — flat,
              predictable, and reversible. If it doesn&rsquo;t save you an hour
              a day in the first month, we refund you.
            </p>
            <div className="mt-6 flex flex-col gap-2 text-[13.5px] text-mute">
              <div className="flex items-center gap-2">
                <Check size={14} stroke={2} className="text-teal" /> Cancel
                anytime, in one click.
              </div>
              <div className="flex items-center gap-2">
                <Check size={14} stroke={2} className="text-teal" /> SOC 2 Type
                II in progress.
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
                      Solo
                    </div>
                    <div className="mt-3 flex items-baseline gap-1">
                      <span className="font-display text-[52px] font-medium leading-none text-ink">
                        $99
                      </span>
                      <span className="text-[14px] text-mute">/month</span>
                    </div>
                    <div className="mt-1 text-[13px] text-mute">
                      For independent clinicians.
                    </div>
                  </div>
                  <span
                    className="inline-flex items-center gap-1.5 rounded-full border border-coral/30 px-2.5 py-1 text-[11px] font-medium text-coral"
                    style={{ background: "rgba(249,112,102,0.08)" }}
                  >
                    <span className="block h-1.5 w-1.5 rounded-full bg-coral" />
                    30-day money back
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
                    href="#"
                    className="btn-primary inline-flex h-11 items-center gap-2 rounded-md px-5 text-[14.5px] font-medium shadow-softer"
                  >
                    Start 14-day pilot
                    <ArrowRight size={16} stroke={2} />
                  </a>
                  <a
                    href="#"
                    className="text-[13.5px] font-medium text-ink/70 hover:text-ink"
                  >
                    Talk to a clinician on our team →
                  </a>
                </div>
              </div>
              <div className="flex items-center justify-between border-t border-line/80 bg-paper px-8 py-3.5 text-[12px] text-mute lg:px-10">
                <span>Group plans available for practices of 5+.</span>
                <span className="font-mono tabular-nums">SOLO-2026</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
