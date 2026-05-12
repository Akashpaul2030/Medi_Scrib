export type DiagnosisStatus = "active" | "resolved" | "ruled_out";

export interface Diagnosis {
  description: string;
  icd10_code: string | null;
  status: DiagnosisStatus;
}

export interface Medication {
  name: string;
  dose: string;
  route: string;
  frequency: string;
}

export interface SOAPNote {
  chief_complaint: string;
  subjective: string;
  objective: string;
  assessment: Diagnosis[];
  plan: string;
  medications_prescribed: Medication[];
  follow_up: string | null;
  flags_for_review: string[];
}

export interface NoteRecord {
  note_id: string;
  created_at: string;
  chief_complaint: string;
  score: number | null;
}

export interface SearchResponse {
  results: NoteRecord[];
  total: number;
}

export interface NoteDetail {
  note_id: string;
  created_at: string;
  raw_text_length: number;
  note: SOAPNote;
}

export interface AskResponse {
  answer: string;
  sources: NoteRecord[];
  grounded: boolean;
  rewritten: boolean;
}
