import type { SOAPNote } from "./types";

export function soapToMarkdown(note: SOAPNote): string {
  const lines: string[] = [];

  lines.push(`# SOAP Note`);
  lines.push("");
  lines.push(`**Chief complaint:** ${note.chief_complaint || "—"}`);
  if (note.follow_up) lines.push(`**Follow-up:** ${note.follow_up}`);
  lines.push("");

  lines.push(`## Subjective`);
  lines.push(note.subjective || "—");
  lines.push("");

  lines.push(`## Objective`);
  lines.push(note.objective || "—");
  lines.push("");

  lines.push(`## Assessment`);
  if (note.assessment.length === 0) {
    lines.push("—");
  } else {
    for (const dx of note.assessment) {
      lines.push(`- ${dx.description} _(${dx.status})_`);
    }
  }
  lines.push("");

  lines.push(`## Plan`);
  lines.push(note.plan || "—");
  lines.push("");

  lines.push(`## Medications prescribed`);
  if (note.medications_prescribed.length === 0) {
    lines.push("—");
  } else {
    for (const m of note.medications_prescribed) {
      lines.push(`- ${m.name} ${m.dose} ${m.route} ${m.frequency}`.replace(/\s+/g, " ").trim());
    }
  }
  lines.push("");

  if (note.flags_for_review.length > 0) {
    lines.push(`## Flags for review`);
    for (const f of note.flags_for_review) lines.push(`- ${f}`);
    lines.push("");
  }

  return lines.join("\n").trimEnd() + "\n";
}
