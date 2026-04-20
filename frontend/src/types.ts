export type JobStatus = "saved" | "applied";
export type ExperienceLevel = "beginner" | "intermediate" | "advanced";
export type Recommendation = "apply" | "consider" | "skip";

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
