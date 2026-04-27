// ScribeAI landing page
const { useState, useEffect, useRef, useMemo } = React;

// ─── Lucide-style monoline icons ───────────────────────────────────────────
const Icon = ({ children, size = 20, stroke = 1.6, className = '' }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round"
    className={className} aria-hidden="true">
    {children}
  </svg>
);
const MicIcon = (p) => (<Icon {...p}><rect x="9" y="2" width="6" height="12" rx="3"/><path d="M5 10v2a7 7 0 0 0 14 0v-2"/><path d="M12 19v3"/></Icon>);
const SparklesIcon = (p) => (<Icon {...p}><path d="M12 3v4M12 17v4M3 12h4M17 12h4M5.6 5.6l2.8 2.8M15.6 15.6l2.8 2.8M5.6 18.4l2.8-2.8M15.6 8.4l2.8-2.8"/></Icon>);
const FileCheckIcon = (p) => (<Icon {...p}><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/><path d="M9 14l2 2 4-4"/></Icon>);
const ArrowRight = (p) => (<Icon {...p}><path d="M5 12h14M13 5l7 7-7 7"/></Icon>);
const Check = (p) => (<Icon {...p}><path d="M20 6 9 17l-5-5"/></Icon>);
const Play = (p) => (<Icon {...p}><path d="M6 4l14 8-14 8z" fill="currentColor" stroke="none"/></Icon>);
const Lock = (p) => (<Icon {...p}><rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></Icon>);

// ─── Logo mark (original — abstracted "S" / waveform) ──────────────────────
const Logo = ({ size = 22 }) => (
  <div className="flex items-center gap-2">
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <rect x="0" y="0" width="24" height="24" rx="6" fill="#0F766E"/>
      <g stroke="white" strokeWidth="1.6" strokeLinecap="round">
        <line x1="7"  y1="9"  x2="7"  y2="15"/>
        <line x1="10" y1="7"  x2="10" y2="17"/>
        <line x1="13" y1="10" x2="13" y2="14"/>
        <line x1="16" y1="8"  x2="16" y2="16"/>
      </g>
    </svg>
    <span className="font-display text-[17px] font-semibold tracking-tight text-ink">ScribeAI</span>
  </div>
);

// ─── Top nav ────────────────────────────────────────────────────────────────
function Nav() {
  return (
    <header className="sticky top-0 z-40 border-b border-line/70 bg-paper/80 backdrop-blur-md">
      <div className="mx-auto flex h-[60px] max-w-[1180px] items-center justify-between px-6">
        <Logo />
        <nav className="hidden md:flex items-center gap-8 text-[13.5px] text-mute">
          <a href="#how" className="hover:text-ink transition-colors">How it works</a>
          <a href="#pricing" className="hover:text-ink transition-colors">Pricing</a>
          <a href="#" className="hover:text-ink transition-colors">Security</a>
          <a href="#" className="hover:text-ink transition-colors">Docs</a>
        </nav>
        <div className="flex items-center gap-2">
          <a href="#" className="hidden sm:inline-flex h-9 items-center rounded-md px-3 text-[13.5px] font-medium text-ink/80 hover:text-ink btn-ghost">
            Sign in
          </a>
          <a href="#" className="btn-primary inline-flex h-9 items-center rounded-md px-3.5 text-[13.5px] font-medium shadow-softer">
            Try it free
          </a>
        </div>
      </div>
    </header>
  );
}

