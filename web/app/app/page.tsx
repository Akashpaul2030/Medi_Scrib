"use client";

import { useEffect, useRef, useState } from "react";
import { useSession, signOut } from "next-auth/react";
import { useRouter } from "next/navigation";
import { Nav } from "@/components/nav";
import { soapToMarkdown } from "@/lib/markdown";
import type { AskResponse, CompareResponse, Diagnosis, Medication, NoteDetail, NoteRecord, PatientRecord, SOAPNote, StructureResponse } from "@/lib/types";

const ALLOWED_TYPES = ".pdf,.docx,.pptx,.html,.htm,.md,.txt";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

const SAMPLE = `Follow-up visit, 34-year-old female with recurrent major depressive disorder and generalized anxiety. Patient reports mood is improved on sertraline 100 mg daily over the last six weeks, sleep better, appetite returning. Still some morning anxiety, denies suicidal ideation, no homicidal ideation, no psychotic symptoms. Mental status: alert, cooperative, mood euthymic, affect congruent, no SI/HI. Continue sertraline 100 mg daily, add hydroxyzine 25 mg PO at bedtime as needed for anxiety. Follow up in 6 weeks.`;

export default function AppPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const userId = session?.user?.id ?? "anonymous";

  useEffect(() => {
    if (status === "unauthenticated") router.push("/login");
  }, [status, router]);

  function authHeaders(): Record<string, string> {
    return { "X-User-Id": userId };
  }

  const [text, setText] = useState("");
  const [note, setNote] = useState<SOAPNote | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [ingesting, setIngesting] = useState(false);
  const [ingestInfo, setIngestInfo] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const outputRef = useRef<HTMLElement>(null);

  const [recording, setRecording] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animFrameRef = useRef<number | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);

  const [currentNoteId, setCurrentNoteId] = useState<string | null>(null);
  const [patientLabel, setPatientLabel] = useState("");
  const [patientLabelSaved, setPatientLabelSaved] = useState(false);
  const [patients, setPatients] = useState<PatientRecord[]>([]);
  const [patientsLoading, setPatientsLoading] = useState(false);
  const [patientView, setPatientView] = useState<string | null>(null);
  const [patientNotes, setPatientNotes] = useState<NoteRecord[]>([]);
  const [patientNotesLoading, setPatientNotesLoading] = useState(false);
  const [compareResult, setCompareResult] = useState<string | null>(null);
  const [compareLoading, setCompareLoading] = useState(false);

  const [historyOpen, setHistoryOpen] = useState(true);
  const [historyTab, setHistoryTab] = useState<"recent" | "search" | "ask" | "patients">("recent");
  const [recentNotes, setRecentNotes] = useState<NoteRecord[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<NoteRecord[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [historySearched, setHistorySearched] = useState(false);

  const [askQuestion, setAskQuestion] = useState("");
  const [askResult, setAskResult] = useState<AskResponse | null>(null);
  const [askLoading, setAskLoading] = useState(false);
  const [genTime, setGenTime] = useState<number | null>(null);

  useEffect(() => {
    if (status === "authenticated") void loadRecent();
  }, [status]);

  useEffect(() => {
    if (historyTab === "patients" && status === "authenticated") void loadPatients();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [historyTab, status]);

  async function loadRecent() {
    setHistoryLoading(true);
    setHistoryError(null);
    try {
      const res = await fetch(`${API_URL}/notes`, { headers: authHeaders() });
      if (!res.ok) throw new Error(`API ${res.status}`);
      const data = (await res.json()) as { results: NoteRecord[]; total: number };
      setRecentNotes(data.results);
    } catch (e: unknown) {
      setHistoryError(e instanceof Error ? e.message : "Failed to load notes");
    } finally {
      setHistoryLoading(false);
    }
  }

  async function doSearch() {
    if (!searchQuery.trim()) return;
    setHistoryLoading(true);
    setHistoryError(null);
    setHistorySearched(true);
    try {
      const res = await fetch(`${API_URL}/search`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({ query: searchQuery, limit: 10 }),
      });
      if (!res.ok) throw new Error(`API ${res.status}`);
      const data = (await res.json()) as { results: NoteRecord[]; total: number };
      setSearchResults(data.results);
    } catch (e: unknown) {
      setHistoryError(e instanceof Error ? e.message : "Search failed");
    } finally {
      setHistoryLoading(false);
    }
  }

  async function doAsk() {
    if (!askQuestion.trim()) return;
    setAskLoading(true);
    setHistoryError(null);
    setAskResult(null);
    try {
      const res = await fetch(`${API_URL}/ask`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({ question: askQuestion }),
      });
      if (!res.ok) throw new Error(`API ${res.status}`);
      const data = (await res.json()) as AskResponse;
      setAskResult(data);
    } catch (e: unknown) {
      setHistoryError(e instanceof Error ? e.message : "Ask failed");
    } finally {
      setAskLoading(false);
    }
  }

  async function loadNote(note_id: string) {
    try {
      const res = await fetch(`${API_URL}/notes/${note_id}`, { headers: authHeaders() });
      if (!res.ok) throw new Error(`API ${res.status}`);
      const data = (await res.json()) as NoteDetail;
      setNote(data.note);
      setCurrentNoteId(note_id);
      setPatientLabel("");
      setPatientLabelSaved(false);
      outputRef.current?.scrollIntoView({ behavior: "smooth" });
    } catch (e: unknown) {
      setHistoryError(e instanceof Error ? e.message : "Failed to load note");
    }
  }

  async function structure() {
    setLoading(true);
    setError(null);
    setCopied(false);
    const started = performance.now();
    try {
      const res = await fetch(`${API_URL}/structure`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({ text }),
      });
      if (!res.ok) {
        const detail = await res.text().catch(() => res.statusText);
        throw new Error(`API ${res.status}: ${detail.slice(0, 200)}`);
      }
      const data = (await res.json()) as StructureResponse;
      setNote(data.note);
      setCurrentNoteId(data.note_id);
      setPatientLabel("");
      setPatientLabelSaved(false);
      setGenTime(Math.round((performance.now() - started) / 100) / 10);
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
    setGenTime(null);
    setCurrentNoteId(null);
    setPatientLabel("");
    setPatientLabelSaved(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  async function ingestFile(file: File) {
    setIngesting(true);
    setError(null);
    setIngestInfo(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch(`${API_URL}/ingest`, { method: "POST", headers: authHeaders(), body: fd });
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

  function drawBars() {
    const canvas = canvasRef.current;
    const analyser = analyserRef.current;
    if (!canvas || !analyser) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);
    analyser.getByteFrequencyData(dataArray);
    const { width, height } = canvas;
    ctx.clearRect(0, 0, width, height);
    const barW = width / bufferLength;
    for (let i = 0; i < bufferLength; i++) {
      const barH = (dataArray[i] / 255) * height;
      ctx.fillStyle = "#14b8a6";
      ctx.fillRect(i * barW, height - barH, Math.max(barW - 1, 1), barH);
    }
    animFrameRef.current = requestAnimationFrame(drawBars);
  }

  function stopVisualizer() {
    if (animFrameRef.current !== null) {
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = null;
    }
    void audioCtxRef.current?.close();
    audioCtxRef.current = null;
    analyserRef.current = null;
  }

  async function toggleRecording() {
    if (recording) {
      stopVisualizer();
      mediaRecorderRef.current?.stop();
      setRecording(false);
      return;
    }
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

    const audioCtx = new AudioContext();
    const analyser = audioCtx.createAnalyser();
    analyser.fftSize = 128;
    audioCtx.createMediaStreamSource(stream).connect(analyser);
    analyserRef.current = analyser;
    audioCtxRef.current = audioCtx;
    drawBars();

    const mr = new MediaRecorder(stream);
    chunksRef.current = [];
    mr.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
    mr.onstop = async () => {
      stream.getTracks().forEach(t => t.stop());
      const blob = new Blob(chunksRef.current, { type: "audio/webm" });
      const fd = new FormData();
      fd.append("audio", blob, "recording.webm");
      setIngesting(true);
      setError(null);
      try {
        const res = await fetch(`${API_URL}/transcribe`, { method: "POST", headers: authHeaders(), body: fd });
        if (!res.ok) throw new Error(`Transcribe ${res.status}`);
        const data = (await res.json()) as { text: string };
        setText(data.text);
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : "Transcription failed");
      } finally {
        setIngesting(false);
      }
    };
    mediaRecorderRef.current = mr;
    mr.start();
    setRecording(true);
  }

  async function assignLabel() {
    if (!currentNoteId || !patientLabel.trim()) return;
    try {
      const res = await fetch(`${API_URL}/notes/${currentNoteId}/label`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({ patient_label: patientLabel.trim() }),
      });
      if (!res.ok) throw new Error(`API ${res.status}`);
      setPatientLabelSaved(true);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Label assignment failed");
    }
  }

  async function loadPatients() {
    setPatientsLoading(true);
    try {
      const res = await fetch(`${API_URL}/patients`, { headers: authHeaders() });
      if (!res.ok) throw new Error(`API ${res.status}`);
      const data = (await res.json()) as { patients: PatientRecord[] };
      setPatients(data.patients);
    } catch {
      // silent — tab will show empty state
    } finally {
      setPatientsLoading(false);
    }
  }

  async function loadPatientNotes(label: string) {
    setPatientNotesLoading(true);
    setCompareResult(null);
    try {
      const res = await fetch(
        `${API_URL}/patients/${encodeURIComponent(label)}/notes`,
        { headers: authHeaders() },
      );
      if (!res.ok) throw new Error(`API ${res.status}`);
      const data = (await res.json()) as { results: NoteRecord[] };
      setPatientNotes(data.results);
    } catch {
      setPatientNotes([]);
    } finally {
      setPatientNotesLoading(false);
    }
  }

  async function doCompare(histNote: NoteRecord) {
    if (!note) {
      setCompareResult("Open a note in the editor first, then click vs.");
      return;
    }
    setCompareLoading(true);
    setCompareResult(null);
    try {
      const res1 = await fetch(`${API_URL}/notes/${histNote.note_id}`, { headers: authHeaders() });
      if (!res1.ok) throw new Error(`API ${res1.status}`);
      const detail = (await res1.json()) as NoteDetail;
      const res2 = await fetch(`${API_URL}/compare`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({ note_a: detail.note, note_b: note }),
      });
      if (!res2.ok) throw new Error(`API ${res2.status}`);
      const data = (await res2.json()) as CompareResponse;
      setCompareResult(data.summary);
    } catch (e: unknown) {
      setCompareResult("Compare failed: " + (e instanceof Error ? e.message : "unknown"));
    } finally {
      setCompareLoading(false);
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

  async function downloadPdf() {
    if (!note) return;
    try {
      const res = await fetch(`${API_URL}/export/pdf`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({ note, created_at: new Date().toISOString() }),
      });
      if (!res.ok) throw new Error(`PDF export ${res.status}`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `soap-note-${Date.now()}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "PDF export failed");
    }
  }

  if (status === "loading" || status === "unauthenticated") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-paper">
        <p className="text-[14px] text-mute">Loading…</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-paper">
      <Nav />
      <main className="mx-auto max-w-[1600px] px-6 py-10">
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
          <div className="flex items-center gap-2">
            <span className="text-[12px] text-mute">{session?.user?.email}</span>
            <button
              onClick={() => void signOut({ callbackUrl: "/login" })}
              className="btn-ghost h-9 rounded-md border border-line bg-white px-3 text-[13px] font-medium text-ink"
            >
              Sign out
            </button>
            <button
              onClick={() => setHistoryOpen(!historyOpen)}
              className="btn-ghost h-9 rounded-md border border-line bg-white px-3 text-[13px] font-medium text-ink"
            >
              History {historyOpen ? "◂" : "▸"}
            </button>
            {note && (
              <button
                onClick={reset}
                className="btn-ghost h-9 rounded-md border border-line bg-white px-3 text-[13px] font-medium text-ink"
              >
                New note
              </button>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_1fr_340px]">
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
                  onClick={() => void toggleRecording()}
                  disabled={ingesting}
                  className={`text-[12.5px] hover:underline disabled:opacity-50 ${recording ? "font-semibold text-coral" : "text-teal"}`}
                  type="button"
                >
                  {recording ? "● Stop recording" : "🎤 Record"}
                </button>
                <button
                  onClick={() => fileInputRef.current?.click()}
                  disabled={ingesting || recording}
                  className="text-[12.5px] text-teal hover:underline disabled:opacity-50"
                  type="button"
                >
                  {ingesting ? "Transcribing…" : "Upload file"}
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
            <canvas
              ref={canvasRef}
              width={800}
              height={40}
              className={`w-full rounded-md bg-paper ${recording ? "mb-2 block" : "hidden"}`}
              style={{ height: "40px" }}
            />
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
            {genTime !== null && !loading && (
              <p className="mt-2 text-right text-[11.5px] text-mute">
                Generated in {genTime}s
              </p>
            )}
            {error && (
              <div className="mt-4 rounded-md border border-coral/40 bg-coral/5 px-3 py-2 text-[13px] text-ink">
                <span className="font-medium text-coral">Error.</span> {error}
              </div>
            )}
          </section>

          <section ref={outputRef} className="rounded-xl border border-line bg-white p-5 shadow-softer">
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
                  <button
                    onClick={() => void downloadPdf()}
                    className="btn-ghost h-8 rounded-md border border-line bg-white px-2.5 text-[12.5px] font-medium text-ink"
                  >
                    Download PDF
                  </button>
                </div>
              )}
            </div>

            {!note && !loading && (
              <EmptyState />
            )}
            {loading && !note && <LoadingState />}
            {note && (
              <>
                <NoteEditor note={note} onChange={setNote} />
                <div className="mt-4 flex items-center gap-2 rounded-md border border-line bg-paper px-3 py-2">
                  <span className="shrink-0 text-[11px] font-semibold uppercase tracking-wide text-mute">
                    Patient
                  </span>
                  <input
                    value={patientLabel}
                    onChange={(e) => { setPatientLabel(e.target.value); setPatientLabelSaved(false); }}
                    placeholder="e.g. Jane Doe or MR-00123"
                    className="flex-1 rounded border border-transparent bg-transparent px-2 py-1 text-[13px] text-ink outline-none focus:border-teal"
                  />
                  <button
                    onClick={() => void assignLabel()}
                    disabled={!patientLabel.trim() || patientLabelSaved || !currentNoteId}
                    className="btn-ghost h-7 shrink-0 rounded border border-line bg-white px-2.5 text-[12px] font-medium text-ink disabled:opacity-50"
                  >
                    {patientLabelSaved ? "Saved ✓" : "Assign"}
                  </button>
                </div>
              </>
            )}
          </section>
          <aside className={historyOpen ? "flex flex-col overflow-hidden rounded-xl border border-line bg-white shadow-softer" : "hidden"}>
            <div className="flex shrink-0 border-b border-line">
              {(["recent", "search", "ask", "patients"] as const).map((tab) => (
                <button
                  key={tab}
                  onClick={() => { setHistoryTab(tab); if (tab === "patients") setPatientView(null); }}
                  className={`flex-1 py-2 text-[11px] font-semibold uppercase transition-colors ${
                    historyTab === tab ? "-mb-px border-b-2 border-teal text-teal" : "text-mute hover:text-ink"
                  }`}
                >
                  {tab === "recent" ? "Recent" : tab === "search" ? "Search" : tab === "ask" ? "Ask" : "Patients"}
                </button>
              ))}
            </div>

            <div className="flex-1 overflow-y-auto p-3">
              {historyError && (
                <p className="mb-2 rounded-md border border-coral/40 bg-coral/5 px-3 py-2 text-[12px] text-coral">
                  {historyError}
                </p>
              )}
              {historyLoading && historyTab !== "ask" && (
                <div className="space-y-2 pt-2">
                  {[70, 90, 60].map((w, i) => (
                    <div key={i} className="h-2.5 animate-pulse rounded bg-line" style={{ width: `${w}%` }} />
                  ))}
                </div>
              )}

              {!historyLoading && historyTab === "recent" && (
                recentNotes.length === 0 ? (
                  <p className="pt-8 text-center text-[12.5px] text-mute">
                    No notes yet. Structure a note to see it here.
                  </p>
                ) : (
                  <ul className="space-y-1.5">
                    {recentNotes.map((n) => (
                      <NoteRow key={n.note_id} record={n} onClick={() => void loadNote(n.note_id)} />
                    ))}
                  </ul>
                )
              )}

              {!historyLoading && historyTab === "search" && (
                <div className="space-y-3">
                  <div className="flex gap-2">
                    <input
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter") void doSearch(); }}
                      placeholder="Search notes…"
                      className="flex-1 rounded-md border border-line bg-paper px-2.5 py-1.5 text-[13px] text-ink outline-none focus:border-teal"
                    />
                    <button
                      onClick={() => void doSearch()}
                      disabled={!searchQuery.trim()}
                      className="btn-ghost h-8 shrink-0 rounded-md border border-line bg-white px-2.5 text-[12.5px] font-medium text-ink disabled:opacity-50"
                    >
                      Go
                    </button>
                  </div>
                  {!historySearched && (
                    <p className="pt-6 text-center text-[12.5px] text-mute">
                      Enter a query to search your notes.
                    </p>
                  )}
                  {historySearched && searchResults.length === 0 && (
                    <p className="pt-6 text-center text-[12.5px] text-mute">
                      No matching notes found.
                    </p>
                  )}
                  {searchResults.length > 0 && (
                    <ul className="space-y-1.5">
                      {searchResults.map((n) => (
                        <NoteRow key={n.note_id} record={n} showScore onClick={() => void loadNote(n.note_id)} />
                      ))}
                    </ul>
                  )}
                </div>
              )}

              {historyTab === "ask" && (
                <div className="space-y-3">
                  <div className="flex gap-2">
                    <input
                      value={askQuestion}
                      onChange={(e) => setAskQuestion(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter") void doAsk(); }}
                      placeholder="e.g. which patients were on sertraline?"
                      className="flex-1 rounded-md border border-line bg-paper px-2.5 py-1.5 text-[13px] text-ink outline-none focus:border-teal"
                    />
                    <button
                      onClick={() => void doAsk()}
                      disabled={askLoading || !askQuestion.trim()}
                      className="btn-ghost h-8 shrink-0 rounded-md border border-line bg-white px-2.5 text-[12.5px] font-medium text-ink disabled:opacity-50"
                    >
                      {askLoading ? "…" : "Ask"}
                    </button>
                  </div>

                  {!askResult && !askLoading && (
                    <div className="pt-4 text-center">
                      <p className="text-[12.5px] text-mute">
                        Ask anything across all stored notes.
                      </p>
                      <p className="mt-2 text-[11.5px] text-mute/70">
                        Try: "which patients were on sertraline?" or
                        "who had mood episodes with insomnia?"
                      </p>
                    </div>
                  )}

                  {askLoading && (
                    <div className="space-y-2 pt-2">
                      {[80, 60, 90].map((w, i) => (
                        <div key={i} className="h-2.5 animate-pulse rounded bg-line"
                          style={{ width: `${w}%` }} />
                      ))}
                    </div>
                  )}

                  {askResult && (
                    <div className="space-y-3">
                      <div className="flex items-center gap-2">
                        <span className={`rounded-full px-2 py-0.5 text-[10.5px] font-semibold uppercase tracking-wide ${
                          askResult.grounded
                            ? "bg-teal/10 text-teal"
                            : "bg-coral/10 text-coral"
                        }`}>
                          {askResult.grounded ? "Grounded" : "Unverified"}
                        </span>
                        {askResult.rewritten && (
                          <span className="text-[10.5px] text-mute">Query rewritten</span>
                        )}
                      </div>

                      <p className="rounded-md border border-line bg-paper px-3 py-2.5 text-[13px] leading-[1.6] text-ink">
                        {askResult.answer}
                      </p>

                      {askResult.sources.length > 0 && (
                        <div>
                          <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-mute">
                            Sources
                          </p>
                          <ul className="space-y-1.5">
                            {askResult.sources.map((s) => (
                              <NoteRow
                                key={s.note_id}
                                record={s}
                                onClick={() => void loadNote(s.note_id)}
                              />
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}


              {historyTab === "patients" && (
                <div className="space-y-2">
                  {patientView === null ? (
                    <>
                      {patientsLoading && (
                        <div className="space-y-2 pt-2">
                          {[70, 90, 60].map((w, i) => (
                            <div key={i} className="h-2.5 animate-pulse rounded bg-line" style={{ width: `${w}%` }} />
                          ))}
                        </div>
                      )}
                      {!patientsLoading && patients.length === 0 && (
                        <p className="pt-8 text-center text-[12.5px] text-mute">
                          No labeled patients yet. Assign a patient label after structuring a note.
                        </p>
                      )}
                      {patients.map((p) => (
                        <button
                          key={p.patient_label}
                          onClick={() => {
                            setPatientView(p.patient_label);
                            void loadPatientNotes(p.patient_label);
                          }}
                          className="w-full rounded-md border border-line bg-paper p-2.5 text-left transition-colors hover:border-teal hover:bg-white"
                        >
                          <p className="truncate text-[13px] font-medium text-ink">
                            {p.patient_label}
                          </p>
                          <p className="mt-0.5 text-[11.5px] text-mute">
                            {p.note_count} note{p.note_count !== 1 ? "s" : ""} · last{" "}
                            {new Date(p.last_visit).toLocaleDateString("en-US", {
                              month: "short", day: "numeric", year: "numeric",
                            })}
                          </p>
                        </button>
                      ))}
                    </>
                  ) : (
                    <>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => { setPatientView(null); setCompareResult(null); }}
                          className="text-[12px] text-teal hover:underline"
                        >
                          ← Back
                        </button>
                        <span className="truncate text-[13px] font-medium text-ink">
                          {patientView}
                        </span>
                      </div>

                      {compareResult && (
                        <div className="rounded-md border border-teal/30 bg-teal/5 p-3">
                          <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-teal">
                            Comparison
                          </p>
                          <p className="whitespace-pre-wrap text-[12.5px] leading-[1.6] text-ink">
                            {compareResult}
                          </p>
                        </div>
                      )}

                      {patientNotesLoading && (
                        <div className="space-y-2 pt-2">
                          {[70, 90, 60].map((w, i) => (
                            <div key={i} className="h-2.5 animate-pulse rounded bg-line" style={{ width: `${w}%` }} />
                          ))}
                        </div>
                      )}
                      {!patientNotesLoading && patientNotes.length === 0 && (
                        <p className="pt-4 text-center text-[12.5px] text-mute">No notes.</p>
                      )}
                      {patientNotes.map((n) => (
                        <div key={n.note_id} className="flex items-stretch gap-1">
                          <div className="min-w-0 flex-1">
                            <NoteRow record={n} onClick={() => void loadNote(n.note_id)} />
                          </div>
                          <button
                            onClick={() => void doCompare(n)}
                            disabled={compareLoading || n.note_id === currentNoteId}
                            title={
                              n.note_id === currentNoteId
                                ? "This is the note currently loaded"
                                : "Compare with current note"
                            }
                            className="shrink-0 self-stretch rounded-md border border-line bg-white px-2 text-[11px] font-medium text-teal hover:border-teal disabled:opacity-40"
                          >
                            {compareLoading ? "…" : n.note_id === currentNoteId ? "—" : !note ? "load→vs" : "vs"}
                          </button>
                        </div>
                      ))}
                    </>
                  )}
                </div>
              )}
            </div>
          </aside>
        </div>
      </main>
    </div>
  );
}

function NoteRow({
  record,
  showScore = false,
  onClick,
}: {
  record: NoteRecord;
  showScore?: boolean;
  onClick: () => void;
}) {
  return (
    <li>
      <button
        onClick={onClick}
        className="w-full rounded-md border border-line bg-paper p-2.5 text-left transition-colors hover:border-teal hover:bg-white"
      >
        <p className="truncate text-[13px] font-medium leading-tight text-ink">
          {record.chief_complaint}
        </p>
        <div className="mt-1 flex items-center justify-between gap-2">
          <p className="text-[11.5px] text-mute">
            {new Date(record.created_at).toLocaleDateString("en-US", {
              month: "short",
              day: "numeric",
              year: "numeric",
            })}
          </p>
          {showScore && record.score != null && (
            <span className="rounded bg-teal/10 px-1.5 py-0.5 text-[10.5px] font-medium text-teal">
              {(record.score * 100).toFixed(0)}%
            </span>
          )}
        </div>
      </button>
    </li>
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
    onChange([...items, { description: "", icd10_code: null, status: "active" }]);
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
            <input
              value={d.icd10_code ?? ""}
              onChange={(e) => update(i, { icd10_code: e.target.value.trim() || null })}
              className="w-[72px] rounded border border-transparent bg-transparent px-2 py-1 text-[12.5px] font-mono text-mute outline-none focus:border-teal"
              placeholder="ICD-10"
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
