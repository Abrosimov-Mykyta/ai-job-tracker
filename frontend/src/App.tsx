import {
  FormEvent,
  type KeyboardEvent,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
  useEffect,
  useMemo,
  useState
} from "react";
import {
  BrowserRouter as Router,
  Navigate,
  NavLink,
  Route,
  Routes,
  useNavigate,
  useParams
} from "react-router-dom";
import {
  analyzeJobWithAi,
  chatJobWithAi,
  createJob,
  deleteJob,
  fetchJobs,
  login,
  parseJobWithAi,
  register,
  updateJob
} from "./lib/api";
import type {
  AuthFormMode,
  AuthResponse,
  Job,
  JobAnalysis,
  JobMessage,
  JobMetadata,
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
  isDemoMode: boolean;
  loading: boolean;
  jobError: string;
  jobs: Job[];
  savedJobs: Job[];
  appliedJobs: Job[];
  profile: UserProfile;
  profileMessage: string;
  formState: typeof initialJobForm;
  importBusy: boolean;
  setFormState: Dispatch<SetStateAction<typeof initialJobForm>>;
  onCreateJob: (event: FormEvent<HTMLFormElement>) => Promise<void>;
  onImportJob: () => Promise<void>;
  onSaveProfile: (event: FormEvent<HTMLFormElement>) => void;
};

type JobPageProps = {
  isDemoMode: boolean;
  jobs: Job[];
  jobError: string;
  analysisBusyId: number | null;
  messageBusyId: number | null;
  profile: UserProfile;
  onAnalyzeJob: (job: Job) => Promise<void>;
  onDeleteJob: (jobId: number) => Promise<void>;
  onSendMessage: (job: Job, message: string) => Promise<void>;
  onStatusChange: (job: Job, status: JobStatus) => Promise<void>;
  onSaveJob: (jobId: number, payload: Partial<JobEditableFields>) => Promise<void>;
};

type AppShellProps = {
  jobs: Job[];
  savedJobs: Job[];
  appliedJobs: Job[];
  userName: string;
  isDemoMode: boolean;
  onLogout: () => void;
  children: ReactNode;
};

type JobEditableFields = Pick<Job, "company" | "title" | "link" | "notes">;

type ImportedJobDraft = Pick<Job, "job_description" | "extracted_requirements" | "metadata">;

type AssistantCommandResult = {
  assistantContent: string;
  metadataPatch?: Partial<JobMetadata>;
  statusPatch?: JobStatus;
  notesAppend?: string;
};

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

function createMessage(role: JobMessage["role"], content: string, createdAt?: string): JobMessage {
  return {
    id: `${role}-${createdAt ?? new Date().toISOString()}-${Math.random().toString(36).slice(2, 8)}`,
    role,
    content,
    created_at: createdAt ?? new Date().toISOString()
  };
}

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
      strengths: [
        "Strong React experience",
        "Solid TypeScript background",
        "Product-oriented frontend fit"
      ],
      missing_skills: ["None critical"],
      seniority_fit: "good fit",
      recommendation: "apply",
      summary: "This role aligns well with your strongest frontend skills and portfolio direction."
    },
    metadata: {
      application_date: "2026-04-19",
      follow_up_date: "2026-04-24",
      contact_person: "Mia Johnson",
      source: "Stripe careers",
      notes_summary: "Already applied. Prepare follow-up and interview prep notes."
    },
    messages: [
      createMessage(
        "assistant",
        "This workspace is scoped to Stripe only. Ask me about fit, follow-ups, or update the application details with natural language.",
        "2026-04-19T10:00:00.000Z"
      ),
      createMessage(
        "user",
        "Recruiter is Mia Johnson",
        "2026-04-19T10:03:00.000Z"
      ),
      createMessage(
        "assistant",
        "Got it. I saved Mia Johnson as the contact person for this application.",
        "2026-04-19T10:03:03.000Z"
      )
    ],
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
    metadata: {
      source: "Linear careers",
      notes_summary: "Still evaluating whether this should move to applied."
    },
    messages: [
      createMessage(
        "assistant",
        "This job is still in your saved pipeline. I can help you evaluate fit or capture structured details before you apply.",
        "2026-04-19T11:16:00.000Z"
      )
    ],
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
    metadata: {
      source: "Remote careers"
    },
    messages: [
      createMessage(
        "assistant",
        "I can track application dates, follow-up reminders, recruiter names, and notes here once you start engaging with this role.",
        "2026-04-20T08:25:00.000Z"
      )
    ],
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

