"use client";

import { useRef, useState } from "react";
import { Nav } from "@/components/nav";
import { soapToMarkdown } from "@/lib/markdown";
import type { Diagnosis, Medication, SOAPNote } from "@/lib/types";

const ALLOWED_TYPES = ".pdf,.docx,.pptx,.html,.htm,.md,.txt";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

const SAMPLE = `Follow-up visit, 34-year-old female with recurrent major depressive disorder and generalized anxiety. Patient reports mood is improved on sertraline 100 mg daily over the last six weeks, sleep better, appetite returning. Still some morning anxiety, denies suicidal ideation, no homicidal ideation, no psychotic symptoms. Mental status: alert, cooperative, mood euthymic, affect congruent, no SI/HI. Continue sertraline 100 mg daily, add hydroxyzine 25 mg PO at bedtime as needed for anxiety. Follow up in 6 weeks.`;

export default function AppPage() {
  const [text, setText] = useState("");
  const [note, setNote] = useState<SOAPNote | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [ingesting, setIngesting] = useState(false);
  const [ingestInfo, setIngestInfo] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function structure() {
    setLoading(true);
    setError(null);
    setCopied(false);
    const started = performance.now();
    try {
      const res = await fetch(`${API_URL}/structure`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      if (!res.ok) {
        const detail = await res.text().catch(() => res.statusText);
        throw new Error(`API ${res.status}: ${detail.slice(0, 200)}`);
      }
      const data = (await res.json()) as SOAPNote;
      setNote(data);
      console.log(`structured in ${Math.round(performance.now() - started)}ms`);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Request failed";
      setError(msg);
    } finally {
      setLoading(false);
    }
  }

  function reset() {
    setText("");
    setNote(null);
    setError(null);
    setCopied(false);
    setIngestInfo(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  async function ingestFile(file: File) {
    setIngesting(true);
    setError(null);
    setIngestInfo(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch(`${API_URL}/ingest`, { method: "POST", body: fd });
      if (!res.ok) {
        const detail = await res.text().catch(() => res.statusText);
        throw new Error(`Ingest ${res.status}: ${detail.slice(0, 200)}`);
      }
      const data = (await res.json()) as {
        text: string;
        page_count: number;
        source_format: string;
        char_count: number;
      };
      setText(data.text);
      setIngestInfo(
        `${file.name} · ${data.source_format} · ${data.page_count} page${data.page_count === 1 ? "" : "s"} · ${data.char_count.toLocaleString()} chars`
      );
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Ingest failed");
    } finally {
      setIngesting(false);
    }
  }

  async function copyMarkdown() {
    if (!note) return;
    await navigator.clipboard.writeText(soapToMarkdown(note));
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  }

  function downloadJson() {
    if (!note) return;
    const blob = new Blob([JSON.stringify(note, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `soap-note-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="min-h-screen bg-paper">
      <Nav />
      <main className="mx-auto max-w-[1180px] px-6 py-10">
        <div className="mb-8 flex items-end justify-between gap-4">
          <div>
            <h1 className="font-display text-[34px] font-medium leading-tight text-ink">
              New note
            </h1>
            <p className="mt-1 text-[14px] text-mute">
              Paste or type your dictation. Structured SOAP note appears on the
              right.
            </p>
          </div>
          {note && (
            <button
              onClick={reset}
              className="btn-ghost h-9 rounded-md border border-line bg-white px-3 text-[13px] font-medium text-ink"
            >
              New note
            </button>
          )}
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <section className="rounded-xl border border-line bg-white p-5 shadow-softer">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-[13px] font-semibold uppercase tracking-wide text-mute">
                Dictation
              </h2>
              <div className="flex items-center gap-3">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept={ALLOWED_TYPES}
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) void ingestFile(f);
                  }}
                />
                <button
                  onClick={() => fileInputRef.current?.click()}
                  disabled={ingesting}
                  className="text-[12.5px] text-teal hover:underline disabled:opacity-50"
                  type="button"
                >
                  {ingesting ? "Parsing…" : "Upload file"}
                </button>
                <button
                  onClick={() => setText(SAMPLE)}
                  className="text-[12.5px] text-teal hover:underline"
                  type="button"
                >
                  Load sample
                </button>
              </div>
            </div>
            {ingestInfo && (
              <p className="mb-2 text-[12px] text-mute">Loaded: {ingestInfo}</p>
            )}
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Follow-up visit, 34-year-old female with recurrent major depressive disorder…"
              className="h-[420px] w-full resize-none rounded-md border border-line bg-paper px-3 py-3 font-mono text-[13.5px] leading-[1.55] text-ink outline-none focus:border-teal"
            />
            <div className="mt-3 flex items-center justify-between">
              <p className="text-[12px] text-mute">{text.length} chars</p>
              <button
                onClick={structure}
                disabled={loading || text.trim().length === 0}
                className="btn-primary inline-flex h-10 items-center gap-2 rounded-md px-4 text-[14px] font-medium shadow-card disabled:opacity-50"
              >
                {loading ? (
                  <>
                    <Spinner /> Structuring…
                  </>
                ) : (
                  "Structure note"
                )}
              </button>
            </div>
            {error && (
              <div className="mt-4 rounded-md border border-coral/40 bg-coral/5 px-3 py-2 text-[13px] text-ink">
                <span className="font-medium text-coral">Error.</span> {error}
              </div>
            )}
          </section>

          <section className="rounded-xl border border-line bg-white p-5 shadow-softer">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-[13px] font-semibold uppercase tracking-wide text-mute">
                Structured SOAP note
              </h2>
              {note && (
                <div className="flex items-center gap-2">
                  <button
                    onClick={copyMarkdown}
                    className="btn-ghost h-8 rounded-md border border-line bg-white px-2.5 text-[12.5px] font-medium text-ink"
                  >
                    {copied ? "Copied" : "Copy as Markdown"}
                  </button>
                  <button
                    onClick={downloadJson}
                    className="btn-ghost h-8 rounded-md border border-line bg-white px-2.5 text-[12.5px] font-medium text-ink"
                  >
                    Download JSON
                  </button>
                </div>
              )}
            </div>

            {!note && !loading && (
              <EmptyState />
            )}
            {loading && !note && <LoadingState />}
            {note && (
              <NoteEditor
                note={note}
                onChange={setNote}
              />
            )}
          </section>
        </div>
      </main>
    </div>
  );
}

function Spinner() {
  return (
    <span
      className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/40 border-t-white"
      aria-hidden="true"
    />
  );
}

function EmptyState() {
  return (
    <div className="flex h-[420px] flex-col items-center justify-center rounded-md border border-dashed border-line text-center">
      <p className="text-[14px] text-mute">No note yet.</p>
      <p className="mt-1 text-[12.5px] text-mute">
        Enter a dictation on the left and click Structure note.
      </p>
    </div>
  );
}

function LoadingState() {
  return (
    <div className="space-y-3">
      {[80, 60, 95, 70, 50].map((w, i) => (
        <div
          key={i}
          className="h-3 animate-pulse rounded bg-line"
          style={{ width: `${w}%` }}
        />
      ))}
    </div>
  );
}

function NoteEditor({
  note,
  onChange,
}: {
  note: SOAPNote;
  onChange: (n: SOAPNote) => void;
}) {
  function patch<K extends keyof SOAPNote>(key: K, value: SOAPNote[K]) {
    onChange({ ...note, [key]: value });
  }

  return (
    <div className="space-y-5">
      <Field
        label="Chief complaint"
        value={note.chief_complaint}
        onChange={(v) => patch("chief_complaint", v)}
        rows={2}
      />
      <Field
        label="Subjective"
        value={note.subjective}
        onChange={(v) => patch("subjective", v)}
        rows={4}
      />
      <Field
        label="Objective"
        value={note.objective}
        onChange={(v) => patch("objective", v)}
        rows={3}
      />

      <DiagnosisList
        items={note.assessment}
        onChange={(v) => patch("assessment", v)}
      />

      <Field
        label="Plan"
        value={note.plan}
        onChange={(v) => patch("plan", v)}
        rows={3}
      />

      <MedicationList
        items={note.medications_prescribed}
        onChange={(v) => patch("medications_prescribed", v)}
      />

      <Field
        label="Follow-up"
        value={note.follow_up ?? ""}
        onChange={(v) => patch("follow_up", v.trim() === "" ? null : v)}
        rows={1}
        placeholder="e.g. 6 weeks"
      />

      <FlagList
        items={note.flags_for_review}
        onChange={(v) => patch("flags_for_review", v)}
      />
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <label className="mb-1 block text-[12px] font-semibold uppercase tracking-wide text-mute">
      {children}
    </label>
  );
}

function Field({
  label,
  value,
  onChange,
  rows = 2,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  rows?: number;
  placeholder?: string;
}) {
  return (
    <div>
      <SectionLabel>{label}</SectionLabel>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={rows}
        placeholder={placeholder}
        className="w-full resize-y rounded-md border border-line bg-paper px-3 py-2 text-[14px] leading-[1.55] text-ink outline-none focus:border-teal"
      />
    </div>
  );
}

function DiagnosisList({
  items,
  onChange,
}: {
  items: Diagnosis[];
  onChange: (v: Diagnosis[]) => void;
}) {
  function update(i: number, patch: Partial<Diagnosis>) {
    onChange(items.map((d, idx) => (idx === i ? { ...d, ...patch } : d)));
  }
  function remove(i: number) {
    onChange(items.filter((_, idx) => idx !== i));
  }
  function add() {
    onChange([...items, { description: "", status: "active" }]);
  }

  return (
    <div>
      <div className="mb-1 flex items-center justify-between">
        <SectionLabel>Assessment</SectionLabel>
        <button
          onClick={add}
          type="button"
          className="text-[12px] text-teal hover:underline"
        >
          + Add diagnosis
        </button>
      </div>
      {items.length === 0 && (
        <p className="text-[13px] text-mute">No diagnoses listed.</p>
      )}
      <ul className="space-y-2">
        {items.map((d, i) => (
          <li
            key={i}
            className="flex items-start gap-2 rounded-md border border-line bg-paper p-2"
          >
            <input
              value={d.description}
              onChange={(e) => update(i, { description: e.target.value })}
              className="flex-1 rounded border border-transparent bg-transparent px-2 py-1 text-[14px] text-ink outline-none focus:border-teal"
              placeholder="Diagnosis"
            />
            <select
              value={d.status}
              onChange={(e) =>
                update(i, { status: e.target.value as Diagnosis["status"] })
              }
              className="rounded border border-line bg-white px-2 py-1 text-[12.5px] text-ink"
            >
              <option value="active">active</option>
              <option value="resolved">resolved</option>
              <option value="ruled_out">ruled out</option>
            </select>
            <button
              onClick={() => remove(i)}
              type="button"
              aria-label="Remove diagnosis"
              className="px-1 text-mute hover:text-coral"
            >
              ×
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function MedicationList({
  items,
  onChange,
}: {
  items: Medication[];
  onChange: (v: Medication[]) => void;
}) {
  function update(i: number, patch: Partial<Medication>) {
    onChange(items.map((m, idx) => (idx === i ? { ...m, ...patch } : m)));
  }
  function remove(i: number) {
    onChange(items.filter((_, idx) => idx !== i));
  }
  function add() {
    onChange([
      ...items,
      { name: "", dose: "", route: "PO", frequency: "" },
    ]);
  }

  return (
    <div>
      <div className="mb-1 flex items-center justify-between">
        <SectionLabel>Medications prescribed</SectionLabel>
        <button
          onClick={add}
          type="button"
          className="text-[12px] text-teal hover:underline"
        >
          + Add medication
        </button>
      </div>
      {items.length === 0 && (
        <p className="text-[13px] text-mute">No medications prescribed.</p>
      )}
      <ul className="space-y-2">
        {items.map((m, i) => (
          <li
            key={i}
            className="grid grid-cols-[1.4fr_0.7fr_0.6fr_1fr_auto] items-center gap-2 rounded-md border border-line bg-paper p-2"
          >
            <input
              value={m.name}
              onChange={(e) => update(i, { name: e.target.value })}
              className="rounded border border-transparent bg-transparent px-2 py-1 text-[14px] text-ink outline-none focus:border-teal"
              placeholder="name"
            />
            <input
              value={m.dose}
              onChange={(e) => update(i, { dose: e.target.value })}
              className="rounded border border-transparent bg-transparent px-2 py-1 text-[13.5px] text-ink outline-none focus:border-teal"
              placeholder="dose"
            />
            <input
              value={m.route}
              onChange={(e) => update(i, { route: e.target.value })}
              className="rounded border border-transparent bg-transparent px-2 py-1 text-[13.5px] text-ink outline-none focus:border-teal"
              placeholder="route"
            />
            <input
              value={m.frequency}
              onChange={(e) => update(i, { frequency: e.target.value })}
              className="rounded border border-transparent bg-transparent px-2 py-1 text-[13.5px] text-ink outline-none focus:border-teal"
              placeholder="frequency"
            />
            <button
              onClick={() => remove(i)}
              type="button"
              aria-label="Remove medication"
              className="px-1 text-mute hover:text-coral"
            >
              ×
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function FlagList({
  items,
  onChange,
}: {
  items: string[];
  onChange: (v: string[]) => void;
}) {
  function update(i: number, value: string) {
    onChange(items.map((f, idx) => (idx === i ? value : f)));
  }
  function remove(i: number) {
    onChange(items.filter((_, idx) => idx !== i));
  }
  function add() {
    onChange([...items, ""]);
  }

  return (
    <div>
      <div className="mb-1 flex items-center justify-between">
        <SectionLabel>Flags for review</SectionLabel>
        <button
          onClick={add}
          type="button"
          className="text-[12px] text-teal hover:underline"
        >
          + Add flag
        </button>
      </div>
      {items.length === 0 ? (
        <p className="text-[13px] text-mute">No flags.</p>
      ) : (
        <ul className="space-y-2">
          {items.map((f, i) => (
            <li
              key={i}
              className="flex items-start gap-2 rounded-md border border-coral/30 bg-coral/5 p-2"
            >
              <input
                value={f}
                onChange={(e) => update(i, e.target.value)}
                className="flex-1 rounded border border-transparent bg-transparent px-2 py-1 text-[14px] text-ink outline-none focus:border-teal"
              />
              <button
                onClick={() => remove(i)}
                type="button"
                aria-label="Remove flag"
                className="px-1 text-mute hover:text-coral"
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
