export type JobStatus = "saved" | "applied";
export type ExperienceLevel = "beginner" | "intermediate" | "advanced";
export type Recommendation = "apply" | "consider" | "skip";
export type MessageRole = "user" | "assistant";

export type User = {
  id: number;
  full_name: string;
  email: string;
};

export type AuthResponse = {
  access_token: string;
  token_type: "bearer";
  user: User;
};

export type Job = {
  id: number;
  company: string;
  title: string;
  link: string;
  status: JobStatus;
  notes: string;
  job_description?: string;
  extracted_requirements?: string[];
  analysis?: JobAnalysis | null;
  metadata?: JobMetadata;
  messages?: JobMessage[];
  created_at: string;
  updated_at: string;
};

export type AuthFormMode = "login" | "register";

export type UserSkill = {
  name: string;
  level: ExperienceLevel;
  years: number;
};

export type UserProfile = {
  preferred_roles: string[];
  tech_stack: string[];
  skills: UserSkill[];
  years_of_experience: number;
  english_level: string;
  location: string;
  work_format: "remote" | "hybrid" | "office";
};

export type JobAnalysis = {
  match_score: number;
  strengths: string[];
  missing_skills: string[];
  seniority_fit: "too junior" | "good fit" | "too senior";
  recommendation: Recommendation;
  summary: string;
};

export type JobMetadata = {
  application_date?: string;
  follow_up_date?: string;
  contact_person?: string;
  source?: string;
  notes_summary?: string;
};

export type JobMessage = {
  id: string;
  role: MessageRole;
  content: string;
  created_at: string;
};
