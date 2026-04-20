export type JobStatus = "saved" | "applied";

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
  created_at: string;
  updated_at: string;
};

export type AuthFormMode = "login" | "register";