function todayIsoDate(): string {
  return new Date().toISOString().slice(0, 10);
}

function addDaysIsoDate(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

function getLinkSourceLabel(link: string): string {
  try {
    return new URL(link).hostname.replace(/^www\./, "");
  } catch {
    return "Manual entry";
  }
}

function formatDisplayDate(value?: string): string {
  if (!value) {
    return "Not set";
  }
  return new Date(`${value}T00:00:00`).toLocaleDateString();
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

function parseAssistantCommand(job: Job, message: string): AssistantCommandResult | null {
  const lower = message.trim().toLowerCase();

  if (lower === "i applied today" || lower.includes("i applied today")) {
    return {
      statusPatch: "applied",
      metadataPatch: {
        application_date: todayIsoDate()
      },
      assistantContent: "Saved. I marked this job as applied and set the application date to today."
    };
  }

  const recruiterMatch = message.match(/recruiter is (.+)/i);
  if (recruiterMatch) {
    return {
      metadataPatch: {
        contact_person: recruiterMatch[1].trim()
      },
      assistantContent: `Got it. I saved ${recruiterMatch[1].trim()} as the contact person for this job.`
    };
  }

  const followUpInDaysMatch = message.match(/follow up in (\d+) days?/i);
  if (followUpInDaysMatch) {
    const days = Number(followUpInDaysMatch[1]);
    return {
      metadataPatch: {
        follow_up_date: addDaysIsoDate(days)
      },
      assistantContent: `Done. I scheduled the follow-up for ${formatDisplayDate(addDaysIsoDate(days))}.`
    };
  }

  const followUpOnDateMatch = message.match(/follow up on (\d{4}-\d{2}-\d{2})/i);
  if (followUpOnDateMatch) {
    return {
      metadataPatch: {
        follow_up_date: followUpOnDateMatch[1]
      },
      assistantContent: `Done. I saved the follow-up date as ${formatDisplayDate(
        followUpOnDateMatch[1]
      )}.`
    };
  }

  const noteMatch = message.match(/note[:\-]?\s+(.+)/i);
  if (noteMatch) {
    return {
      notesAppend: noteMatch[1].trim(),
      metadataPatch: {
        notes_summary: noteMatch[1].trim()
      },
      assistantContent: "Saved. I added that note to this workspace."
    };
  }

  const contactMatch = message.match(/contact person is (.+)/i);
  if (contactMatch) {
    return {
      metadataPatch: {
        contact_person: contactMatch[1].trim()
      },
      assistantContent: `Saved. ${contactMatch[1].trim()} is now stored as the contact person.`
    };
  }

  if (lower.includes("summarize fit") || lower.includes("why is this a good fit")) {
    return {
      assistantContent: job.analysis
        ? `${job.analysis.summary} Strengths: ${job.analysis.strengths.join(
            ", "
          )}. Missing skills: ${job.analysis.missing_skills.join(", ")}.`
        : "Run analysis first and I’ll summarize the fit using your candidate profile."
    };
  }

  if (lower.includes("what should i do next")) {
    const nextStep =
      job.status === "applied"
        ? job.metadata?.follow_up_date
          ? `Your next clear move is to follow up on ${formatDisplayDate(job.metadata.follow_up_date)}.`
          : "You already applied, so the next strong step is to set a follow-up date."
        : "This role is still saved, so decide whether to apply or keep researching the fit.";

    return {
      assistantContent: `${nextStep} I can also save recruiter details or reminders from a short command.`
    };
  }

  return null;
}

function buildAssistantReply(job: Job, profile: UserProfile, message: string): AssistantCommandResult {
  const commandResult = parseAssistantCommand(job, message);
  if (commandResult) {
    return commandResult;
  }

  if (!job.analysis) {
    return {
      assistantContent:
        "I can help with this role, but the strongest next step is to run job analysis first so I can answer with clearer fit context."
    };
  }

  const topStrength = job.analysis.strengths[0] ?? "your transferable engineering background";
  const topGap = job.analysis.missing_skills[0] ?? "no major skill gaps";

  return {
    assistantContent: `For ${job.company}, your strongest angle is ${topStrength.toLowerCase()}. The biggest gap is ${topGap.toLowerCase()}. Based on your ${profile.years_of_experience} years of experience, I’d position you as a ${job.analysis.seniority_fit} candidate and focus your application on execution plus product impact.`
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
  const [profileMessage, setProfileMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [analysisBusyId, setAnalysisBusyId] = useState<number | null>(null);
  const [importBusy, setImportBusy] = useState(false);
  const [messageBusyId, setMessageBusyId] = useState<number | null>(null);
  const [formState, setFormState] = useState(initialJobForm);
  const [importDraft, setImportDraft] = useState<ImportedJobDraft | null>(null);

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
        setProfileMessage("");
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
        const metadata: JobMetadata = {
          source: "Manual entry",
          notes_summary: formState.notes || "New opportunity added to the pipeline."
        };
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
          metadata,
          messages: [
            createMessage(
              "assistant",
              `Workspace created for ${formState.company}. You can ask me to track recruiter details, application dates, follow-ups, and notes for this role.`,
              now
            )
          ],
          created_at: now,
          updated_at: now
        };
        setJobs((currentJobs) => {
          const nextJobs = [createdJob, ...currentJobs];
          saveDemoJobs(nextJobs);
          return nextJobs;
        });
        setFormState(initialJobForm);
        setImportDraft(null);
        return;
      }

      const now = new Date().toISOString();
      const starterMessage = createMessage(
        "assistant",
        `Workspace created for ${formState.company}. I can parse fit, track recruiter details, and update this application workspace as you go.`,
        now
      );
      const createdJob = await createJob(session.token, {
        ...formState,
        job_description: importDraft?.job_description ?? formState.notes,
        extracted_requirements:
          importDraft?.extracted_requirements ??
          inferRequirements({
            id: 0,
            company: formState.company,
            title: formState.title,
            link: formState.link,
            notes: formState.notes,
            status: "saved",
            job_description: formState.notes,
            created_at: now,
            updated_at: now
          }),
        metadata:
          importDraft?.metadata ?? {
            source: getLinkSourceLabel(formState.link),
            notes_summary: formState.notes || "New opportunity added to the pipeline."
          },
        messages: [starterMessage]
      });
      setJobs((currentJobs) => [createdJob, ...currentJobs]);
      setFormState(initialJobForm);
      setImportDraft(null);
    } catch (error) {
      setJobError(error instanceof Error ? error.message : "Could not create job.");
    }
  }

  async function handleImportJob() {
    if (!session.token || !formState.link.trim()) {
      setJobError("Add a job link first.");
      return;
    }

    setImportBusy(true);
    setJobError("");

    try {
      if (isDemoSession(session.token)) {
        const inferredTitle = formState.title || "Imported job";
        const inferredCompany = formState.company || "Imported company";
        setFormState((current) => ({
          ...current,
          company: inferredCompany,
          title: inferredTitle,
          notes:
            current.notes ||
            `Imported from link. Review requirements and confirm the job description before applying.`
        }));
        setImportDraft({
          job_description:
            formState.notes ||
            "Imported from link. Review requirements and confirm the job description before applying.",
          extracted_requirements: inferRequirements({
            id: 0,
            company: inferredCompany,
            title: inferredTitle,
            link: formState.link,
            notes: formState.notes,
            status: "saved",
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          }),
          metadata: {
            source: "Imported link",
            notes_summary: "Imported from job link."
          }
        });
        return;
      }

      const parsed = await parseJobWithAi(session.token, { job_url: formState.link });
      setImportDraft({
        job_description: parsed.job_description,
        extracted_requirements: parsed.extracted_requirements,
        metadata: parsed.metadata
      });
      setFormState((current) => ({
        ...current,
        company: parsed.company,
        title: parsed.title,
        link: parsed.link,
        notes: parsed.job_description
      }));
      setProfileMessage(
        parsed.parser_mode === "llm"
          ? "Job link parsed with live AI."
          : "Job link parsed in fallback mode. Review fields before saving."
      );
    } catch (error) {
      setJobError(error instanceof Error ? error.message : "Could not import this job link.");
    } finally {
      setImportBusy(false);
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
            item.id === job.id
              ? {
                  ...item,
                  status,
                  updated_at: new Date().toISOString()
                }
              : item
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
                  metadata: {
                    ...item.metadata,
                    notes_summary: payload.notes ?? item.metadata?.notes_summary
                  },
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
      } else if (session.token) {
        const result = await analyzeJobWithAi(session.token, { profile, workspace: job });
        const persisted = await updateJob(session.token, job.id, {
          analysis: result.analysis ?? job.analysis,
          extracted_requirements: job.extracted_requirements ?? inferRequirements(job),
          metadata: result.metadata ? { ...(job.metadata ?? {}), ...result.metadata } : job.metadata
        });
        setJobs((currentJobs) =>
          currentJobs.map((item) => (item.id === job.id ? persisted : item))
        );
      }
    } catch (error) {
      setJobError(error instanceof Error ? error.message : "Could not analyze this job.");
    } finally {
      setAnalysisBusyId(null);
    }
  }

  async function handleSendMessage(job: Job, message: string) {
    if (!session.token) {
      return;
    }

    const trimmed = message.trim();
    if (!trimmed) {
      return;
    }

    setMessageBusyId(job.id);

    try {
      if (isDemoSession(session.token)) {
        const result = buildAssistantReply(job, profile, trimmed);
        const timestamp = new Date().toISOString();
        const userMessage = createMessage("user", trimmed, timestamp);
        const assistantMessage = createMessage(
          "assistant",
          result.assistantContent,
          new Date(Date.now() + 500).toISOString()
        );

        setJobs((currentJobs) => {
          const nextJobs = currentJobs.map((item) => {
            if (item.id !== job.id) {
              return item;
            }

            const nextMessages = [...(item.messages ?? []), userMessage, assistantMessage];
            const nextMetadata = {
              ...(item.metadata ?? {}),
              ...(result.metadataPatch ?? {})
            };
            const appendedNotes = result.notesAppend
              ? [item.notes, result.notesAppend].filter(Boolean).join("\n")
              : item.notes;

            return {
              ...item,
              status: result.statusPatch ?? item.status,
              notes: appendedNotes,
              metadata: nextMetadata,
              messages: nextMessages,
              updated_at: new Date().toISOString()
            };
          });

          saveDemoJobs(nextJobs);
          return nextJobs;
        });
      } else {
        const timestamp = new Date().toISOString();
        const userMessage = createMessage("user", trimmed, timestamp);
        setJobs((currentJobs) =>
          currentJobs.map((item) =>
            item.id === job.id
              ? {
                  ...item,
                  messages: [...(item.messages ?? []), userMessage],
                  updated_at: new Date().toISOString()
                }
              : item
          )
        );

        const result = await chatJobWithAi(session.token, { profile, workspace: job, message: trimmed });
        const nextMessages = [...(job.messages ?? []), userMessage, result.assistant_message];
        const nextMetadata = result.metadata_patch
          ? { ...(job.metadata ?? {}), ...result.metadata_patch }
          : job.metadata;
        const nextWorkspacePatch = result.workspace_patch ?? {};
        const nextNotes = result.notes_append
          ? [job.notes, result.notes_append].filter(Boolean).join("\n")
          : job.notes;
        const persisted = await updateJob(session.token, job.id, {
          company: nextWorkspacePatch.company ?? job.company,
          title: nextWorkspacePatch.title ?? job.title,
          job_description: nextWorkspacePatch.job_description ?? job.job_description,
          extracted_requirements:
            nextWorkspacePatch.extracted_requirements ?? job.extracted_requirements,
          status: result.status_patch ?? job.status,
          notes: nextNotes,
          metadata: nextMetadata,
          messages: nextMessages
        });
        setJobs((currentJobs) =>
          currentJobs.map((item) => (item.id === job.id ? persisted : item))
        );
      }
    } catch (error) {
      setJobError(error instanceof Error ? error.message : "Could not send message.");
    } finally {
      setMessageBusyId(null);
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
    setProfileMessage("Candidate profile saved.");
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
                isDemoMode={isDemoSession(session.token)}
                jobs={jobs}
                onLogout={logout}
                savedJobs={savedJobs}
                userName={session.user.full_name}
              >
                <DashboardPage
                  appliedJobs={appliedJobs}
                  formState={formState}
                  isDemoMode={isDemoSession(session.token)}
                  importBusy={importBusy}
                  jobError={jobError}
                  jobs={jobs}
                  loading={loading}
                  onCreateJob={handleCreateJob}
                  onImportJob={handleImportJob}
                  onSaveProfile={handleSaveProfile}
                  profile={profile}
                  profileMessage={profileMessage}
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
                isDemoMode={isDemoSession(session.token)}
                jobs={jobs}
                onLogout={logout}
                savedJobs={savedJobs}
                userName={session.user.full_name}
              >
                <JobPage
                  analysisBusyId={analysisBusyId}
                  isDemoMode={isDemoSession(session.token)}
                  jobError={jobError}
                  jobs={jobs}
                  messageBusyId={messageBusyId}
                  onAnalyzeJob={handleAnalyzeJob}
                  onDeleteJob={handleDeleteJob}
                  onSaveJob={handleSaveJob}
                  onSendMessage={handleSendMessage}
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
        <h1>AI-powered job tracker with a dedicated workspace for every application.</h1>
        <p className="hero-copy">
          Stage 3 turns each job into its own context-aware workspace with chat history, structured
          metadata, and natural-language updates like application dates, recruiter names, and
          follow-up reminders.
        </p>
        <div className="hero-grid">
          <article>
            <span>Workspace</span>
            <strong>Each applied job now has its own scoped chat</strong>
          </article>
          <article>
            <span>Metadata</span>
            <strong>Track recruiter, dates, follow-ups, and notes</strong>
          </article>
          <article>
            <span>Assistant</span>
            <strong>Natural language updates job data inside the workspace</strong>
          </article>
          <article>
            <span>Next</span>
            <strong>Real Claude API and automation can plug into this flow later</strong>
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
              Try demo data
            </button>
          </div>
        </form>
      </section>
    </main>
  );
}