// ─── Hero mockup: Dictation card → SOAP card ───────────────────────────────
function HeroMockup({ variant }) {
  // typewriter for SOAP "Assessment" line
  const [typed, setTyped] = useState('');
  const target = 'GAD with partial response to sertraline; consider augmentation';
  useEffect(() => {
    let i = 0; let cancelled = false;
    const tick = () => {
      if (cancelled) return;
      i = Math.min(i + 1, target.length);
      setTyped(target.slice(0, i));
      if (i < target.length) setTimeout(tick, 24 + Math.random() * 28);
    };
    const start = setTimeout(tick, 700);
    return () => { cancelled = true; clearTimeout(start); };
  }, []);

  return (
    <div className="relative">
      {/* faint backdrop frame */}
      <div className="absolute -inset-6 -z-10 rounded-[28px] bg-gradient-to-br from-teal/[0.04] to-transparent" />
      <div className="absolute -inset-6 -z-10 rounded-[28px] ring-1 ring-line/60" />

      <div className="grid grid-cols-[1fr_auto_1fr] items-stretch gap-0">
        {/* LEFT — dictation */}
        <div className="rounded-l-xl border border-line bg-white shadow-card overflow-hidden">
          <div className="flex items-center justify-between border-b border-line/80 px-4 py-2.5">
            <div className="flex items-center gap-2">
              <span className="block h-2 w-2 rounded-full bg-coral pulse-rec" />
              <span className="text-[11px] font-medium uppercase tracking-[0.08em] text-mute">Dictation</span>
            </div>
            <span className="font-mono text-[11px] tabular-nums text-mute">00:28</span>
          </div>
          <div className="px-4 pt-3 pb-2">
            {/* equalizer */}
            <div className="flex h-7 items-end gap-[3px]">
              {[14,22,10,26,18,24,12,20,16,22,11,25,17,21,9,23,15,19,13].map((h, i) => (
                <span key={i} className="eq-bar block w-[3px] rounded-sm bg-teal/70" style={{ height: h, animationDelay: `${-i * 0.13}s` }} />
              ))}
            </div>
          </div>
          <div className="px-4 pb-4 pt-1 text-[13px] leading-[1.55] text-ink/85">
            <p>
              <span className="text-mute">[00:02]</span> Forty-two-year-old female, follow-up
              for generalized anxiety. Sertraline fifty milligrams for six weeks, sleep is
              improved, still rates anxiety seven out of ten in the mornings…
              <span className="typing-cursor" />
            </p>
          </div>
          <div className="border-t border-line/80 px-4 py-2.5 flex items-center justify-between">
            <span className="font-mono text-[11px] text-mute">en-US · auto-punctuate</span>
            <div className="flex gap-1.5">
              <span className="inline-flex h-5 items-center rounded bg-paper px-1.5 font-mono text-[10px] text-mute border border-line">⏎ Stop</span>
              <span className="inline-flex h-5 items-center rounded bg-paper px-1.5 font-mono text-[10px] text-mute border border-line">␣ Pause</span>
            </div>
          </div>
        </div>

        {/* MIDDLE — arrow */}
        <div className="flex items-center justify-center bg-gradient-to-r from-white via-paper to-white border-t border-b border-line/80 px-1">
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-white border border-line shadow-softer">
            <ArrowRight size={16} stroke={1.8} />
          </div>
        </div>

        {/* RIGHT — SOAP note */}
        <div className="rounded-r-xl border border-line bg-white shadow-card overflow-hidden">
          <div className="flex items-center justify-between border-b border-line/80 px-4 py-2.5">
            <div className="flex items-center gap-2">
              <span className="block h-2 w-2 rounded-full bg-teal" />
              <span className="text-[11px] font-medium uppercase tracking-[0.08em] text-mute">SOAP note</span>
            </div>
            <span className="font-mono text-[11px] tabular-nums text-mute">draft · 11.4s</span>
          </div>
          <div className="px-4 py-3 text-[12.5px] leading-[1.55] text-ink/90 space-y-2.5">
            <SoapLine letter="S" label="Subjective">
              42F, f/u GAD. Reports improved sleep on sertraline 50 mg ×6 wk. Morning anxiety 7/10.
            </SoapLine>
            <SoapLine letter="O" label="Objective">
              Affect anxious, congruent. PHQ-9: 8. GAD-7: 14. No SI/HI.
            </SoapLine>
            <SoapLine letter="A" label="Assessment">
              <span>{typed}<span className="typing-cursor" /></span>
            </SoapLine>
            <SoapLine letter="P" label="Plan" muted>
              Increase sertraline to 75 mg…
            </SoapLine>
          </div>
          <div className="border-t border-line/80 px-4 py-2.5 flex items-center justify-between">
            <span className="inline-flex items-center gap-1.5 font-mono text-[11px] text-teal">
              <Check size={12} stroke={2.2} /> Ready to sign
            </span>
            <span className="inline-flex h-5 items-center rounded bg-paper px-1.5 font-mono text-[10px] text-mute border border-line">⌘ ↵ Sign</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function SoapLine({ letter, label, children, muted }) {
  return (
    <div className="flex gap-3">
      <div className="pt-[2px]">
        <span className="inline-flex h-5 w-5 items-center justify-center rounded-md bg-teal/10 font-display text-[11px] font-semibold text-teal">{letter}</span>
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-[10px] font-medium uppercase tracking-[0.08em] text-mute mb-0.5">{label}</div>
        <div className={muted ? 'text-mute' : ''}>{children}</div>
      </div>
    </div>
  );
}

// ─── Hero ──────────────────────────────────────────────────────────────────
function Hero({ tweaks }) {
  return (
    <section className="relative">
      <div className="absolute inset-0 bg-hairline opacity-[var(--grid-opacity,1)]" style={{ maskImage: 'linear-gradient(to bottom, black 30%, transparent 100%)', WebkitMaskImage: 'linear-gradient(to bottom, black 30%, transparent 100%)' }} />
      <div className="relative mx-auto max-w-[1180px] px-6 pt-20 pb-24 lg:pt-28 lg:pb-32">
        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)] gap-14 lg:gap-16 items-center">
          {/* Copy */}
          <div className="max-w-[560px]">
            <div className="inline-flex items-center gap-2 rounded-full border border-line bg-white/70 backdrop-blur px-3 py-1 text-[12px] text-mute">
              <Lock size={13} stroke={1.7} className="text-teal" />
              HIPAA-aligned · BAA available
            </div>
            <h1 className="mt-6 font-display text-[44px] sm:text-[52px] lg:text-[60px] leading-[1.04] font-medium text-ink">
              Stop typing notes.<br />
              <span className="text-teal">Start seeing patients.</span>
            </h1>
            <p className="mt-6 text-[17px] leading-[1.55] text-ink/70 max-w-[500px]">
              ScribeAI turns your 30-second dictation into a complete SOAP note in
              under 15 seconds — structured, editable, and ready to sign.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <a href="#" className="btn-primary inline-flex h-11 items-center gap-2 rounded-md px-5 text-[14.5px] font-medium shadow-card">
                Try it free
                <ArrowRight size={16} stroke={2} />
              </a>
              <a href="#" className="btn-ghost inline-flex h-11 items-center gap-2 rounded-md border border-line bg-white px-4 text-[14.5px] font-medium text-ink">
                <Play size={11} className="text-teal" />
                See a 30s demo
              </a>
            </div>
            <p className="mt-4 text-[12.5px] text-mute">No credit card. 14-day pilot, then $99/month.</p>
          </div>

          {/* Mockup */}
          <div className="lg:pl-4">
            <HeroMockup variant={tweaks.heroVariant} />
          </div>
        </div>
      </div>
    </section>
  );
}

