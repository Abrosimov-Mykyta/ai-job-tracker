import {
  FormEvent,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
  useEffect,
  useMemo,
  useState
} from "react";
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
import type {
  AuthFormMode,
  AuthResponse,
  Job,
  JobAnalysis,
  JobStatus,
  Recommendation,
  User,
  UserProfile
} from "./types";

const TOKEN_KEY = "ai-job-tracker-token";
const USER_KEY = "ai-job-tracker-user";
const DEMO_JOBS_KEY = "ai-job-tracker-demo-jobs";
const DEMO_PROFILE_KEY = "ai-job-tracker-demo-profile";
const DEMO_TOKEN = "demo-token";

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
  profile: UserProfile;
  formState: typeof initialJobForm;
  setFormState: Dispatch<SetStateAction<typeof initialJobForm>>;
  onCreateJob: (event: FormEvent<HTMLFormElement>) => Promise<void>;
  onSaveProfile: (event: FormEvent<HTMLFormElement>) => void;
};

type JobPageProps = {
  jobs: Job[];
  jobError: string;
  analysisBusy: boolean;
  profile: UserProfile;
  onAnalyzeJob: (job: Job) => Promise<void>;
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

const demoUser: User = {
  id: 1,
  full_name: "Mykyta Demo",
  email: "demo@ai-job-tracker.local"
};

const demoProfileSeed: UserProfile = {
  preferred_roles: ["Frontend Engineer", "Full-Stack Engineer", "Product Engineer"],
  tech_stack: ["React", "TypeScript", "FastAPI", "PostgreSQL", "Tailwind CSS"],
  skills: [
    { name: "React", level: "advanced", years: 3 },
    { name: "TypeScript", level: "advanced", years: 2 },
    { name: "JavaScript", level: "advanced", years: 4 },
    { name: "Python", level: "intermediate", years: 2 },
    { name: "FastAPI", level: "intermediate", years: 1 },
    { name: "PostgreSQL", level: "intermediate", years: 1 }
  ],
  years_of_experience: 3,
  english_level: "B2",
  location: "Europe",
  work_format: "remote"
};

const demoJobsSeed: Job[] = [
  {
    id: 101,
    company: "Stripe",
    title: "Frontend Engineer",
    link: "https://jobs.stripe.com/frontend-engineer",
    status: "applied",
    notes: "Strong React fit. Recruiter reached out last week. Good portfolio match.",
    job_description:
      "Build polished React and TypeScript product experiences. Collaborate with product and design. Improve frontend architecture and performance.",
    extracted_requirements: ["React", "TypeScript", "Frontend Architecture", "Product Thinking"],
    analysis: {
      match_score: 88,
      strengths: ["Strong React experience", "Solid TypeScript background", "Product-oriented frontend fit"],
      missing_skills: ["None critical"],
      seniority_fit: "good fit",
      recommendation: "apply",
      summary: "This role aligns well with your strongest frontend skills and portfolio direction."
    },
    created_at: "2026-04-18T09:00:00.000Z",
    updated_at: "2026-04-19T14:30:00.000Z"
  },
  {
    id: 102,
    company: "Linear",
    title: "Product Engineer",
    link: "https://linear.app/careers/product-engineer",
    status: "saved",
    notes: "Great product culture. Need to review TypeScript depth and product-thinking angle.",
    job_description:
      "Own full product slices across React, TypeScript, API integrations, and UX polish. Work closely with product and design in a fast-moving team.",
    extracted_requirements: ["React", "TypeScript", "API Integrations", "UX Polish", "Product Thinking"],
    analysis: null,
    created_at: "2026-04-19T11:15:00.000Z",
    updated_at: "2026-04-19T11:15:00.000Z"
  },
  {
    id: 103,
    company: "Remote",
    title: "Full-Stack Developer",
    link: "https://remote.com/careers/full-stack-developer",
    status: "saved",
    notes: "Interesting because of remote-first setup and strong React/FastAPI overlap.",
    job_description:
      "Ship full-stack features using React, Python APIs, PostgreSQL, and cloud tooling. Comfortable across product delivery and backend fundamentals.",
    extracted_requirements: ["React", "Python", "APIs", "PostgreSQL", "Cloud Tooling"],
    analysis: null,
    created_at: "2026-04-20T08:20:00.000Z",
    updated_at: "2026-04-20T08:20:00.000Z"
  }
];

function isDemoSession(token: string | null): boolean {
  return token === DEMO_TOKEN;
}

function getDemoJobs(): Job[] {
  const stored = localStorage.getItem(DEMO_JOBS_KEY);
  if (stored) {
    return JSON.parse(stored) as Job[];
  }
  localStorage.setItem(DEMO_JOBS_KEY, JSON.stringify(demoJobsSeed));
  return demoJobsSeed;
}

function saveDemoJobs(jobs: Job[]) {
  localStorage.setItem(DEMO_JOBS_KEY, JSON.stringify(jobs));
}

function getDemoProfile(): UserProfile {
  const stored = localStorage.getItem(DEMO_PROFILE_KEY);
  if (stored) {
    return JSON.parse(stored) as UserProfile;
  }
  localStorage.setItem(DEMO_PROFILE_KEY, JSON.stringify(demoProfileSeed));
  return demoProfileSeed;
}

function saveDemoProfile(profile: UserProfile) {
  localStorage.setItem(DEMO_PROFILE_KEY, JSON.stringify(profile));
}

function normalizeToken(input: string): string {
  return input.trim().toLowerCase();
}

function inferRequirements(job: Job): string[] {
  if (job.extracted_requirements?.length) {
    return job.extracted_requirements;
  }

  const combined = `${job.title} ${job.notes} ${job.job_description ?? ""}`;
  const keywordMap = [
    "React",
    "TypeScript",
    "JavaScript",
    "Python",
    "FastAPI",
    "PostgreSQL",
    "APIs",
    "Frontend Architecture",
    "Product Thinking",
    "UX Polish",
    "Cloud Tooling"
  ];

  const detected = keywordMap.filter((item) =>
    combined.toLowerCase().includes(item.toLowerCase())
  );

  return detected.length ? detected : ["Communication", "Product Thinking", "Execution"];
}

function analyzeJobAgainstProfile(job: Job, profile: UserProfile): JobAnalysis {
  const requirements = inferRequirements(job);
  const userSkillNames = new Set(profile.skills.map((skill) => normalizeToken(skill.name)));
  const techStack = new Set(profile.tech_stack.map((item) => normalizeToken(item)));
  const matched = requirements.filter((item) => {
    const token = normalizeToken(item);
    return userSkillNames.has(token) || techStack.has(token);
  });
  const missing = requirements.filter((item) => !matched.includes(item));

  const strongRoleFit = profile.preferred_roles.some((role) =>
    normalizeToken(job.title).includes(normalizeToken(role.split(" ")[0]))
  );

  let score = 48;
  score += matched.length * 10;
  score += strongRoleFit ? 8 : 0;
  score += Math.min(profile.years_of_experience * 3, 12);
  score -= missing.length * 6;
  score = Math.max(22, Math.min(96, score));

  const seniorityFit: JobAnalysis["seniority_fit"] =
    profile.years_of_experience <= 1 && /senior|lead/i.test(job.title)
      ? "too junior"
      : profile.years_of_experience >= 6 && /junior|intern/i.test(job.title)
        ? "too senior"
        : "good fit";

  const recommendation: Recommendation =
    score >= 75 ? "apply" : score >= 55 ? "consider" : "skip";

  return {
    match_score: score,
    strengths: matched.length
      ? matched.map((item) => `Matches ${item}`)
      : ["Transferable product and engineering foundation"],
    missing_skills: missing.length ? missing : ["No obvious critical gaps"],
    seniority_fit: seniorityFit,
    recommendation,
    summary:
      recommendation === "apply"
        ? "Strong overlap between this role and your current profile. Worth pursuing."
        : recommendation === "consider"
          ? "There is real potential here, but review the gaps before investing time."
          : "This role looks weaker against your current profile and may not be the best target."
  };
}

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
  const [profile, setProfile] = useState<UserProfile>(getDemoProfile);
  const [authError, setAuthError] = useState("");
  const [jobError, setJobError] = useState("");
  const [loading, setLoading] = useState(false);
  const [analysisBusyId, setAnalysisBusyId] = useState<number | null>(null);
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
      if (isDemoSession(nextToken)) {
        setJobs(getDemoJobs());
        setProfile(getDemoProfile());
        return;
      }
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
      if (isDemoSession(session.token)) {
        const now = new Date().toISOString();
        const createdJob: Job = {
          id: Date.now(),
          company: formState.company,
          title: formState.title,
          link: formState.link,
          notes: formState.notes,
          status: "saved",
          job_description: formState.notes,
          extracted_requirements: inferRequirements({
            id: 0,
            company: formState.company,
            title: formState.title,
            link: formState.link,
            notes: formState.notes,
            status: "saved",
            created_at: now,
            updated_at: now
          }),
          analysis: null,
          created_at: now,
          updated_at: now
        };
        setJobs((currentJobs) => {
          const nextJobs = [createdJob, ...currentJobs];
          saveDemoJobs(nextJobs);
          return nextJobs;
        });
        setFormState(initialJobForm);
        return;
      }

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
      if (isDemoSession(session.token)) {
        setJobs((currentJobs) => {
          const nextJobs = currentJobs.map((item) =>
            item.id === job.id ? { ...item, status, updated_at: new Date().toISOString() } : item
          );
          saveDemoJobs(nextJobs);
          return nextJobs;
        });
        return;
      }
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
      if (isDemoSession(session.token)) {
        setJobs((currentJobs) => {
          const nextJobs = currentJobs.map((item) =>
            item.id === jobId
              ? {
                  ...item,
                  ...payload,
                  job_description: payload.notes ?? item.job_description,
                  extracted_requirements: inferRequirements({
                    ...item,
                    ...payload,
                    job_description: payload.notes ?? item.job_description
                  }),
                  updated_at: new Date().toISOString()
                }
              : item
          );
          saveDemoJobs(nextJobs);
          return nextJobs;
        });
        return;
      }
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
      if (isDemoSession(session.token)) {
        setJobs((currentJobs) => {
          const nextJobs = currentJobs.filter((job) => job.id !== jobId);
          saveDemoJobs(nextJobs);
          return nextJobs;
        });
        return;
      }
      await deleteJob(session.token, jobId);
      setJobs((currentJobs) => currentJobs.filter((job) => job.id !== jobId));
    } catch (error) {
      setJobError(error instanceof Error ? error.message : "Could not delete job.");
    }
  }

  async function handleAnalyzeJob(job: Job) {
    setAnalysisBusyId(job.id);

    try {
      if (session.token && isDemoSession(session.token)) {
        const analysis = analyzeJobAgainstProfile(job, profile);
        setJobs((currentJobs) => {
          const nextJobs = currentJobs.map((item) =>
            item.id === job.id
              ? {
                  ...item,
                  analysis,
                  extracted_requirements: inferRequirements(item),
                  updated_at: new Date().toISOString()
                }
              : item
          );
          saveDemoJobs(nextJobs);
          return nextJobs;
        });
      }
    } finally {
      setAnalysisBusyId(null);
    }
  }

  function handleSaveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const nextProfile: UserProfile = {
      preferred_roles: String(formData.get("preferred_roles") ?? "")
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean),
      tech_stack: String(formData.get("tech_stack") ?? "")
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean),
      years_of_experience: Number(formData.get("years_of_experience") ?? 0),
      english_level: String(formData.get("english_level") ?? "B2"),
      location: String(formData.get("location") ?? "Europe"),
      work_format: String(formData.get("work_format") ?? "remote") as UserProfile["work_format"],
      skills: String(formData.get("skills") ?? "")
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean)
        .map((name) => {
          const existing = profile.skills.find(
            (skill) => normalizeToken(skill.name) === normalizeToken(name)
          );
          return existing ?? { name, level: "intermediate", years: 1 };
        })
    };

    setProfile(nextProfile);
    saveDemoProfile(nextProfile);
  }

  function logout() {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    setSession({ token: null, user: null });
    setJobs([]);
  }

  function enterDemoMode() {
    const nextSession = {
      token: DEMO_TOKEN,
      user: demoUser
    };
    saveDemoJobs(getDemoJobs());
    saveDemoProfile(getDemoProfile());
    setSession(nextSession);
    setProfile(getDemoProfile());
    localStorage.setItem(TOKEN_KEY, DEMO_TOKEN);
    localStorage.setItem(USER_KEY, JSON.stringify(demoUser));
    setAuthError("");
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
                onEnterDemoMode={enterDemoMode}
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
                  onSaveProfile={handleSaveProfile}
                  profile={profile}
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
                  analysisBusy={analysisBusyId !== null}
                  jobError={jobError}
                  jobs={jobs}
                  onAnalyzeJob={handleAnalyzeJob}
                  onDeleteJob={handleDeleteJob}
                  onSaveJob={handleSaveJob}
                  onStatusChange={handleStatusChange}
                  profile={profile}
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
  onEnterDemoMode,
  onAuthSubmit,
  setAuthMode
}: {
  authMode: AuthFormMode;
  authError: string;
  onEnterDemoMode: () => void;
  onAuthSubmit: (event: FormEvent<HTMLFormElement>) => Promise<void>;
  setAuthMode: (mode: AuthFormMode) => void;
}) {
  return (
    <main className="auth-shell">
      <section className="hero-panel">
        <p className="eyebrow">Portfolio Project</p>
        <h1>AI-powered job tracker with a real product shape from day one.</h1>
        <p className="hero-copy">
          Stage 2 now adds profile-driven job analysis with structured match score, strengths,
          missing skills, and clear apply or skip guidance.
        </p>
        <div className="hero-grid">
          <article>
            <span>MVP</span>
            <strong>Auth, dashboard, saved/applied flows</strong>
          </article>
          <article>
            <span>AI analysis</span>
            <strong>Structured scoring from profile to role fit</strong>
          </article>
          <article>
            <span>Backend</span>
            <strong>Frontend remains ready for future analysis APIs</strong>
          </article>
          <article>
            <span>Next</span>
            <strong>Per-job chat and structured application workspace</strong>
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
          <div className="auth-actions">
            <button className="primary-button" type="submit">
              {authMode === "register" ? "Create account" : "Sign in"}
            </button>
            <button className="secondary-button" onClick={onEnterDemoMode} type="button">
              Try demo mode
            </button>
          </div>
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
  onSaveProfile,
  profile,
  savedJobs,
  setFormState
}: DashboardPageProps) {
  const latestAppliedJob = appliedJobs[0];
  const latestSavedJob = savedJobs[0];

  return (
    <>
      <header className="topbar">
        <div>
          <p className="eyebrow">Stage 2 active</p>
          <h1>Track your job search and score roles against your profile</h1>
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
              Job description or notes
              <textarea
                value={formState.notes}
                onChange={(event) =>
                  setFormState((current) => ({ ...current, notes: event.target.value }))
                }
                placeholder="Paste requirements, salary hints, recruiter context, or why the role matters..."
                rows={5}
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
              <p className="eyebrow">AI profile</p>
              <h2>What analysis uses</h2>
            </div>
          </div>
          <form className="job-form" onSubmit={onSaveProfile}>
            <label>
              Preferred roles
              <input
                defaultValue={profile.preferred_roles.join(", ")}
                name="preferred_roles"
                placeholder="Frontend Engineer, Full-Stack Engineer"
              />
            </label>
            <label>
              Tech stack
              <input
                defaultValue={profile.tech_stack.join(", ")}
                name="tech_stack"
                placeholder="React, TypeScript, FastAPI"
              />
            </label>
            <label>
              Skills
              <textarea
                defaultValue={profile.skills.map((skill) => skill.name).join(", ")}
                name="skills"
                rows={4}
              />
            </label>
            <div className="two-column-grid">
              <label>
                Years of experience
                <input
                  defaultValue={profile.years_of_experience}
                  min="0"
                  name="years_of_experience"
                  type="number"
                />
              </label>
              <label>
                English level
                <input defaultValue={profile.english_level} name="english_level" />
              </label>
            </div>
            <div className="two-column-grid">
              <label>
                Location
                <input defaultValue={profile.location} name="location" />
              </label>
              <label>
                Work format
                <select defaultValue={profile.work_format} name="work_format">
                  <option value="remote">Remote</option>
                  <option value="hybrid">Hybrid</option>
                  <option value="office">Office</option>
                </select>
              </label>
            </div>
            <button className="secondary-button" type="submit">
              Save profile
            </button>
          </form>
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
              <p className="eyebrow">Why Stage 2 matters</p>
              <h2>Structured AI output</h2>
            </div>
          </div>
          <ul className="feature-list">
            <li>Profile becomes the source of truth for evaluating roles</li>
            <li>Every job can produce a clear match score and recommendation</li>
            <li>No wall-of-text output, only structured decision support</li>
            <li>This is the bridge from tracker to real AI product behavior</li>
          </ul>
        </article>
      </section>
    </>
  );
}

