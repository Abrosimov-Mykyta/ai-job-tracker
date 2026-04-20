import { FormEvent, type Dispatch, type ReactNode, type SetStateAction, useEffect, useMemo, useState } from "react";
import {
  Navigate,
  NavLink,
  Route,
  BrowserRouter as Router,
  Routes,
  useNavigate,
  useParams
} from "react-router-dom";
import {
  createJob,
  deleteJob,
  fetchJobs,
  login,
  register,
  updateJob
} from "./lib/api";
import type { AuthFormMode, AuthResponse, Job, JobStatus, User } from "./types";

const TOKEN_KEY = "ai-job-tracker-token";
const USER_KEY = "ai-job-tracker-user";

const initialJobForm = {
  company: "",
  title: "",
  link: "",
  notes: ""
};

type SessionState = {
  token: string | null;
  user: User | null;
};

type DashboardPageProps = {
  loading: boolean;
  jobError: string;
  jobs: Job[];
  savedJobs: Job[];
  appliedJobs: Job[];
  formState: typeof initialJobForm;
  setFormState: Dispatch<SetStateAction<typeof initialJobForm>>;
  onCreateJob: (event: FormEvent<HTMLFormElement>) => Promise<void>;
};

type JobPageProps = {
  jobs: Job[];
  jobError: string;
  onDeleteJob: (jobId: number) => Promise<void>;
  onStatusChange: (job: Job, status: JobStatus) => Promise<void>;
  onSaveJob: (jobId: number, payload: Partial<JobEditableFields>) => Promise<void>;
};

type AppShellProps = {
  jobs: Job[];
  savedJobs: Job[];
  appliedJobs: Job[];
  userName: string;
  onLogout: () => void;
  children: ReactNode;
};

type JobEditableFields = Pick<Job, "company" | "title" | "link" | "notes">;

function App() {
  const [authMode, setAuthMode] = useState<AuthFormMode>("register");
  const [session, setSession] = useState<SessionState>(() => {
    const token = localStorage.getItem(TOKEN_KEY);
    const storedUser = localStorage.getItem(USER_KEY);
    return {
      token,
      user: storedUser ? (JSON.parse(storedUser) as User) : null
    };
  });
  const [jobs, setJobs] = useState<Job[]>([]);
  const [authError, setAuthError] = useState("");
  const [jobError, setJobError] = useState("");
  const [loading, setLoading] = useState(false);
  const [formState, setFormState] = useState(initialJobForm);

  const savedJobs = useMemo(() => jobs.filter((job) => job.status === "saved"), [jobs]);
  const appliedJobs = useMemo(() => jobs.filter((job) => job.status === "applied"), [jobs]);

  useEffect(() => {
    if (!session.token) {
      return;
    }

    void loadJobs(session.token);
  }, [session.token]);

  async function loadJobs(nextToken: string) {
    try {
      setLoading(true);
      setJobError("");
      const items = await fetchJobs(nextToken);
      setJobs(items);
    } catch (error) {
      setJobError(error instanceof Error ? error.message : "Failed to load jobs.");
    } finally {
      setLoading(false);
    }
  }

  function handleAuthSuccess(response: AuthResponse) {
    const nextSession = {
      token: response.access_token,
      user: response.user
    };
    setSession(nextSession);
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
    if (!session.token) {
      return;
    }

    try {
      setJobError("");
      const createdJob = await createJob(session.token, formState);
      setJobs((currentJobs) => [createdJob, ...currentJobs]);
      setFormState(initialJobForm);
    } catch (error) {
      setJobError(error instanceof Error ? error.message : "Could not create job.");
    }
  }

  async function handleStatusChange(job: Job, status: JobStatus) {
    if (!session.token) {
      return;
    }

    try {
      setJobError("");
      const updated = await updateJob(session.token, job.id, { status });
      setJobs((currentJobs) =>
        currentJobs.map((item) => (item.id === updated.id ? updated : item))
      );
    } catch (error) {
      setJobError(error instanceof Error ? error.message : "Could not update job.");
    }
  }

  async function handleSaveJob(jobId: number, payload: Partial<JobEditableFields>) {
    if (!session.token) {
      return;
    }

    try {
      setJobError("");
      const updated = await updateJob(session.token, jobId, payload);
      setJobs((currentJobs) =>
        currentJobs.map((item) => (item.id === updated.id ? updated : item))
      );
    } catch (error) {
      setJobError(error instanceof Error ? error.message : "Could not save job.");
    }
  }

  async function handleDeleteJob(jobId: number) {
    if (!session.token) {
      return;
    }

    try {
      setJobError("");
      await deleteJob(session.token, jobId);
      setJobs((currentJobs) => currentJobs.filter((job) => job.id !== jobId));
    } catch (error) {
      setJobError(error instanceof Error ? error.message : "Could not delete job.");
    }
  }

  function logout() {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    setSession({ token: null, user: null });
    setJobs([]);
  }

  const isAuthenticated = Boolean(session.token && session.user);

  return (
    <Router>
      <Routes>
        <Route
          path="/auth"
          element={
            isAuthenticated ? (
              <Navigate replace to="/dashboard" />
            ) : (
              <AuthPage
                authError={authError}
                authMode={authMode}
                onAuthSubmit={handleAuthSubmit}
                setAuthMode={setAuthMode}
              />
            )
          }
        />
        <Route
          path="/dashboard"
          element={
            isAuthenticated && session.user ? (
              <AppShell
                appliedJobs={appliedJobs}
                jobs={jobs}
                onLogout={logout}
                savedJobs={savedJobs}
                userName={session.user.full_name}
              >
                <DashboardPage
                  appliedJobs={appliedJobs}
                  formState={formState}
                  jobError={jobError}
                  jobs={jobs}
                  loading={loading}
                  onCreateJob={handleCreateJob}
                  savedJobs={savedJobs}
                  setFormState={setFormState}
                />
              </AppShell>
            ) : (
              <Navigate replace to="/auth" />
            )
          }
        />
        <Route
          path="/jobs/:jobId"
          element={
            isAuthenticated && session.user ? (
              <AppShell
                appliedJobs={appliedJobs}
                jobs={jobs}
                onLogout={logout}
                savedJobs={savedJobs}
                userName={session.user.full_name}
              >
                <JobPage
                  jobError={jobError}
                  jobs={jobs}
                  onDeleteJob={handleDeleteJob}
                  onSaveJob={handleSaveJob}
                  onStatusChange={handleStatusChange}
                />
              </AppShell>
            ) : (
              <Navigate replace to="/auth" />
            )
          }
        />
        <Route
          path="*"
          element={<Navigate replace to={isAuthenticated ? "/dashboard" : "/auth"} />}
        />
      </Routes>
    </Router>
  );
}

