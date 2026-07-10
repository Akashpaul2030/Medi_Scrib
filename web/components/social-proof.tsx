const DIFFERENTIATORS: Array<{ title: string; body: string; tag: string }> = [
  {
    tag: "Flags, not guesses",
    title: "Ambiguity is surfaced, never invented",
    body:
      "An unclear dose, a missing route, passive versus active suicidal ideation — anything uncertain lands in a flags-for-review list for you to verify before the note leaves the tool.",
  },
  {
    tag: "Rule-outs captured",
    title: "“Rule out bipolar” stays in the record",
    body:
      "Generic scribes silently drop differentials. ScribeAI records every diagnosis with a status — active, resolved, or explicitly ruled out — with an ICD-10 code when it can be coded confidently.",
  },
  {
    tag: "A memory, not a pile of files",
    title: "Search, ask, and compare across visits",
    body:
      "Every note becomes searchable by meaning. Ask a question across your notes and get a cited, grounded answer — or compare two visits and see exactly what changed in titration and symptoms.",
  },
];

export function SocialProof() {
  return (
    <section id="why" className="border-t border-line/80 bg-paper">
      <div className="mx-auto max-w-[1180px] px-6 py-24 lg:py-28">
        <div className="max-w-[640px]">
          <div className="text-[12px] font-medium uppercase tracking-[0.12em] text-teal">
            Why psychiatry-specific
          </div>
          <h2 className="font-display mt-3 text-[34px] font-medium leading-[1.1] text-ink lg:text-[40px]">
            Psychiatric notes are full of nuance.
            <br />
            Generic scribes mangle it.
          </h2>
          <p className="mt-4 max-w-[560px] text-[15.5px] text-ink/65">
            Rule-outs, risk language, medication titration — the parts of a
            psychiatry note that matter most are the parts generic tools get
            wrong. ScribeAI is built around them, and built to be conservative:
            it only extracts what you actually said.
          </p>
        </div>

        <div className="mt-14 grid grid-cols-1 gap-6 md:grid-cols-3">
          {DIFFERENTIATORS.map((d) => (
            <div
              key={d.tag}
              className="flex flex-col rounded-xl border border-line bg-white p-7 shadow-softer"
            >
              <div className="text-[11px] font-medium uppercase tracking-[0.12em] text-teal">
                {d.tag}
              </div>
              <h3 className="font-display mt-3 text-[19px] font-medium leading-snug text-ink">
                {d.title}
              </h3>
              <p className="mt-2.5 text-[14px] leading-[1.6] text-ink/65">
                {d.body}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
