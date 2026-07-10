import { FileCheckIcon, MicIcon, SparklesIcon } from "./icons";

const STEPS = [
  {
    n: "01",
    icon: <MicIcon size={22} stroke={1.6} />,
    title: "Capture",
    body:
      "Type or paste your free-text dictation, upload a document (PDF, DOCX, and more), or speak it out loud. You always see and can edit the raw text before it becomes a note.",
  },
  {
    n: "02",
    icon: <SparklesIcon size={22} stroke={1.6} />,
    title: "Structure",
    body:
      "One click separates Subjective, Objective, Assessment and Plan — diagnoses with ICD-10 codes and status (active, resolved, or explicitly ruled out), each medication's dose, route, and frequency, and a flag on anything ambiguous instead of a guess.",
  },
  {
    n: "03",
    icon: <FileCheckIcon size={22} stroke={1.6} />,
    title: "Review & export",
    body:
      "Edit any field inline, then copy as Markdown, download JSON, or export a formatted PDF. Audio is transcribed and discarded — we never store recordings.",
  },
];

export function HowItWorks() {
  return (
    <section id="how" className="border-t border-line/80 bg-white">
      <div className="mx-auto max-w-[1180px] px-6 py-24 lg:py-28">
        <div className="max-w-[640px]">
          <div className="text-[12px] font-medium uppercase tracking-[0.12em] text-teal">
            How it works
          </div>
          <h2 className="font-display mt-3 text-[34px] font-medium leading-[1.1] text-ink lg:text-[40px]">
            Three steps, about fifteen seconds.
          </h2>
          <p className="mt-4 max-w-[520px] text-[15.5px] text-ink/65">
            ScribeAI was built around the workflow clinicians already use, not
            around a new app to learn.
          </p>
        </div>

        <div className="mt-16 grid grid-cols-1 gap-px overflow-hidden rounded-xl border border-line bg-line md:grid-cols-3">
          {STEPS.map((s) => (
            <div key={s.n} className="flex flex-col bg-white p-8 lg:p-10">
              <div className="flex items-center justify-between">
                <div
                  className="flex h-11 w-11 items-center justify-center rounded-lg text-teal"
                  style={{ background: "rgba(15,118,110,0.08)" }}
                >
                  {s.icon}
                </div>
                <span className="font-mono text-[11px] tabular-nums text-mute">
                  {s.n}
                </span>
              </div>
              <h3 className="font-display mt-6 text-[22px] font-medium text-ink">
                {s.title}
              </h3>
              <p className="mt-2 text-[14.5px] leading-[1.6] text-ink/65">
                {s.body}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
