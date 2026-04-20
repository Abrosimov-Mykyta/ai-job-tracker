import type { AuthResponse, Job, JobMessage, JobMetadata, UserProfile } from "../types";

const API_BASE_URL = "http://localhost:8000/api";

type RequestOptions = {
  method?: string;
  token?: string | null;
  body?: unknown;
};

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    method: options.method ?? "GET",
    headers: {
      "Content-Type": "application/json",
      ...(options.token ? { Authorization: `Bearer ${options.token}` } : {})
    },
    body: options.body ? JSON.stringify(options.body) : undefined
  });

  if (!response.ok) {
    const errorPayload = await response.json().catch(() => ({ detail: "Request failed." }));
    throw new Error(errorPayload.detail ?? "Request failed.");
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return (await response.json()) as T;
}

export function register(payload: {
  full_name: string;
  email: string;
  password: string;
}): Promise<AuthResponse> {
  return request<AuthResponse>("/auth/register", { method: "POST", body: payload });
}

export function login(payload: { email: string; password: string }): Promise<AuthResponse> {
  return request<AuthResponse>("/auth/login", { method: "POST", body: payload });
}

export function fetchJobs(token: string): Promise<Job[]> {
  return request<Job[]>("/jobs", { token });
}

export function createJob(
  token: string,
  payload: { company: string; title: string; link: string; notes: string }
): Promise<Job> {
  return request<Job>("/jobs", { method: "POST", token, body: payload });
}

export function updateJob(
  token: string,
  jobId: number,
  payload: Partial<Pick<Job, "company" | "title" | "link" | "status" | "notes">>
): Promise<Job> {
  return request<Job>(`/jobs/${jobId}`, { method: "PATCH", token, body: payload });
}

export function deleteJob(token: string, jobId: number): Promise<void> {
  return request<void>(`/jobs/${jobId}`, { method: "DELETE", token });
}

export function parseJobWithAi(
  token: string,
  payload: { job_url: string; job_html?: string }
): Promise<{
  company: string;
  title: string;
  link: string;
  job_description: string;
  extracted_requirements: string[];
  metadata: JobMetadata;
  parser_mode: "fallback" | "llm";
}> {
  return request("/ai/parse", { method: "POST", token, body: payload });
}

export function analyzeJobWithAi(
  token: string,
  payload: { profile: UserProfile; workspace: Job }
): Promise<{
  analysis: Job["analysis"];
  metadata: JobMetadata | null;
  provider_mode: "fallback" | "llm";
}> {
  return request("/ai/analyze", { method: "POST", token, body: payload });
}

export function chatJobWithAi(
  token: string,
  payload: { profile: UserProfile; workspace: Job; message: string }
): Promise<{
  assistant_message: JobMessage;
  metadata_patch: JobMetadata | null;
  notes_append: string | null;
  status_patch: Job["status"] | null;
  provider_mode: "fallback" | "llm";
}> {
  return request("/ai/chat", { method: "POST", token, body: payload });
}