function AppShell({
  appliedJobs,
  isDemoMode,
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
            <span className={`mode-badge ${isDemoMode ? "demo" : "live"}`}>
              {isDemoMode ? "Demo mode" : "Live AI mode"}
            </span>
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
  isDemoMode,
  importBusy,
  jobError,
  jobs,
  loading,
  onCreateJob,
  onImportJob,
  onSaveProfile,
  profile,
  profileMessage,
  savedJobs,
  setFormState
}: DashboardPageProps) {
  const latestAppliedJob = appliedJobs[0];
  const latestSavedJob = savedJobs[0];

  return (
    <>
      <header className="topbar">
        <div>
          <p className="eyebrow">Stage 3 active</p>
          <h1>Track jobs, score fit, and manage each application as its own workspace</h1>
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
          {isDemoMode ? (
            <p className="mode-note">
              Demo mode shows seeded data only. Log out and sign in to test real link import and
              live AI responses.
            </p>
          ) : null}

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
                placeholder="Paste requirements, recruiter context, or why the role matters..."
                rows={5}
              />
            </label>
            {jobError ? <p className="error-text">{jobError}</p> : null}
            <div className="job-form-actions">
              <button className="primary-button" type="submit">
                Save job
              </button>
              <button
                className="secondary-button"
                disabled={importBusy || isDemoMode}
                onClick={() => void onImportJob()}
                type="button"
              >
                {isDemoMode ? "Live import unavailable in demo" : importBusy ? "Importing..." : "Import from link"}
              </button>
            </div>
          </form>
        </article>

        <article className="panel panel-accent">
          <div className="panel-header">
            <div>
              <p className="eyebrow">Candidate profile</p>
              <h2>Data used for matching and recommendations</h2>
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
              Save candidate profile
            </button>
            {profileMessage ? <p className="success-text">{profileMessage}</p> : null}
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
              <p className="eyebrow">Stage 3 outcome</p>
              <h2>Dedicated workspace per job</h2>
            </div>
          </div>
          <ul className="feature-list">
            <li>Each job now has its own scoped chat history</li>
            <li>Structured metadata lives next to the conversation</li>
            <li>Natural language updates recruiter, dates, and notes</li>
            <li>This is the foundation for a real agent-like assistant</li>
          </ul>
        </article>
      </section>
    </>
  );
}