function AuthPage({
  authMode,
  authError,
  onAuthSubmit,
  setAuthMode
}: {
  authMode: AuthFormMode;
  authError: string;
  onAuthSubmit: (event: FormEvent<HTMLFormElement>) => Promise<void>;
  setAuthMode: (mode: AuthFormMode) => void;
}) {
  return (
    <main className="auth-shell">
      <section className="hero-panel">
        <p className="eyebrow">Portfolio Project</p>
        <h1>AI-powered job tracker with a real product shape from day one.</h1>
        <p className="hero-copy">
          Stage 1 now includes auth, dashboard navigation, separate job pages, manual tracking,
          and a structured workspace that is ready to grow into AI analysis and chat.
        </p>
        <div className="hero-grid">
          <article>
            <span>MVP</span>
            <strong>Auth, dashboard, saved/applied flows</strong>
          </article>
          <article>
            <span>Workspace</span>
            <strong>Dedicated page for every tracked job</strong>
          </article>
          <article>
            <span>Backend</span>
            <strong>JWT auth plus CRUD API for jobs</strong>
          </article>
          <article>
            <span>Next</span>
            <strong>AI scoring, profile fit, and per-job assistant</strong>
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

        <form className="auth-form" onSubmit={onAuthSubmit}>
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

function AppShell({
  appliedJobs,
  jobs,
  onLogout,
  savedJobs,
  userName,
  children
}: AppShellProps) {
  return (
    <main className="app-shell">
      <aside className="sidebar">
        <div className="sidebar-header">
          <div>
            <p className="eyebrow">AI Job Tracker</p>
            <h2>{userName}</h2>
          </div>
          <button className="ghost-button" onClick={onLogout} type="button">
            Log out
          </button>
        </div>

        <nav className="sidebar-nav">
          <NavLink
            className={({ isActive }) => `nav-link ${isActive ? "active" : ""}`}
            to="/dashboard"
          >
            Dashboard
          </NavLink>
        </nav>

        <SidebarSection jobs={appliedJobs} title="Applied" />
        <SidebarSection jobs={savedJobs} title="Saved" />

        <section className="sidebar-summary">
          <div className="section-title">
            <h3>Overview</h3>
          </div>
          <div className="summary-grid">
            <article>
              <span>Total jobs</span>
              <strong>{jobs.length}</strong>
            </article>
            <article>
              <span>In progress</span>
              <strong>{appliedJobs.length}</strong>
            </article>
          </div>
        </section>
      </aside>

      <section className="content">{children}</section>
    </main>
  );
}

function SidebarSection({ jobs, title }: { jobs: Job[]; title: string }) {
  return (
    <section className="sidebar-section">
      <div className="section-title">
        <h3>{title}</h3>
        <span>{jobs.length}</span>
      </div>
      <div className="job-list">
        {jobs.length ? (
          jobs.map((job) => (
            <NavLink
              key={job.id}
              className={({ isActive }) => `job-list-item ${isActive ? "selected" : ""}`}
              to={`/jobs/${job.id}`}
            >
              <strong>{job.company}</strong>
              <span>{job.title}</span>
            </NavLink>
          ))
        ) : (
          <p className="muted-text">{title} jobs will appear here.</p>
        )}
      </div>
    </section>
  );
}

function DashboardPage({
  appliedJobs,
  formState,
  jobError,
  jobs,
  loading,
  onCreateJob,
  savedJobs,
  setFormState
}: DashboardPageProps) {
  const latestAppliedJob = appliedJobs[0];
  const latestSavedJob = savedJobs[0];

  return (
    <>
      <header className="topbar">
        <div>
          <p className="eyebrow">Stage 1 complete</p>
          <h1>Track your job search in a structured workspace</h1>
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

          <form className="job-form" onSubmit={onCreateJob}>
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
              <p className="eyebrow">Tracker status</p>
              <h2>What this MVP already covers</h2>
            </div>
          </div>
          <ul className="feature-list">
            <li>Authentication and personal workspace entry point</li>
            <li>Saved and applied job tracking with status transitions</li>
            <li>Dedicated detail page for every opportunity</li>
            <li>Manual notes for recruiters, salary hints, and follow-up context</li>
            <li>Backend API ready for profile, AI analysis, and reminders</li>
          </ul>
        </article>
      </section>

      <section className="workspace-grid">
        <article className="panel workspace-panel">
          <div className="panel-header">
            <div>
              <p className="eyebrow">At a glance</p>
              <h2>Next actions</h2>
            </div>
            {loading ? <span className="status-badge">Loading</span> : null}
          </div>
          <div className="dashboard-actions">
            <article className="action-card">
              <span>Latest applied</span>
              <strong>{latestAppliedJob ? latestAppliedJob.company : "No applied jobs yet"}</strong>
              <p>
                {latestAppliedJob
                  ? latestAppliedJob.title
                  : "Move a saved job to applied once you send the application."}
              </p>
              {latestAppliedJob ? (
                <NavLink className="inline-link" to={`/jobs/${latestAppliedJob.id}`}>
                  Open workspace
                </NavLink>
              ) : null}
            </article>
            <article className="action-card">
              <span>Latest saved</span>
              <strong>{latestSavedJob ? latestSavedJob.company : "No saved jobs yet"}</strong>
              <p>
                {latestSavedJob
                  ? latestSavedJob.title
                  : "Add a role to start building your pipeline."}
              </p>
              {latestSavedJob ? (
                <NavLink className="inline-link" to={`/jobs/${latestSavedJob.id}`}>
                  Review job
                </NavLink>
              ) : null}
            </article>
          </div>
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
                Stage 2 will analyze job requirements against your profile and add strengths,
                skill gaps, and a clear recommendation here.
              </p>
              <button className="secondary-button" disabled type="button">
                Analyze job with AI
              </button>
            </div>
          </div>
        </article>
      </section>
    </>
  );
}

function JobPage({ jobError, jobs, onDeleteJob, onSaveJob, onStatusChange }: JobPageProps) {
  const params = useParams<{ jobId: string }>();
  const navigate = useNavigate();
  const jobId = Number(params.jobId);
  const job = jobs.find((item) => item.id === jobId) ?? null;
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [editState, setEditState] = useState<JobEditableFields>({
    company: "",
    title: "",
    link: "",
    notes: ""
  });

  useEffect(() => {
    if (!job) {
      return;
    }

    setEditState({
      company: job.company,
      title: job.title,
      link: job.link,
      notes: job.notes
    });
    setIsEditing(false);
  }, [job]);

  if (!job) {
    return (
      <section className="panel empty-workspace">
        <h2>Job not found</h2>
        <p>The role might have been deleted. Go back to the dashboard and pick another one.</p>
        <NavLink className="primary-button" to="/dashboard">
          Back to dashboard
        </NavLink>
      </section>
    );
  }

  const currentJob = job;

  async function submitEdit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSaving(true);
    await onSaveJob(currentJob.id, editState);
    setIsSaving(false);
    setIsEditing(false);
  }

  async function removeJob() {
    await onDeleteJob(currentJob.id);
    navigate("/dashboard");
  }

  return (
    <>
      <header className="topbar">
        <div>
          <p className="eyebrow">Job workspace</p>
          <h1>{currentJob.title}</h1>
        </div>
        <div className="job-page-actions">
          <button
            className={currentJob.status === "saved" ? "primary-button" : "secondary-button"}
            onClick={() =>
              onStatusChange(
                currentJob,
                currentJob.status === "saved" ? "applied" : "saved"
              )
            }
            type="button"
          >
            {currentJob.status === "saved" ? "Move to applied" : "Move back to saved"}
          </button>
          <button className="ghost-button danger" onClick={removeJob} type="button">
            Decline job
          </button>
        </div>
      </header>

      <section className="workspace-grid">
        <article className="panel workspace-panel">
          <div className="panel-header">
            <div>
              <p className="eyebrow">Details</p>
              <h2>{currentJob.company}</h2>
            </div>
            <span className={`status-pill ${currentJob.status}`}>{currentJob.status}</span>
          </div>

          {isEditing ? (
            <form className="job-form" onSubmit={submitEdit}>
              <label>
                Company
                <input
                  value={editState.company}
                  onChange={(event) =>
                    setEditState((current) => ({ ...current, company: event.target.value }))
                  }
                  required
                />
              </label>
              <label>
                Position title
                <input
                  value={editState.title}
                  onChange={(event) =>
                    setEditState((current) => ({ ...current, title: event.target.value }))
                  }
                  required
                />
              </label>
              <label>
                Job link
                <input
                  type="url"
                  value={editState.link}
                  onChange={(event) =>
                    setEditState((current) => ({ ...current, link: event.target.value }))
                  }
                  required
                />
              </label>
              <label>
                Notes
                <textarea
                  rows={7}
                  value={editState.notes}
                  onChange={(event) =>
                    setEditState((current) => ({ ...current, notes: event.target.value }))
                  }
                />
              </label>
              {jobError ? <p className="error-text">{jobError}</p> : null}
              <div className="job-actions">
                <button className="primary-button" disabled={isSaving} type="submit">
                  {isSaving ? "Saving..." : "Save changes"}
                </button>
                <button
                  className="ghost-button"
                  onClick={() => setIsEditing(false)}
                  type="button"
                >
                  Cancel
                </button>
              </div>
            </form>
          ) : (
            <div className="job-detail">
              <div className="detail-row">
                <span>Company</span>
                <strong>{currentJob.company}</strong>
              </div>
              <div className="detail-row">
                <span>Position</span>
                <strong>{currentJob.title}</strong>
              </div>
              <div className="detail-row">
                <span>Created</span>
                <strong>{new Date(currentJob.created_at).toLocaleDateString()}</strong>
              </div>
              <div className="detail-column">
                <span>Source</span>
                <a href={currentJob.link} rel="noreferrer" target="_blank">
                  {currentJob.link}
                </a>
              </div>
              <div className="detail-column">
                <span>Notes</span>
                <p>{currentJob.notes || "No notes yet."}</p>
              </div>
              {jobError ? <p className="error-text">{jobError}</p> : null}
              <div className="job-actions">
                <button className="secondary-button" onClick={() => setIsEditing(true)} type="button">
                  Edit details
                </button>
              </div>
            </div>
          )}
        </article>

        <article className="panel">
          <div className="panel-header">
            <div>
              <p className="eyebrow">Workspace status</p>
              <h2>Stage 1 snapshot</h2>
            </div>
          </div>
          <div className="detail-stack">
            <div className="detail-row">
              <span>Status</span>
              <strong>
                {currentJob.status === "applied"
                  ? "Application sent"
                  : "Still under review"}
              </strong>
            </div>
            <div className="detail-row">
              <span>Next step</span>
              <strong>
                {currentJob.status === "applied"
                  ? "Prepare follow-up workflow in Stage 3"
                  : "Review and decide whether to apply"}
              </strong>
            </div>
            <div className="detail-column">
              <span>Why this page matters</span>
              <p className="muted-text">
                This dedicated job page becomes the foundation for AI chat, recruiter tracking,
                follow-up dates, and generated answers in later stages.
              </p>
            </div>
          </div>
        </article>
      </section>
    </>
  );
}

export default App;
