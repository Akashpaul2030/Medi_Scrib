const PRACTICES: Array<[string, string]> = [
  ["Northridge", "Behavioral Health"],
  ["Cedar Hill", "Psychiatric Group"],
  ["Meridian", "Outpatient Care"],
  ["Bayshore", "Mental Health"],
  ["Linden Park", "Clinic"],
  ["Westgate", "Psychiatry"],
];

export function SocialProof() {
  return (
    <section className="border-t border-line/80 bg-paper">
      <div className="mx-auto max-w-[1180px] px-6 py-16">
        <div className="flex flex-col items-center text-center">
          <p className="text-[14px] text-mute">
            Built with input from{" "}
            <span className="font-medium text-ink">
              12 outpatient psychiatrists
            </span>{" "}
            across the US and UK.
          </p>
          <div className="mt-8 grid w-full max-w-[920px] grid-cols-2 gap-x-10 gap-y-6 sm:grid-cols-3 lg:grid-cols-6">
            {PRACTICES.map(([a, b]) => (
              <div
                key={a}
                className="flex h-12 select-none flex-col items-center justify-center"
              >
                <div className="text-[12.5px] font-semibold uppercase tracking-tight text-ink/40">
                  {a}
                </div>
                <div className="mt-0.5 text-[10px] uppercase tracking-[0.14em] text-ink/30">
                  {b}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