function JobPage({
  analysisBusy,
  jobError,
  jobs,
  onAnalyzeJob,
  onDeleteJob,
  onSaveJob,
  onStatusChange,
  profile
}: JobPageProps) {
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
                Job description or notes
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
                <span>Description / notes</span>
                <p>{currentJob.notes || "No notes yet."}</p>
              </div>
              <div className="detail-column">
                <span>Detected requirements</span>
                <div className="tag-row">
                  {inferRequirements(currentJob).map((item) => (
                    <span key={item} className="tag">
                      {item}
                    </span>
                  ))}
                </div>
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
              <p className="eyebrow">AI evaluation</p>
              <h2>Profile-based job analysis</h2>
            </div>
          </div>
          <div className="analysis-panel">
            <div className="score-ring score-ring-active">
              <strong>{currentJob.analysis ? `${currentJob.analysis.match_score}%` : "--"}</strong>
              <span>Match</span>
            </div>
            <div className="analysis-content">
              <div className="detail-row">
                <span>Recommendation</span>
                <strong className={`recommendation-pill ${currentJob.analysis?.recommendation ?? "consider"}`}>
                  {currentJob.analysis?.recommendation ?? "not analyzed"}
                </strong>
              </div>
              <div className="detail-row">
                <span>Seniority fit</span>
                <strong>{currentJob.analysis?.seniority_fit ?? "unknown"}</strong>
              </div>
              <p className="muted-text">
                {currentJob.analysis?.summary ??
                  "Run AI analysis to compare this role against your current profile."}
              </p>
              <button
                className="primary-button"
                disabled={analysisBusy}
                onClick={() => onAnalyzeJob(currentJob)}
                type="button"
              >
                {analysisBusy ? "Analyzing..." : "Analyze job with AI"}
              </button>
            </div>
          </div>

          <div className="analysis-grid">
            <article>
              <span>Strengths</span>
              <ul className="compact-list">
                {(currentJob.analysis?.strengths ?? ["Profile strengths will appear here"]).map(
                  (item) => (
                    <li key={item}>{item}</li>
                  )
                )}
              </ul>
            </article>
            <article>
              <span>Missing skills</span>
              <ul className="compact-list">
                {(currentJob.analysis?.missing_skills ?? ["Skill gaps will appear here"]).map(
                  (item) => (
                    <li key={item}>{item}</li>
                  )
                )}
              </ul>
            </article>
          </div>

          <div className="detail-column">
            <span>Current profile snapshot</span>
            <p className="muted-text">
              {profile.years_of_experience} years experience, {profile.work_format} work preference,
              stack: {profile.tech_stack.join(", ")}
            </p>
          </div>
        </article>
      </section>
    </>
  );
}

export default App;
