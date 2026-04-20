import { FormEvent, useEffect, useMemo, useState } from "react";
import {
  createJob,
  deleteJob,
  fetchJobs,
  login,
  register,
  updateJob
} from "./lib/api";
import type { AuthFormMode, AuthResponse, Job, JobStatus } from "./types";

const TOKEN_KEY = "ai-job-tracker-token";
const USER_KEY = "ai-job-tracker-user";

const initialForm = {
  company: "",
  title: "",
  link: "",
  notes: ""
};

function App() {
  const [authMode, setAuthMode] = useState<AuthFormMode>("register");
  const [token, setToken] = useState<string | null>(() => localStorage.getItem(TOKEN_KEY));
  const [userName, setUserName] = useState<string>(() => {
    const value = localStorage.getItem(USER_KEY);
    return value ? JSON.parse(value).full_name : "";
  });
  const [jobs, setJobs] = useState<Job[]>([]);
  const [selectedJobId, setSelectedJobId] = useState<number | null>(null);
  const [authError, setAuthError] = useState("");
  const [jobError, setJobError] = useState("");
  const [loading, setLoading] = useState(false);
  const [formState, setFormState] = useState(initialForm);

  const selectedJob = jobs.find((job) => job.id === selectedJobId) ?? null;
  const savedJobs = useMemo(() => jobs.filter((job) => job.status === "saved"), [jobs]);
  const appliedJobs = useMemo(() => jobs.filter((job) => job.status === "applied"), [jobs]);

  useEffect(() => {
    if (!token) {
      return;
    }

    void loadJobs(token);
  }, [token]);

  async function loadJobs(nextToken: string) {
    try {
      setLoading(true);
      const items = await fetchJobs(nextToken);
      setJobs(items);
      if (!selectedJobId && items[0]) {
        setSelectedJobId(items[0].id);
      }
    } catch (error) {
      setJobError(error instanceof Error ? error.message : "Failed to load jobs.");
    } finally {
      setLoading(false);
    }
  }

  function handleAuthSuccess(response: AuthResponse) {
    setToken(response.access_token);
    setUserName(response.user.full_name);
    localStorage.setItem(TOKEN_KEY, response.access_token);
    localStorage.setItem(USER_KEY, JSON.stringify(response.user));
    setAuthError("");
  }

  async function handleAuthSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setAuthError("");

    const formData = new FormData(event.currentTarget);
    const email = String(formData.get("email") ?? "");
    const password = String(formData.get("password") ?? "");
    const fullName = String(formData.get("fullName") ?? "");

    try {
      const response =
        authMode === "register"
          ? await register({ full_name: fullName, email, password })
          : await login({ email, password });
      handleAuthSuccess(response);
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : "Authentication failed.");
    }
  }

  async function handleCreateJob(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token) {
      return;
    }

    try {
      setJobError("");
      const createdJob = await createJob(token, formState);
      const nextJobs = [createdJob, ...jobs];
      setJobs(nextJobs);
      setSelectedJobId(createdJob.id);
      setFormState(initialForm);
    } catch (error) {
      setJobError(error instanceof Error ? error.message : "Could not create job.");
    }
  }

  async function handleStatusChange(job: Job, status: JobStatus) {
    if (!token) {
      return;
    }

    try {
      const updated = await updateJob(token, job.id, { status });
      setJobs((currentJobs) =>
        currentJobs.map((item) => (item.id === updated.id ? updated : item))
      );
      setSelectedJobId(updated.id);
    } catch (error) {
      setJobError(error instanceof Error ? error.message : "Could not update job.");
    }
  }

  async function handleDeleteJob(jobId: number) {
    if (!token) {
      return;
    }

    try {
      await deleteJob(token, jobId);
      const nextJobs = jobs.filter((job) => job.id !== jobId);
      setJobs(nextJobs);
      setSelectedJobId(nextJobs[0]?.id ?? null);
    } catch (error) {
      setJobError(error instanceof Error ? error.message : "Could not delete job.");
    }
  }

  function logout() {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    setToken(null);
    setUserName("");
    setJobs([]);
    setSelectedJobId(null);
  }

  if (!token) {
    return (
      <main className="auth-shell">
        <section className="hero-panel">
          <p className="eyebrow">Portfolio Project</p>
          <h1>AI-powered job tracker with room to grow into a real product.</h1>
          <p className="hero-copy">
            Start with a clean Stage 1 foundation now, then layer in AI evaluation, job
            workspaces, reminders, and follow-up automation without rewriting the app.
          </p>
          <div className="hero-grid">
            <article>
              <span>Stage 1</span>
              <strong>Tracker + auth + workspace shell</strong>
            </article>
            <article>
              <span>Stage 2</span>
              <strong>AI match score and profile comparison</strong>
            </article>
            <article>
              <span>Stage 3</span>
              <strong>Per-job chat and structured metadata</strong>
            </article>
            <article>
              <span>Stage 4</span>
              <strong>Follow-ups, generators, and insights</strong>
            </article>
          </div>
        </section>

        <section className="auth-card">
          <div className="auth-toggle">
            <button
              className={authMode === "register" ? "active" : ""}
              onClick={() => setAuthMode("register")}
              type="button"
            >
              Register
            </button>
            <button
              className={authMode === "login" ? "active" : ""}
              onClick={() => setAuthMode("login")}
              type="button"
            >
              Login
            </button>
          </div>

          <form className="auth-form" onSubmit={handleAuthSubmit}>
            <h2>{authMode === "register" ? "Create your workspace" : "Welcome back"}</h2>
            {authMode === "register" ? (
              <label>
                Full name
                <input name="fullName" placeholder="Jane Doe" required />
              </label>
            ) : null}
            <label>
              Email
              <input name="email" placeholder="jane@example.com" required type="email" />
            </label>
            <label>
              Password
              <input name="password" placeholder="Minimum 8 characters" required type="password" />
            </label>
            {authError ? <p className="error-text">{authError}</p> : null}
            <button className="primary-button" type="submit">
              {authMode === "register" ? "Create account" : "Sign in"}
            </button>
          </form>
        </section>
      </main>
    );
  }

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <div className="sidebar-header">
          <div>
            <p className="eyebrow">AI Job Tracker</p>
            <h2>{userName}</h2>
          </div>
          <button className="ghost-button" onClick={logout} type="button">
            Log out
          </button>
        </div>

        <section className="sidebar-section">
          <div className="section-title">
            <h3>Applied</h3>
            <span>{appliedJobs.length}</span>
          </div>
          <div className="job-list">
            {appliedJobs.length ? (
              appliedJobs.map((job) => (
                <button
                  key={job.id}
                  className={`job-list-item ${selectedJobId === job.id ? "selected" : ""}`}
                  onClick={() => setSelectedJobId(job.id)}
                  type="button"
                >
                  <strong>{job.company}</strong>
                  <span>{job.title}</span>
                </button>
              ))
            ) : (
              <p className="muted-text">Applied jobs will appear here.</p>
            )}
          </div>
        </section>

        <section className="sidebar-section">
          <div className="section-title">
            <h3>Saved</h3>
            <span>{savedJobs.length}</span>
          </div>
          <div className="job-list">
            {savedJobs.length ? (
              savedJobs.map((job) => (
                <button
                  key={job.id}
                  className={`job-list-item ${selectedJobId === job.id ? "selected" : ""}`}
                  onClick={() => setSelectedJobId(job.id)}
                  type="button"
                >
                  <strong>{job.company}</strong>
                  <span>{job.title}</span>
                </button>
              ))
            ) : (
              <p className="muted-text">Saved jobs will appear here.</p>
            )}
          </div>
        </section>
      </aside>

      <section className="content">
        <header className="topbar">
          <div>
            <p className="eyebrow">Stage 1 foundation</p>
            <h1>Track every application in one structured workspace</h1>
          </div>
          <div className="topbar-metrics">
            <article>
              <span>Total</span>
              <strong>{jobs.length}</strong>
            </article>
            <article>
              <span>Saved</span>
              <strong>{savedJobs.length}</strong>
            </article>
            <article>
              <span>Applied</span>
              <strong>{appliedJobs.length}</strong>
            </article>
          </div>
        </header>

        <section className="dashboard-grid">
          <article className="panel">
            <div className="panel-header">
              <div>
                <p className="eyebrow">New job</p>
                <h2>Add a role manually</h2>
              </div>
            </div>

            <form className="job-form" onSubmit={handleCreateJob}>
              <label>
                Company
                <input
                  value={formState.company}
                  onChange={(event) =>
                    setFormState((current) => ({ ...current, company: event.target.value }))
                  }
                  placeholder="Stripe"
                  required
                />
              </label>
              <label>
                Position title
                <input
                  value={formState.title}
                  onChange={(event) =>
                    setFormState((current) => ({ ...current, title: event.target.value }))
                  }
                  placeholder="Frontend Engineer"
                  required
                />
              </label>
              <label>
                Job link
                <input
                  value={formState.link}
                  onChange={(event) =>
                    setFormState((current) => ({ ...current, link: event.target.value }))
                  }
                  placeholder="https://company.com/jobs/123"
                  required
                  type="url"
                />
              </label>
              <label>
                Notes
                <textarea
                  value={formState.notes}
                  onChange={(event) =>
                    setFormState((current) => ({ ...current, notes: event.target.value }))
                  }
                  placeholder="Why this role matters, salary hints, recruiter details..."
                  rows={4}
                />
              </label>
              {jobError ? <p className="error-text">{jobError}</p> : null}
              <button className="primary-button" type="submit">
                Save job
              </button>
            </form>
          </article>

          <article className="panel panel-accent">
            <div className="panel-header">
              <div>
                <p className="eyebrow">What comes next</p>
                <h2>AI-ready architecture</h2>
              </div>
            </div>
            <ul className="feature-list">
              <li>Per-job workspace shell is already in place.</li>
              <li>Jobs store notes and status for future AI analysis.</li>
              <li>Backend models are ready to extend with profile, chat, and reminders.</li>
              <li>JWT auth and PostgreSQL create a realistic full-stack baseline.</li>
            </ul>
          </article>
        </section>

        <section className="workspace-grid">
          <article className="panel workspace-panel">
            <div className="panel-header">
              <div>
                <p className="eyebrow">Workspace</p>
                <h2>{selectedJob ? selectedJob.title : "Select a job"}</h2>
              </div>
              {loading ? <span className="status-badge">Loading</span> : null}
            </div>

            {selectedJob ? (
              <div className="job-detail">
                <div className="detail-row">
                  <span>Company</span>
                  <strong>{selectedJob.company}</strong>
                </div>
                <div className="detail-row">
                  <span>Status</span>
                  <strong className={`status-pill ${selectedJob.status}`}>
                    {selectedJob.status}
                  </strong>
                </div>
                <div className="detail-row">
                  <span>Created</span>
                  <strong>{new Date(selectedJob.created_at).toLocaleDateString()}</strong>
                </div>
                <div className="detail-column">
                  <span>Source</span>
                  <a href={selectedJob.link} rel="noreferrer" target="_blank">
                    {selectedJob.link}
                  </a>
                </div>
                <div className="detail-column">
                  <span>Notes</span>
                  <p>{selectedJob.notes || "No notes yet."}</p>
                </div>

                <div className="job-actions">
                  {selectedJob.status === "saved" ? (
                    <button
                      className="primary-button"
                      onClick={() => handleStatusChange(selectedJob, "applied")}
                      type="button"
                    >
                      Move to applied
                    </button>
                  ) : (
                    <button
                      className="secondary-button"
                      onClick={() => handleStatusChange(selectedJob, "saved")}
                      type="button"
                    >
                      Move back to saved
                    </button>
                  )}
                  <button
                    className="ghost-button danger"
                    onClick={() => handleDeleteJob(selectedJob.id)}
                    type="button"
                  >
                    Decline job
                  </button>
                </div>
              </div>
            ) : (
              <div className="empty-workspace">
                <h3>No job selected yet</h3>
                <p>
                  Add your first job or pick one from the sidebar. This panel becomes the main
                  workspace in Stage 3 when per-job chat lands.
                </p>
              </div>
            )}
          </article>

          <article className="panel">
            <div className="panel-header">
              <div>
                <p className="eyebrow">Upcoming AI</p>
                <h2>Evaluation panel</h2>
              </div>
            </div>
            <div className="ai-placeholder">
              <div className="score-ring">
                <strong>--</strong>
                <span>Match</span>
              </div>
              <div>
                <p className="muted-text">
                  Stage 2 will add profile-based analysis, strengths, missing skills, and apply/skip
                  recommendations here.
                </p>
                <button className="secondary-button" disabled type="button">
                  Analyze job with AI
                </button>
              </div>
            </div>
          </article>
        </section>
      </section>
    </main>
  );
}

export default App;

