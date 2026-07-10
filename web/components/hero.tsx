import { ArrowRight, Lock, Play } from "./icons";
import { HeroMockup } from "./hero-mockup";

export function Hero() {
  return (
    <section className="relative">
      <div
        className="bg-hairline absolute inset-0"
        style={{
          maskImage: "linear-gradient(to bottom, black 30%, transparent 100%)",
          WebkitMaskImage:
            "linear-gradient(to bottom, black 30%, transparent 100%)",
        }}
      />
      <div className="relative mx-auto max-w-[1180px] px-6 pb-24 pt-20 lg:pb-32 lg:pt-28">
        <div className="grid grid-cols-1 items-center gap-14 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)] lg:gap-16">
          <div className="max-w-[560px]">
            <div className="inline-flex items-center gap-2 rounded-full border border-line bg-white/70 px-3 py-1 text-[12px] text-mute backdrop-blur">
              <Lock size={13} stroke={1.7} className="text-teal" />
              Built only for outpatient psychiatry
            </div>
            <h1 className="font-display mt-6 text-[44px] font-medium leading-[1.04] text-ink sm:text-[52px] lg:text-[60px]">
              Stop typing notes.
              <br />
              <span className="text-teal">Start seeing patients.</span>
            </h1>
            <p className="mt-6 max-w-[500px] text-[17px] leading-[1.55] text-ink/70">
              ScribeAI turns a rambling psychiatry dictation — typed, uploaded,
              or spoken — into a structured SOAP note in about 15 seconds. It
              never invents a dose or diagnosis: anything ambiguous is flagged
              for you to verify.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <a
                href="/app"
                className="btn-primary inline-flex h-11 items-center gap-2 rounded-md px-5 text-[14.5px] font-medium shadow-card"
              >
                Try it free
                <ArrowRight size={16} stroke={2} />
              </a>
              <a
                href="#how"
                className="btn-ghost inline-flex h-11 items-center gap-2 rounded-md border border-line bg-white px-4 text-[14.5px] font-medium text-ink"
              >
                <Play size={11} className="text-teal" />
                See how it works
              </a>
            </div>
            <p className="mt-4 text-[12.5px] text-mute">
              Free during the design-partner beta. No credit card, no PHI —
              trial it with sample notes.
            </p>
          </div>

          <div className="lg:pl-4">
            <HeroMockup />
          </div>
        </div>
      </div>
    </section>
  );
}