function JobPage({
  analysisBusyId,
  isDemoMode,
  jobError,
  jobs,
  messageBusyId,
  onAnalyzeJob,
  onDeleteJob,
  onSaveJob,
  onSendMessage,
  onStatusChange,
  profile
}: JobPageProps) {
  const params = useParams<{ jobId: string }>();
  const navigate = useNavigate();
  const jobId = Number(params.jobId);
  const job = jobs.find((item) => item.id === jobId) ?? null;
  const [chatInput, setChatInput] = useState("");
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
  const isAnalyzingCurrentJob = analysisBusyId === currentJob.id;
  const isMessagingCurrentJob = messageBusyId === currentJob.id;
  const messages = currentJob.messages ?? [];
  const metadata = currentJob.metadata ?? {};
  const quickCommands = [
    "I applied today",
    "Recruiter is Anna Smith",
    "Follow up in 3 days",
    "Note: strong React match, prepare portfolio examples"
  ];

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

  async function submitChat(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await onSendMessage(currentJob, chatInput);
    setChatInput("");
  }

  async function handleChatKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key !== "Enter" || event.shiftKey) {
      return;
    }
    event.preventDefault();
    if (!chatInput.trim() || isMessagingCurrentJob) {
      return;
    }
    await onSendMessage(currentJob, chatInput);
    setChatInput("");
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

      <section className="stage-three-grid">
        <article className="panel chat-panel">
          <div className="panel-header">
            <div>
              <p className="eyebrow">Job chat</p>
              <h2>{currentJob.company} workspace</h2>
              {isDemoMode ? (
                <p className="mode-note compact">
                  Demo mode uses scripted sample data. Live AI chat works only after normal login.
                </p>
              ) : null}
            </div>
            <span className={`status-pill ${currentJob.status}`}>{currentJob.status}</span>
          </div>

          <div className="message-list">
            {messages.map((message) => (
              <article key={message.id} className={`message-bubble ${message.role}`}>
                <div className="message-meta">
                  <strong>{message.role === "assistant" ? "Assistant" : "You"}</strong>
                  <span>{new Date(message.created_at).toLocaleString()}</span>
                </div>
                <p>{message.content}</p>
              </article>
            ))}
          </div>

          <div className="command-row">
            {quickCommands.map((command) => (
              <button
                key={command}
                className="command-chip"
                onClick={() => setChatInput(command)}
                type="button"
              >
                {command}
              </button>
            ))}
          </div>

          <form className="chat-form" onSubmit={submitChat}>
            <textarea
              onChange={(event) => setChatInput(event.target.value)}
              onKeyDown={(event) => void handleChatKeyDown(event)}
              placeholder="Try: I applied today, Recruiter is Anna Smith, Follow up in 3 days..."
              rows={4}
              value={chatInput}
            />
            <div className="chat-form-footer">
              <p className="muted-text">
                Enter to send. Shift+Enter for a new line. This assistant is scoped only to{" "}
                {currentJob.company} and its workspace data.
              </p>
              <button className="primary-button" disabled={isMessagingCurrentJob} type="submit">
                {isMessagingCurrentJob ? "Updating..." : "Send message"}
              </button>
            </div>
          </form>
        </article>

        <section className="section-stack">
          <article className="panel">
            <div className="panel-header">
              <div>
                <p className="eyebrow">Structured data</p>
                <h2>Application details</h2>
              </div>
            </div>
            <div className="metadata-grid">
              <article className="metadata-card">
                <span>Application date</span>
                <strong>{formatDisplayDate(metadata.application_date)}</strong>
              </article>
              <article className="metadata-card">
                <span>Follow-up date</span>
                <strong>{formatDisplayDate(metadata.follow_up_date)}</strong>
              </article>
              <article className="metadata-card">
                <span>Contact person</span>
                <strong>{metadata.contact_person || "Not set"}</strong>
              </article>
              <article className="metadata-card">
                <span>Source</span>
                <strong>{metadata.source || "Not set"}</strong>
              </article>
            </div>
            <div className="detail-column">
              <span>Workspace summary</span>
              <p>{metadata.notes_summary || currentJob.notes || "No summary yet."}</p>
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
          </article>

          <article className="panel">
            <div className="panel-header">
              <div>
                <p className="eyebrow">Job details</p>
                <h2>{currentJob.company}</h2>
              </div>
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
                    rows={6}
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
                  <span>Source link</span>
                  <a href={currentJob.link} rel="noreferrer" target="_blank">
                    {currentJob.link}
                  </a>
                </div>
                <div className="detail-column">
                  <span>Description / notes</span>
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
                <p className="eyebrow">Fit evaluation</p>
                <h2>Candidate match</h2>
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
                  <strong
                    className={`recommendation-pill ${
                      currentJob.analysis?.recommendation ?? "consider"
                    }`}
                  >
                    {currentJob.analysis?.recommendation ?? "not analyzed"}
                  </strong>
                </div>
                <div className="detail-row">
                  <span>Seniority fit</span>
                  <strong>{currentJob.analysis?.seniority_fit ?? "unknown"}</strong>
                </div>
                <p className="muted-text">
                  {currentJob.analysis?.summary ??
                    "Run job analysis to compare this role against your candidate profile."}
                </p>
                <button
                  className="primary-button"
                  disabled={isAnalyzingCurrentJob}
                  onClick={() => onAnalyzeJob(currentJob)}
                  type="button"
                >
                  {isAnalyzingCurrentJob ? "Analyzing..." : "Analyze fit"}
                </button>
              </div>
            </div>

            <div className="analysis-grid">
              <article>
                <span>Strengths</span>
                <ul className="compact-list">
                  {(currentJob.analysis?.strengths ?? ["Strengths will appear here"]).map((item) => (
                    <li key={item}>{item}</li>
                  ))}
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
              <span>Candidate profile snapshot</span>
              <p className="muted-text">
                {profile.years_of_experience} years experience, {profile.work_format} work preference,
                stack: {profile.tech_stack.join(", ")}
              </p>
            </div>
          </article>
        </section>
      </section>
    </>
  );
}

export default App;
