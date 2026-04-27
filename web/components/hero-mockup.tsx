"use client";

import { useEffect, useState } from "react";
import { ArrowRight, Check } from "./icons";

const EQ_HEIGHTS = [14, 22, 10, 26, 18, 24, 12, 20, 16, 22, 11, 25, 17, 21, 9, 23, 15, 19, 13];
const SOAP_TARGET = "GAD with partial response to sertraline; consider augmentation";

export function HeroMockup() {
  const [typed, setTyped] = useState("");

  useEffect(() => {
    let i = 0;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;

    const tick = () => {
      if (cancelled) return;
      i = Math.min(i + 1, SOAP_TARGET.length);
      setTyped(SOAP_TARGET.slice(0, i));
      if (i < SOAP_TARGET.length) {
        timer = setTimeout(tick, 24 + Math.random() * 28);
      }
    };

    const start = setTimeout(tick, 700);
    return () => {
      cancelled = true;
      clearTimeout(start);
      clearTimeout(timer);
    };
  }, []);

  return (
    <div className="relative">
      <div className="absolute -inset-6 -z-10 rounded-[28px] bg-gradient-to-br from-teal/[0.04] to-transparent" />
      <div className="absolute -inset-6 -z-10 rounded-[28px] ring-1 ring-line/60" />

      <div className="grid grid-cols-[1fr_auto_1fr] items-stretch gap-0">
        {/* LEFT — dictation */}
        <div className="overflow-hidden rounded-l-xl border border-line bg-white shadow-card">
          <div className="flex items-center justify-between border-b border-line/80 px-4 py-2.5">
            <div className="flex items-center gap-2">
              <span className="pulse-rec block h-2 w-2 rounded-full bg-coral" />
              <span className="text-[11px] font-medium uppercase tracking-[0.08em] text-mute">
                Dictation
              </span>
            </div>
            <span className="font-mono text-[11px] tabular-nums text-mute">
              00:28
            </span>
          </div>
          <div className="px-4 pb-2 pt-3">
            <div className="flex h-7 items-end gap-[3px]">
              {EQ_HEIGHTS.map((h, i) => (
                <span
                  key={i}
                  className="eq-bar block w-[3px] rounded-sm bg-teal/70"
                  style={{ height: h, animationDelay: `${-i * 0.13}s` }}
                />
              ))}
            </div>
          </div>
          <div className="px-4 pb-4 pt-1 text-[13px] leading-[1.55] text-ink/85">
            <p>
              <span className="text-mute">[00:02]</span> Forty-two-year-old
              female, follow-up for generalized anxiety. Sertraline fifty
              milligrams for six weeks, sleep is improved, still rates anxiety
              seven out of ten in the mornings…
              <span className="typing-cursor" />
            </p>
          </div>
          <div className="flex items-center justify-between border-t border-line/80 px-4 py-2.5">
            <span className="font-mono text-[11px] text-mute">
              en-US · auto-punctuate
            </span>
            <div className="flex gap-1.5">
              <span className="inline-flex h-5 items-center rounded border border-line bg-paper px-1.5 font-mono text-[10px] text-mute">
                ⏎ Stop
              </span>
              <span className="inline-flex h-5 items-center rounded border border-line bg-paper px-1.5 font-mono text-[10px] text-mute">
                ␣ Pause
              </span>
            </div>
          </div>
        </div>

        {/* MIDDLE — arrow */}
        <div className="flex items-center justify-center border-b border-t border-line/80 bg-gradient-to-r from-white via-paper to-white px-1">
          <div className="flex h-9 w-9 items-center justify-center rounded-full border border-line bg-white shadow-softer">
            <ArrowRight size={16} stroke={1.8} />
          </div>
        </div>

        {/* RIGHT — SOAP note */}
        <div className="overflow-hidden rounded-r-xl border border-line bg-white shadow-card">
          <div className="flex items-center justify-between border-b border-line/80 px-4 py-2.5">
            <div className="flex items-center gap-2">
              <span className="block h-2 w-2 rounded-full bg-teal" />
              <span className="text-[11px] font-medium uppercase tracking-[0.08em] text-mute">
                SOAP note
              </span>
            </div>
            <span className="font-mono text-[11px] tabular-nums text-mute">
              draft · 11.4s
            </span>
          </div>
          <div className="space-y-2.5 px-4 py-3 text-[12.5px] leading-[1.55] text-ink/90">
            <SoapLine letter="S" label="Subjective">
              42F, f/u GAD. Reports improved sleep on sertraline 50 mg ×6 wk.
              Morning anxiety 7/10.
            </SoapLine>
            <SoapLine letter="O" label="Objective">
              Affect anxious, congruent. PHQ-9: 8. GAD-7: 14. No SI/HI.
            </SoapLine>
            <SoapLine letter="A" label="Assessment">
              <span>
                {typed}
                <span className="typing-cursor" />
              </span>
            </SoapLine>
            <SoapLine letter="P" label="Plan" muted>
              Increase sertraline to 75 mg…
            </SoapLine>
          </div>
          <div className="flex items-center justify-between border-t border-line/80 px-4 py-2.5">
            <span className="inline-flex items-center gap-1.5 font-mono text-[11px] text-teal">
              <Check size={12} stroke={2.2} /> Ready to sign
            </span>
            <span className="inline-flex h-5 items-center rounded border border-line bg-paper px-1.5 font-mono text-[10px] text-mute">
              ⌘ ↵ Sign
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

function SoapLine({
  letter,
  label,
  children,
  muted,
}: {
  letter: string;
  label: string;
  children: React.ReactNode;
  muted?: boolean;
}) {
  return (
    <div className="flex gap-3">
      <div className="pt-[2px]">
        <span className="inline-flex h-5 w-5 items-center justify-center rounded-md bg-teal/10 font-display text-[11px] font-semibold text-teal">
          {letter}
        </span>
      </div>
      <div className="min-w-0 flex-1">
        <div className="mb-0.5 text-[10px] font-medium uppercase tracking-[0.08em] text-mute">
          {label}
        </div>
        <div className={muted ? "text-mute" : ""}>{children}</div>
      </div>
    </div>
  );
}
