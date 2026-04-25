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
  headline: string;
  summary: string;
  preferred_roles: string[];
  target_seniority: string;
  tech_stack: string[];
  skills: UserSkill[];
  years_of_experience: number;
  english_level: string;
  location: string;
  preferred_locations: string[];
  work_format: "remote" | "hybrid" | "office";
  open_to_relocate: boolean;
  salary_expectation: string;
  github_url: string;
  portfolio_url: string;
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
  attachment_names?: string[];
};

export type ChatAttachment = {
  file_name: string;
  media_type: string;
  data_base64: string;
};