// ─── How it works ──────────────────────────────────────────────────────────
function HowItWorks() {
  const steps = [
    { n: '01', icon: <MicIcon size={22} stroke={1.6} />, title: 'Dictate', body: 'Speak naturally after the visit. ScribeAI captures with medical-grade speech recognition — no scripts, no templates to memorize.' },
    { n: '02', icon: <SparklesIcon size={22} stroke={1.6} />, title: 'Structure', body: 'Our model separates Subjective, Objective, Assessment and Plan, pulls problem lists and codes, and flags anything ambiguous.' },
    { n: '03', icon: <FileCheckIcon size={22} stroke={1.6} />, title: 'Sign', body: 'Review the draft inline, edit with one keystroke, then sign. We never store audio after the note is finalized.' },
  ];
  return (
    <section id="how" className="border-t border-line/80 bg-white">
      <div className="mx-auto max-w-[1180px] px-6 py-24 lg:py-28">
        <div className="max-w-[640px]">
          <div className="text-[12px] font-medium uppercase tracking-[0.12em] text-teal">How it works</div>
          <h2 className="mt-3 font-display text-[34px] lg:text-[40px] leading-[1.1] font-medium text-ink">
            Three steps, fewer than fifteen seconds.
          </h2>
          <p className="mt-4 text-[15.5px] text-ink/65 max-w-[520px]">
            ScribeAI was built around the workflow clinicians already use, not
            around a new app to learn.
          </p>
        </div>

        <div className="mt-16 grid grid-cols-1 md:grid-cols-3 gap-px bg-line border border-line rounded-xl overflow-hidden">
          {steps.map((s, i) => (
            <div key={i} className="bg-white p-8 lg:p-10 flex flex-col">
              <div className="flex items-center justify-between">
                <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-teal/8 text-teal" style={{ background: 'rgba(15,118,110,0.08)' }}>
                  {s.icon}
                </div>
                <span className="font-mono text-[11px] tabular-nums text-mute">{s.n}</span>
              </div>
              <h3 className="mt-6 font-display text-[22px] font-medium text-ink">{s.title}</h3>
              <p className="mt-2 text-[14.5px] leading-[1.6] text-ink/65">{s.body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ─── Social proof strip ────────────────────────────────────────────────────
function SocialProof() {
  return (
    <section className="border-t border-line/80 bg-paper">
      <div className="mx-auto max-w-[1180px] px-6 py-16">
        <div className="flex flex-col items-center text-center">
          <p className="text-[14px] text-mute">
            Built with input from <span className="text-ink font-medium">12 outpatient psychiatrists</span> across the US and UK.
          </p>
          <div className="mt-8 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-x-10 gap-y-6 w-full max-w-[920px]">
            {[
              ['Northridge', 'Behavioral Health'],
              ['Cedar Hill', 'Psychiatric Group'],
              ['Meridian', 'Outpatient Care'],
              ['Bayshore', 'Mental Health'],
              ['Linden Park', 'Clinic'],
              ['Westgate', 'Psychiatry'],
            ].map(([a, b], i) => (
              <div key={i} className="flex flex-col items-center justify-center h-12 select-none">
                <div className="text-[12.5px] font-semibold tracking-tight text-ink/40 uppercase">{a}</div>
                <div className="text-[10px] tracking-[0.14em] text-ink/30 uppercase mt-0.5">{b}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

// ─── Pricing teaser ────────────────────────────────────────────────────────
function Pricing() {
  const features = [
    'Unlimited notes',
    'SOAP, DAP, and progress note formats',
    'Medical vocabulary & abbreviations',
    'Export to EHR (copy-paste or API)',
    'Audio deleted after signing',
    '30-day money back',
  ];
  return (
    <section id="pricing" className="border-t border-line/80 bg-white">
      <div className="mx-auto max-w-[1180px] px-6 py-24 lg:py-28">
        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] gap-14 items-center">
          <div className="max-w-[480px]">
            <div className="text-[12px] font-medium uppercase tracking-[0.12em] text-teal">Pricing</div>
            <h2 className="mt-3 font-display text-[34px] lg:text-[40px] leading-[1.1] font-medium text-ink">
              One plan. No per-note fees.
            </h2>
            <p className="mt-4 text-[15.5px] text-ink/65">
              We price ScribeAI for the way clinicians actually work — flat,
              predictable, and reversible. If it doesn&rsquo;t save you an hour a
              day in the first month, we refund you.
            </p>
            <div className="mt-6 flex flex-col gap-2 text-[13.5px] text-mute">
              <div className="flex items-center gap-2"><Check size={14} stroke={2} className="text-teal" /> Cancel anytime, in one click.</div>
              <div className="flex items-center gap-2"><Check size={14} stroke={2} className="text-teal" /> SOC 2 Type II in progress.</div>
            </div>
          </div>

          {/* card */}
          <div className="relative">
            <div className="absolute -inset-3 rounded-[20px] bg-gradient-to-br from-teal/[0.04] via-transparent to-coral/[0.04] -z-10" />
            <div className="rounded-2xl border border-line bg-white shadow-card overflow-hidden">
              <div className="p-8 lg:p-10">
                <div className="flex items-start justify-between">
                  <div>
                    <div className="text-[12px] font-medium uppercase tracking-[0.12em] text-mute">Solo</div>
                    <div className="mt-3 flex items-baseline gap-1">
                      <span className="font-display text-[52px] leading-none font-medium text-ink">$99</span>
                      <span className="text-[14px] text-mute">/month</span>
                    </div>
                    <div className="mt-1 text-[13px] text-mute">For independent clinicians.</div>
                  </div>
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-coral/30 bg-coral/8 px-2.5 py-1 text-[11px] font-medium text-coral" style={{ background: 'rgba(249,112,102,0.08)' }}>
                    <span className="block h-1.5 w-1.5 rounded-full bg-coral" />
                    30-day money back
                  </span>
                </div>

                <ul className="mt-8 grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3 text-[14px] text-ink/80">
                  {features.map((f, i) => (
                    <li key={i} className="flex items-start gap-2.5">
                      <span className="mt-[3px] flex h-4 w-4 items-center justify-center rounded-full bg-teal/10 text-teal">
                        <Check size={11} stroke={2.4} />
                      </span>
                      <span>{f}</span>
                    </li>
                  ))}
                </ul>

                <div className="mt-8 flex flex-wrap items-center gap-3">
                  <a href="#" className="btn-primary inline-flex h-11 items-center gap-2 rounded-md px-5 text-[14.5px] font-medium shadow-softer">
                    Start 14-day pilot
                    <ArrowRight size={16} stroke={2} />
                  </a>
                  <a href="#" className="text-[13.5px] font-medium text-ink/70 hover:text-ink">
                    Talk to a clinician on our team →
                  </a>
                </div>
              </div>
              <div className="border-t border-line/80 bg-paper px-8 lg:px-10 py-3.5 flex items-center justify-between text-[12px] text-mute">
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

// ─── Footer ────────────────────────────────────────────────────────────────
function Footer() {
  return (
    <footer className="border-t border-line/80 bg-paper">
      <div className="mx-auto max-w-[1180px] px-6 py-10 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6">
        <div className="flex items-center gap-3">
          <Logo />
          <span className="text-[12.5px] text-mute hidden sm:inline">© 2026 ScribeAI, Inc.</span>
        </div>
        <div className="flex items-center gap-7 text-[13px] text-mute">
          <a href="#" className="hover:text-ink transition-colors">Privacy</a>
          <a href="#" className="hover:text-ink transition-colors">Terms</a>
          <a href="#" className="hover:text-ink transition-colors">Contact</a>
        </div>
      </div>
    </footer>
  );
}

// ─── App ───────────────────────────────────────────────────────────────────
const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "accentUse": "subtle",
  "heroVariant": "split",
  "showGrid": true
}/*EDITMODE-END*/;

function App() {
  const [t, setTweak] = useTweaks(TWEAK_DEFAULTS);

  // accent intensity: how much coral shows up
  useEffect(() => {
    document.documentElement.style.setProperty('--grid-opacity', t.showGrid ? '1' : '0');
  }, [t.showGrid]);

  return (
    <div className="min-h-screen bg-paper">
      <Nav />
      <Hero tweaks={t} />
      <HowItWorks />
      <SocialProof />
      <Pricing />
      <Footer />

      <TweaksPanel>
        <TweakSection label="Hero" />
        <TweakToggle label="Hairline grid" value={t.showGrid}
          onChange={(v) => setTweak('showGrid', v)} />
        <TweakSection label="Accent" />
        <TweakRadio label="Coral usage" value={t.accentUse}
          options={['none', 'subtle', 'bolder']}
          onChange={(v) => setTweak('accentUse', v)} />
      </TweaksPanel>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<App />);
