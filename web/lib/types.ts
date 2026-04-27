export type DiagnosisStatus = "active" | "resolved" | "ruled_out";

export interface Diagnosis {
  description: string;
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
