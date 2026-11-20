import { FormEvent, ReactNode, isValidElement, useEffect, useRef, useState } from "react"
import { askLLM, ChatMessage, classifyIntent } from "./lib/llm"

type IconName = "alert" | "arrow" | "book" | "bot" | "check" | "chevron" | "close" | "download" | "history" | "home" | "menu" | "mic" | "paperclip" | "send" | "shield" | "stethoscope" | "user"

type Message = {
  id: string
  role: "assistant" | "user"
  body: ReactNode
  label?: string
  options?: string[]
  tone?: "normal" | "warning" | "success"
}

type HistoryItem = {
  id: string
  title: string
  time: string
  status: string
  transcript?: Array<{
    role: "assistant" | "user"
    text: string
    label?: string
    options?: string[]
  }>
}

const green = "#087a5b"
const RECENT_CONVERSATIONS_KEY = "healthhub-recent-conversations"
const emergencySigns = [
  "Chest pain, pressure or tightness",
  "Severe difficulty breathing",
  "Sudden weakness or numbness on one side",
  "Sudden confusion or trouble speaking",
  "Fainting, collapse or loss of consciousness",
  "Sudden severe headache or vision changes",
  "Blood pressure 180/120 mmHg or higher with symptoms",
]

const presets = [
  {
    title: "Medication information",
    question: "What should I know about my prescribed hypertension medication?",
    description:
      "Purpose, dosage instructions, common side effects and important precautions.",
  },
  {
    title: "Missed dose",
    question:
      "I missed a dose of my hypertension medication. What should I do?",
    description: "Medication-specific guidance for a missed or delayed dose.",
  },
  {
    title: "Symptoms and side effects",
    question:
      "I'm experiencing dizziness or a persistent cough. Could this be related to my medication?",
    description:
      "Clarify symptoms, possible medicine effects and urgent warning signs.",
  },
  {
    title: "Medication precautions",
    question:
      "What should I avoid doing while taking my hypertension medication?",
    description:
      "Medicine-specific precautions and risks that may need extra care.",
  },
]

const initialHistory: HistoryItem[] = [
  {
    id: "h1",
    title: "Blood pressure readings",
    time: "Today, 9:42 am",
    status: "Counselling provided",
    transcript: [
      {
        role: "user",
        text: "My blood pressure was 148/92 this morning. What does that mean?",
      },
      {
        role: "assistant",
        text: "That reading is above the usual target range. Before discussing it, I need to check whether you have chest pain, severe breathing difficulty, sudden weakness, confusion, fainting, a severe headache or sudden vision changes.",
      },
      {
        role: "user",
        text: "No, I don’t have any of those warning signs.",
      },
      {
        role: "assistant",
        text: "Thank you. One reading alone does not confirm a change in your condition. Sit quietly for five minutes, keep your feet flat and arm supported, then repeat the measurement.",
      },
      {
        role: "user",
        text: "The second reading was 142/88. I feel normal.",
      },
      {
        role: "assistant",
        text: "Record both readings and continue your prescribed Amlodipine 5 mg as directed. If readings remain above your personal target over several days, arrange a review with your usual clinic. Seek urgent care if warning signs appear.",
      },
    ],
  },
  {
    id: "h2",
    title: "Amlodipine and dizziness",
    time: "Yesterday",
    status: "Teleconsult recommended",
    transcript: [
      {
        role: "user",
        text: "I’ve felt dizzy since taking my blood pressure tablet this morning.",
      },
      {
        role: "assistant",
        text: "I’m sorry you’re feeling dizzy. The illustrative record shows Amlodipine 5 mg once daily. Is that the medicine you took?",
      },
      { role: "user", text: "Yes, that’s correct." },
      {
        role: "assistant",
        text: "Before continuing: are you having chest pain, severe breathing difficulty, fainting, sudden weakness, confusion or a severe headache?",
      },
      {
        role: "user",
        text: "None of those. The dizziness is mild but has lasted a few hours.",
      },
      {
        role: "assistant",
        text: "Dizziness can occur with Amlodipine. Sit or lie down if light-headed, rise slowly and avoid driving while dizzy. Because it is new and persistent, a teleconsult or your usual clinic should review it. Do not stop or change the dose on your own.",
      },
      {
        role: "user",
        text: "I’ll arrange a teleconsult this afternoon.",
      },
      {
        role: "assistant",
        text: "Recorded as patient-reported: you intend to arrange a teleconsult. The consultation outcome remains unresolved until you confirm that care was received.",
      },
    ],
  },
  {
    id: "h3",
    title: "Missed evening dose",
    time: "12 Jun",
    status: "Follow-up unresolved",
    transcript: [
      {
        role: "user",
        text: "I think I missed my Amlodipine dose last night.",
      },
      {
        role: "assistant",
        text: "The illustrative record shows Amlodipine 5 mg once daily. Can you confirm that this matches your dispensing label?",
      },
      {
        role: "user",
        text: "I’m not at home, so I can’t check the label right now.",
      },
      {
        role: "assistant",
        text: "Because the medicine instructions and timing are not confirmed, do not take an extra tablet based on this chat. Check the label when available or contact a pharmacist or prescriber.",
      },
      {
        role: "user",
        text: "Should I take two tablets tonight if I did miss it?",
      },
      {
        role: "assistant",
        text: "Do not double the dose. The next step still depends on confirming your label and when the dose was due. This follow-up remains explicitly unresolved.",
      },
    ],
  },
  {
    id: "h4",
    title: "Persistent cough and medication",
    time: "8 Jun",
    status: "Clinic review recommended",
    transcript: [
      {
        role: "user",
        text: "I’ve had a dry cough for about two weeks. Is Amlodipine causing it?",
      },
      {
        role: "assistant",
        text: "A persistent dry cough is not a typical Amlodipine side effect. It may have another cause or be associated with a different blood pressure medicine, such as an ACE inhibitor.",
      },
      {
        role: "user",
        text: "I also take Lisinopril, but I’m not sure of the dose.",
      },
      {
        role: "assistant",
        text: "Lisinopril can be associated with a persistent dry cough, but your full medicine list and dose need confirmation. Are you experiencing severe breathing difficulty, chest pain, facial swelling or fainting?",
      },
      {
        role: "user",
        text: "No. The cough is annoying, but I can breathe normally.",
      },
      {
        role: "assistant",
        text: "Arrange a review with your prescriber or pharmacist to discuss the cough and reconcile your medicines. Do not stop Lisinopril or Amlodipine without advice. Seek urgent care if breathing difficulty or facial swelling develops.",
      },
    ],
  },
]

function nodeToText(node: ReactNode): string {
  if (node == null || typeof node === "boolean") return ""
  if (typeof node === "string" || typeof node === "number") return String(node)
  if (Array.isArray(node)) return node.map(nodeToText).filter(Boolean).join(" ")
  if (isValidElement(node)) {
    return nodeToText(
      (node.props as { children?: ReactNode }).children,
    )
  }
  return ""
}

function loadRecentConversations(): HistoryItem[] {
  try {
    const stored = window.localStorage.getItem(RECENT_CONVERSATIONS_KEY)
    if (!stored) return initialHistory
    const parsed = JSON.parse(stored) as HistoryItem[]
    return Array.isArray(parsed) ? parsed : initialHistory
  } catch {
    return initialHistory
  }
}

function formatConversationTime(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString([], { dateStyle: "medium", timeStyle: "short" })
}

function Icon({ name, size = 20 }: { name: IconName; size?: number }) {
  const paths: Record<IconName, ReactNode> = {
    alert: (
      <>
        <path d="M12 3 2.7 20h18.6L12 3Z" />
        <path d="M12 9v5m0 3h.01" />
      </>
    ),
    arrow: <path d="m9 18 6-6-6-6" />,
    book: (
      <>
        <path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H11v16H6.5A2.5 2.5 0 0 0 4 21.5v-16Z" />
        <path d="M20 5.5A2.5 2.5 0 0 0 17.5 3H13v16h4.5a2.5 2.5 0 0 1 2.5 2.5v-16Z" />
      </>
    ),
    bot: (
      <>
        <rect x="4" y="6" width="16" height="13" rx="4" />
        <path d="M9 11h.01M15 11h.01M9 15h6M12 3v3" />
      </>
    ),
    check: <path d="m5 12 4 4L19 6" />,
    chevron: <path d="m9 18 6-6-6-6" />,
    close: <path d="m6 6 12 12M18 6 6 18" />,
    download: (
      <>
        <path d="M12 3v12m-4-4 4 4 4-4M5 21h14" />
      </>
    ),
    history: (
      <>
        <path d="M3 12a9 9 0 1 0 3-6.7L3 8" />
        <path d="M3 3v5h5M12 7v5l3 2" />
      </>
    ),
    home: (
      <>
        <path d="m3 11 9-8 9 8" />
        <path d="M5 10v11h14V10M9 21v-7h6v7" />
      </>
    ),
    menu: <path d="M4 6h16M4 12h16M4 18h16" />,
    mic: (
      <>
        <rect x="9" y="3" width="6" height="12" rx="3" />
        <path d="M5 11a7 7 0 0 0 14 0M12 18v3" />
      </>
    ),
    paperclip: (
      <path d="m21 11-8.5 8.5a6 6 0 0 1-8.5-8.5l9-9a4 4 0 0 1 5.7 5.7l-9 9a2 2 0 1 1-2.9-2.8l8.4-8.4" />
    ),
    send: (
      <>
        <path d="m22 2-7 20-4-9-9-4 20-7Z" />
        <path d="M22 2 11 13" />
      </>
    ),
    shield: (
      <>
        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z" />
        <path d="m9 12 2 2 4-5" />
      </>
    ),
    stethoscope: (
      <>
        <path d="M5 3v5a5 5 0 0 0 10 0V3M3 3h4m6 0h4" />
        <path d="M10 13v2a5 5 0 0 0 10 0v-1" />
        <circle cx="20" cy="11" r="2" />
      </>
    ),
    user: (
      <>
        <circle cx="12" cy="8" r="4" />
        <path d="M4 21a8 8 0 0 1 16 0" />
      </>
    ),
  }
  return (
    <svg
      aria-hidden="true"
      className="icon"
      fill="none"
      height={size}
      viewBox="0 0 24 24"
      width={size}
    >
      {paths[name]}
    </svg>
  )
}

function Logo() {
  return (
    <div className="logo" aria-label="HealthHub">
      <span className="logo-cross">+</span>
      <span>HealthHub</span>
    </div>
  )
}

function Homepage({
  onOpen,
  onAcceptCookies,
  cookiesAccepted,
}: {
  onOpen: () => void
  onAcceptCookies: () => void
  cookiesAccepted: boolean
}) {
  const cards = [
    {
      title: "Senna / Sennosides",
      sub: "Medication Information Leaflet",
      image:
        "https://images.unsplash.com/photo-1607619056574-7b8d3ee536b2?auto=format&fit=crop&w=900&q=82",
    },
    {
      title: "Managing blood pressure",
      sub: "Understanding your readings",
      image:
        "https://images.unsplash.com/photo-1615486511484-92e172cc4fe0?auto=format&fit=crop&w=900&q=82",
    },
    {
      title: "Safe use of medicines",
      sub: "Medication tips and guidance",
      image:
        "https://images.unsplash.com/photo-1584308666744-24d5c474f2ae?auto=format&fit=crop&w=900&q=82",
    },
  ]
  return (
    <div className="site-page">
      <div className="utility-bar">
        <div className="site-width utility-inner">
          <span>A Singapore Government Agency Website</span>
          <span className="utility-links">
            About us &nbsp; | &nbsp; Contact &nbsp; | &nbsp; Feedback
          </span>
        </div>
      </div>
      <header className="site-header">
        <div className="site-width header-inner">
          <Logo />
          <nav aria-label="Primary">
            <a href="#health">Health Services</a>
            <a href="#learn">Health Library</a>
            <a href="#rewards">Rewards</a>
          </nav>
          <button className="singpass-button">
            <span>Log in with</span>
            <strong>Singpass</strong>
          </button>
        </div>
      </header>
      <section className="site-hero">
        <div className="site-width hero-inner">
          <div>
            <span className="site-kicker">ONE PORTAL. BETTER HEALTH.</span>
            <h1>Your health, in your hands</h1>
            <p>
              Access trusted health information, manage appointments and
              discover services for you and your family.
            </p>
            <button className="hero-cta">Explore HealthHub</button>
          </div>
          <div className="hero-art" aria-hidden="true">
            <div className="hero-circle">
              <Icon name="shield" size={78} />
            </div>
            <span className="pulse-line" />
          </div>
        </div>
      </section>
      <main className="site-width content">
        <section className="quick-grid">
          {[
            ["Appointments", "View and manage visits"],
            ["Medications", "View prescriptions"],
            ["Health records", "See your health history"],
            ["Payments", "Bills and claims"],
          ].map(([title, desc], index) => (
            <button className="quick-item" key={title}>
              <span className="quick-icon">
                <Icon
                  name={
                    index === 1
                      ? "stethoscope"
                      : index === 2
                        ? "history"
                        : "book"
                  }
                />
              </span>
              <span>
                <strong>{title}</strong>
                <small>{desc}</small>
              </span>
              <Icon name="chevron" size={17} />
            </button>
          ))}
        </section>
        <section className="discover" id="learn">
          <div className="section-heading">
            <div>
              <span className="site-kicker">HEALTH LIBRARY</span>
              <h2>Conditions &amp; Medications</h2>
            </div>
            <button>
              View all articles <Icon name="arrow" size={16} />
            </button>
          </div>
          <div className="article-grid">
            {cards.map((card) => (
              <article className="article-card" key={card.title}>
                <img src={card.image} alt="" />
                <div>
                  <span>HEALTH INFORMATION</span>
                  <h3>{card.title}</h3>
                  <p>{card.sub}</p>
                </div>
              </article>
            ))}
          </div>
        </section>
      </main>
      <button className="ai-launcher" onClick={onOpen}>
        <span className="launcher-orb">
          <Icon name="bot" />
        </span>
        <span>
          <strong>Ask HealthHub AI</strong>
          <small>Beta</small>
        </span>
      </button>
      {!cookiesAccepted && (
        <div className="cookie" role="status">
          <span className="cookie-copy">
            By continuing to use and navigate the HealthHub website, you consent
            to the use of cookies.
          </span>
          <button type="button" onClick={onAcceptCookies}>
            Accept
          </button>
        </div>
      )}
    </div>
  )
}

function App() {
  const [panelOpen, setPanelOpen] = useState(true)
  const [cookiesAccepted, setCookiesAccepted] = useState(false)
  const [accepted, setAccepted] = useState(false)
  const [singpassSignedIn, setSingpassSignedIn] = useState(false)
  const [singpassRequiredOpen, setSingpassRequiredOpen] = useState(false)
  const [pendingHypertension, setPendingHypertension] = useState<{
    kind: "assistant"
  } | { kind: "history"; item: HistoryItem } | null>(null)
  const [assistant, setAssistant] = useState<"healthhub" | "hypertension">(
    "healthhub",
  )
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [historyOpen, setHistoryOpen] = useState(false)
  const [landing, setLanding] = useState(true)
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState("")
  const [flow, setFlow] = useState("idle")
  const [topic, setTopic] =
    useState<"information" | "missed-dose" | "symptoms" | "precautions">(
      "information",
    )
  const [loading, setLoading] = useState(false)
  const [selectedSigns, setSelectedSigns] = useState<string[]>([])
  const [handoffOpen, setHandoffOpen] = useState(false)
  const [handoffConfirmed, setHandoffConfirmed] = useState(false)
  const [history, setHistory] = useState<HistoryItem[]>(loadRecentConversations)
  const [activeConversationId, setActiveConversationId] = useState(() =>
    crypto.randomUUID(),
  )
  const [unresolved, setUnresolved] = useState(true)
  const [llmConversation, setLlmConversation] = useState<ChatMessage[]>([])
  const [clinicalContext, setClinicalContext] = useState("")
  const endRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    try {
      window.localStorage.setItem(
        RECENT_CONVERSATIONS_KEY,
        JSON.stringify(history),
      )
    } catch {
      // Storage may be unavailable in private browsing or restricted previews.
    }
  }, [history])

  useEffect(() => {
    if (!messages.length || assistant !== "hypertension") return
    const transcript = messages
      .map((message) => ({
        role: message.role,
        text: nodeToText(message.body),
        label: message.label,
        options: message.options,
      }))
      .filter((entry) => entry.text.trim())
    const firstUserMessage = transcript.find((entry) => entry.role === "user")
    setHistory((items) => [
      {
        id: activeConversationId,
        title: firstUserMessage?.text.slice(0, 60) || "Hypertension Assistant conversation",
        time: new Date().toISOString(),
        status: "In progress",
        transcript,
      },
      ...items.filter((item) => item.id !== activeConversationId),
    ])
  }, [messages, activeConversationId, assistant])

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages, loading])

  const addMessages = (...next: Message[]) =>
    setMessages((items) => [...items, ...next])
  const assistantMessage = (
    body: ReactNode,
    options?: string[],
    tone: Message["tone"] = "normal",
    label?: string,
  ): Message => ({
    id: crypto.randomUUID(),
    role: "assistant",
    body,
    options,
    tone,
    label,
  })
  const userMessage = (body: string): Message => ({
    id: crypto.randomUUID(),
    role: "user",
    body,
  })

  const simulatedLoad = (callback: () => void, delay = 900) => {
    setLoading(true)
    window.setTimeout(() => {
      setLoading(false)
      callback()
    }, delay)
  }

  const saveHistory = (title: string, status: string) => {
    setHistory((items) => [
      {
        id: activeConversationId,
        title,
        time: new Date().toISOString(),
        status,
        transcript: messages
          .map((message) => ({
            role: message.role,
            text: nodeToText(message.body),
            label: message.label,
            options: message.options,
          }))
          .filter((entry) => entry.text.trim()),
      },
      ...items.filter((item) => item.id !== activeConversationId),
    ])
  }

  const loadHistoryConversation = (item: HistoryItem) => {
    const transcript = item.transcript || [
      {
        role: "assistant" as const,
        text: `This saved conversation is titled “${item.title}”. Its recorded outcome is: ${item.status}. A full transcript was not captured for this newly created prototype entry.`,
      },
    ]
    setAssistant("hypertension")
    setActiveConversationId(item.id)
    setLanding(false)
    setFlow("idle")
    setDrawerOpen(false)
    setHistoryOpen(false)
    setMessages(
      transcript.map((entry) => ({
        id: crypto.randomUUID(),
        role: entry.role,
        body: entry.text,
        label: entry.label || (entry.role === "assistant" ? "Saved conversation" : undefined),
        options: entry.options,
      })),
    )
  }

  const openHistoryConversation = (item: HistoryItem) => {
    if (!singpassSignedIn) {
      setDrawerOpen(false)
      setHistoryOpen(false)
      setPendingHypertension({ kind: "history", item })
      setSingpassRequiredOpen(true)
      return
    }
    loadHistoryConversation(item)
  }

  const chooseAssistant = (next: "healthhub" | "hypertension") => {
    setAssistant(next)
    setLanding(true)
    setMessages([])
    setActiveConversationId(crypto.randomUUID())
    setClinicalContext("")
    setFlow("idle")
    setSelectedSigns([])
    setDrawerOpen(false)
    setHistoryOpen(false)
    if (next === "healthhub") return
    if (next === "hypertension" && !singpassSignedIn) {
      setDrawerOpen(false)
      setHistoryOpen(false)
      setPendingHypertension({ kind: "assistant" })
      setSingpassRequiredOpen(true)
      return
    }
    setLlmConversation([])
  }

  const askAssistant = async (question: string) => {
    const nextConversation: ChatMessage[] = [
      ...llmConversation,
      { role: "user", content: question },
    ]
    setLlmConversation(nextConversation)
    setLoading(true)
    try {
      const result = await askLLM(nextConversation, undefined, clinicalContext)
      // The scripted UI remains the source of truth for safety transitions.
      // Structured extraction is retained as session context for later turns.
      setClinicalContext((context) =>
        `${context}\nStructured extraction: ${JSON.stringify(result.extraction)}`.trim(),
      )
      setLlmConversation([...nextConversation, { role: "assistant", content: result.response }])
      addMessages(
        assistantMessage(result.response, undefined, "normal", "Hypertension Assistant"),
      )
    } catch {
      addMessages(
        assistantMessage(
          "I’m unable to reach the AI service right now. Please try again shortly, or contact a healthcare professional for urgent or medication-specific advice.",
          undefined,
          "warning",
          "AI service unavailable",
        ),
      )
    } finally {
      setLoading(false)
    }
  }

  const startQuestion = async (question: string) => {
    if (assistant !== "hypertension") return
    setLanding(false)
    addMessages(userMessage(question))
    const lower = question.toLowerCase()
    let classification: Awaited<ReturnType<typeof classifyIntent>> | null = null
    try {
      classification = await classifyIntent(question)
    } catch {
      // The local safety rules below remain the fallback if the classifier is unavailable.
    }
    const emergencyByRule =
      lower.includes("chest pain") ||
      lower.includes("can't breathe") ||
      lower.includes("cannot breathe") ||
      lower.includes("faint")
    const symptomByClassifier =
      classification?.intent === "symptom" ||
      classification?.intent === "emergency" ||
      classification?.mentionsSymptoms
    const medicineByClassifier =
      classification?.intent === "medicine" || classification?.mentionsMedication
    setTopic(
      (lower.includes("missed") || medicineByClassifier && lower.includes("miss"))
        ? "missed-dose"
        : lower.includes("avoid") || lower.includes("precaution")
          ? "precautions"
          : lower.includes("dizz") ||
              lower.includes("cough") ||
              lower.includes("symptom")
            ? "symptoms"
            : "information",
    )
    // Preserve symptoms already stated during intake so the later clinical
    // questions collect missing detail instead of asking for the symptom again.
    if (symptomByClassifier || lower.includes("dizzy") || lower.includes("cough") || lower.includes("headache") || lower.includes("symptom") || lower.includes("reading")) {
      setClinicalContext((context) =>
        `${context}\nPatient-reported symptoms at intake: ${question}`.trim(),
      )
    }
    if (
      emergencyByRule ||
      classification?.possibleEmergency ||
      symptomByClassifier ||
      lower.includes("dizzy") ||
      lower.includes("headache") ||
      lower.includes("chest") ||
      lower.includes("symptom") ||
      lower.includes("reading")
    ) {
      setFlow("emergency-check")
      simulatedLoad(() =>
        addMessages(
          assistantMessage(
            <>
              <strong>Let’s first check for urgent warning signs.</strong>
              <p>
                Before discussing blood pressure or medicines, please review the
                Ministry of Health emergency checklist below.
              </p>
            </>,
            undefined,
            "warning",
            "Safety check",
          ),
        ),
      )
      return
    }
    if (medicineByClassifier || lower.includes("medication") || lower.includes("dose")) {
      setFlow("record-confirm")
      simulatedLoad(() =>
        addMessages(
          assistantMessage(
            <>
              <span className="source-line">
                <Icon name="shield" size={15} /> Retrieved from your NEHR medical records
              </span>
              <strong>Amlodipine 5 mg tablet</strong>
              <p>Recorded instruction: Take 1 tablet once daily.</p>
              <p>
                Is this medication and dosage accurate for you? Please confirm
                before we continue.
              </p>
              <small className="mock-note">
                Illustrative record only — no live system is connected.
              </small>
            </>,
            ["Yes, this is correct", "No, this is different", "I’m not sure"],
            "normal",
            "Record found",
          ),
        ),
      )
      return
    }
    if (lower.includes("lifestyle")) {
      setFlow("general")
      simulatedLoad(() =>
        addMessages(
          assistantMessage(
            "I can only help with hypertension medicines, medicine-related symptoms, and when to seek care. Lifestyle and other general health questions are outside this assistant's scope.",
            undefined,
            "warning",
            "Outside approved scope",
          ),
        ),
      )
      return
    }
    setFlow("general")
    addMessages(
      assistantMessage(
        "I can only help patients with questions about hypertension medicines, their use, possible medicine-related symptoms, and when to seek care. Please contact an appropriate healthcare professional for other concerns.",
        undefined,
        "warning",
        "Outside approved scope",
      ),
    )
  }

  const submitEmergency = () => {
    if (selectedSigns.length > 0) {
      setFlow("emergency")
      addMessages(
        userMessage(selectedSigns.join(", ")),
        assistantMessage(
          <EmergencyContent />,
          ["I will seek urgent help", "I cannot take action now"],
          "warning",
          "Urgent action recommended",
        ),
      )
      setSelectedSigns([])
      saveHistory("Urgent symptom check", "Emergency guidance shown")
    } else {
      setFlow("clinical-questions")
      addMessages(
        userMessage("None of these warning signs"),
        assistantMessage(
          <>
            <strong>No emergency sign selected.</strong>
            <p>
              The illustrative record shows Amlodipine 5 mg once daily. Is that
              what you currently take, and are there any other medicines or
              health conditions I should include?
            </p>
          </>,
          [
            "Amlodipine only, as shown",
            "I take other medicines",
            "I have other health conditions",
            "I’m not sure",
          ],
          "normal",
          "Clinical clarification",
        ),
      )
    }
  }

  const handleOption = (option: string) => {
    if (option === "Review conversation summary") {
      setHandoffOpen(true)
      return
    }
    if (option === "Ask a follow-up") {
      addMessages(
        userMessage(option),
        assistantMessage("Of course. Type your follow-up question below."),
      )
      return
    }
    if (option === "Show care options" || option === "Find care options") {
      addMessages(
        userMessage(option),
        assistantMessage(
          <CareOptions />,
          [
            "I want to proceed",
            "I’ll decide later",
            "Review handoff summary",
          ],
          "normal",
          "Consultation options",
        ),
      )
      setFlow("handoff")
      return
    }
    if (option === "I want to proceed") {
      setHandoffConfirmed(false)
      setHandoffOpen(true)
      return
    }
    if (option === "I’ll decide later") {
      setFlow("handoff")
      setUnresolved(true)
      addMessages(
        assistantMessage(
          "No consultation was started. Your preceding conversation remains saved, and the follow-up status is unresolved until care is confirmed.",
          ["Show care options", "Review handoff summary"],
          "normal",
          "Follow-up unresolved",
        ),
      )
      saveHistory("Clinical consultation follow-up", "Follow-up unresolved")
      return
    }
    if (option === "Review handoff summary") {
      setHandoffOpen(true)
      return
    }
    addMessages(userMessage(option))
    if (flow === "symptom-detail") {
      setClinicalContext((context) =>
        `${context}\nPatient-reported symptom progression: ${option}`.trim(),
      )
    }
    if (option === "I take other medicines") {
      setClinicalContext((context) =>
        `${context}\nPatient reports taking other medicines; names and dosages still require confirmation.`.trim(),
      )
    }
    if (flow === "record-confirm") {
      if (option.startsWith("Yes")) {
        setClinicalContext((context) =>
          `${context}\nMedication confirmed by patient: Amlodipine 5 mg, once daily.`.trim(),
        )
        setFlow("medicine-scope")
        simulatedLoad(() =>
          addMessages(
            assistantMessage(
              <>
                <strong>Thanks for confirming.</strong>
                <p>
                  Does your question concern how to use the medicine only, or
                  are you also experiencing symptoms?
                </p>
              </>,
              ["Medicine use only", "I also have symptoms"],
              "normal",
              "Scope check",
            ),
          ),
        )
      } else {
        setClinicalContext((context) =>
          `${context}\nMedication record not confirmed; exact medicine and dosage require verification.`.trim(),
        )
        setFlow("handoff")
        addMessages(
          assistantMessage(
            <>
              The medication information is not confirmed. Please check the
              dispensing label or contact your pharmacist or clinic. I will keep
              this follow-up marked as <strong>unresolved</strong>.
            </>,
            ["Show care options", "Review handoff summary"],
            "warning",
            "Information not confirmed",
          ),
        )
        saveHistory("Medication record mismatch", "Follow-up unresolved")
      }
      return
    }
    if (flow === "medicine-scope") {
      if (option.includes("symptoms")) {
        setFlow("emergency-check")
        addMessages(
          assistantMessage(
            "Please complete this safety check before we continue.",
            undefined,
            "warning",
            "Safety check",
          ),
        )
      } else {
        setFlow("counselling")
        simulatedLoad(() =>
          addMessages(
            assistantMessage(
              <CounsellingContent
                type={
                  topic === "missed-dose"
                    ? "missed-dose"
                    : topic === "precautions"
                      ? "precautions"
                      : "medicine"
                }
              />,
              ["Ask a follow-up", "Review conversation summary"],
              "success",
              "Reviewed guidance",
            ),
          ),
        )
        saveHistory("Amlodipine medicine use", "Counselling provided")
      }
      return
    }
    if (flow === "clinical-questions") {
      if (option === "I’m not sure") {
        setFlow("handoff")
        addMessages(
          assistantMessage(
            "The medicine and health background is not clear enough for safe counselling. I can prepare a summary for a teleconsult or your usual clinic.",
            ["Show care options", "Review handoff summary"],
            "warning",
            "Professional review recommended",
          ),
        )
      } else {
        setFlow("clinical-background")
        addMessages(
          assistantMessage(
            "Have you recently been admitted to hospital, had a medicine change, or are you pregnant or breastfeeding?",
            [
              "No to all",
              "Recent hospital admission",
              "Recent medicine change",
              "Pregnant or breastfeeding",
            ],
            "normal",
            "Health background",
          ),
        )
      }
      return
    }
    if (flow === "clinical-background") {
      if (option === "No to all") {
        const symptomAlreadyCaptured = clinicalContext.includes(
          "Patient-reported symptoms at intake:",
        ) || clinicalContext.includes("Patient-reported symptoms:")
        setFlow(symptomAlreadyCaptured ? "symptom-detail" : "symptom-description")
        addMessages(
          assistantMessage(
            symptomAlreadyCaptured
              ? "Thanks. When did the symptom begin, how severe is it now, and is it improving, unchanged, or getting worse?"
              : "What symptom or symptoms are you experiencing? Describe them in your own words, including where you feel them if relevant.",
            symptomAlreadyCaptured
              ? [
                  "Today, mild and improving",
                  "Today and getting worse",
                  "Several days, mild and unchanged",
                  "Severe or rapidly worsening",
                  "I’m not sure",
                ]
              : undefined,
            "normal",
            symptomAlreadyCaptured ? "Onset, severity and progression" : "Symptom description",
          ),
        )
      } else {
        setFlow("handoff")
        addMessages(
          assistantMessage(
            "This needs individual clinical review before medicine advice can be given. I can prepare a summary for a teleconsult or your usual clinic.",
            ["Show care options", "Review handoff summary"],
            "warning",
            "Professional review recommended",
          ),
        )
      }
      return
    }
    if (flow === "symptom-detail") {
      if (
        option.includes("worse") ||
        option.includes("Severe") ||
        option.includes("not sure")
      ) {
        setFlow("handoff")
        addMessages(
          assistantMessage(
            "Because symptoms are worsening or unclear, please seek a prompt professional assessment. If any emergency warning sign appears, go to A&E or call 995.",
            ["Show care options", "Review handoff summary"],
            "warning",
            "Consultation recommended",
          ),
        )
        saveHistory("Blood pressure symptom review", "Teleconsult recommended")
      } else {
        setFlow("counselling")
        addMessages(
          assistantMessage(
            <CounsellingContent type="symptom" />,
            ["Ask a follow-up", "Review conversation summary"],
            "success",
            "Counselling guidance",
          ),
        )
      }
      return
    }
    if (option === "I will seek urgent help") {
      setUnresolved(true)
      addMessages(
        assistantMessage(
          "Recorded as patient-reported: you intend to seek urgent help. This does not confirm that care was received. The chatbot cannot call 995, dispatch help, or confirm that assistance is on the way.",
          undefined,
          "normal",
          "Emergency reminder",
        ),
      )
      saveHistory("Urgent symptom check", "Emergency action unconfirmed")
      return
    }
    if (option === "I cannot take action now") {
      setUnresolved(true)
      addMessages(
        assistantMessage(
          "Please seek emergency help immediately if you can. This conversation remains unresolved because the chatbot cannot confirm your safety or dispatch assistance. Call 995 for a life-threatening emergency.",
          undefined,
          "warning",
          "Emergency follow-up unresolved",
        ),
      )
      saveHistory("Urgent symptom check", "Emergency follow-up unresolved")
      return
    }
    addMessages(
      assistantMessage(
        "Thanks. You can type another question, or review the conversation summary for a simulated clinical handoff.",
        ["Review conversation summary"],
      ),
    )
  }

  const send = (event?: FormEvent) => {
    event?.preventDefault()
    if (assistant !== "hypertension") return
    const clean = input.trim()
    if (!clean) return
    setInput("")
    if (landing) {
      startQuestion(clean)
      return
    }
    const lower = clean.toLowerCase()
    addMessages(userMessage(clean))

    if (flow === "symptom-description") {
      setClinicalContext((context) =>
        `${context}\nPatient-reported symptoms: ${clean}`.trim(),
      )
      setFlow("symptom-detail")
      addMessages(
        assistantMessage(
          "When did the symptom begin, how severe is it now, and is it improving, unchanged, or getting worse?",
          [
            "Today, mild and improving",
            "Today and getting worse",
            "Several days, mild and unchanged",
            "Severe or rapidly worsening",
            "I’m not sure",
          ],
          "normal",
          "Onset, severity and progression",
        ),
      )
      return
    }

    // Once the Hypertension Assistant has completed its safety checks, let
    // the LLM handle natural-language follow-up questions. The scripted
    // branches below remain responsible for triage and escalation.
    if (
      assistant === "hypertension" &&
      (flow === "counselling" || flow === "general")
    ) {
      void askAssistant(clean)
      return
    }

    if (
      lower.includes("chest pain") ||
      lower.includes("can't breathe") ||
      lower.includes("cannot breathe") ||
      lower.includes("faint")
    ) {
      setFlow("emergency")
      simulatedLoad(() =>
        addMessages(
          assistantMessage(
            <EmergencyContent />,
            ["I will seek urgent help", "I cannot take action now"],
            "warning",
            "Urgent action recommended",
          ),
        ),
      )
    } else if (
      lower.includes("dizzy") ||
      lower.includes("symptom") ||
      lower.includes("headache")
    ) {
      setFlow("emergency-check")
      simulatedLoad(() =>
        addMessages(
          assistantMessage(
            "I’m sorry you’re experiencing this. Please complete the emergency checklist before we continue.",
            undefined,
            "warning",
            "Safety check",
          ),
        ),
      )
    } else if (
      !lower.includes("pressure") &&
      !lower.includes("hypertension") &&
      !lower.includes("medicine") &&
      !lower.includes("medication")
    ) {
      simulatedLoad(() =>
        addMessages(
          assistantMessage(
            "That appears to be outside this Hypertension Assistant’s approved scope. Please ask about blood pressure, hypertension medicines, symptoms, or when to seek care. For other health or service questions, use the appropriate healthcare service.",
            ["Show care options"],
            "warning",
            "Outside approved scope",
          ),
        ),
      )
    } else {
      void askAssistant(clean)
    }
  }

  const downloadSummary = () => {
    const text = `HEALTHHUB AI BETA — SIMULATED HANDOFF\n\nAssistant: Hypertension Assistant\nMedication shown: Amlodipine 5 mg once daily (illustrative, patient confirmation requested)\nConcern: Hypertension medication / symptom enquiry\nEmergency signs: ${
      flow === "emergency" ? "Potential sign reported" : "None confirmed"
    }\nOutcome: ${
      unresolved
        ? "Follow-up unresolved"
        : "Patient reports intent to seek care"
    }\n\nThis is a prototype summary. It has not been sent to a clinic and is not part of a medical record.`
    const url = URL.createObjectURL(new Blob([text], { type: "text/plain" }))
    const link = document.createElement("a")
    link.href = url
    link.download = "HealthHub-simulated-handoff.txt"
    link.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="app">
      <Homepage
        onOpen={() => setPanelOpen(true)}
        onAcceptCookies={() => setCookiesAccepted(true)}
        cookiesAccepted={cookiesAccepted}
      />
      {panelOpen && <div className="page-dim" />}
      <aside className={`ai-panel ${panelOpen ? "open" : ""}`}>
        {!accepted ? (
          <Consent
            onAccept={() => setAccepted(true)}
            onClose={() => setPanelOpen(false)}
            onSignedIn={() => setSingpassSignedIn(true)}
            signedIn={singpassSignedIn}
          />
        ) : (
          <>
            <PanelHeader
              assistant={assistant}
              onClose={() => setPanelOpen(false)}
              onHistory={() => setHistoryOpen((value) => !value)}
              onMenu={() => setDrawerOpen((value) => !value)}
            />
            {drawerOpen && (
              <Navigation
                active={assistant}
                history={history}
                onChoose={chooseAssistant}
                onClose={() => setDrawerOpen(false)}
                onOpenHistory={openHistoryConversation}
                signedIn={singpassSignedIn}
              />
            )}
            {historyOpen && (
              <HistoryPanel
                history={history}
                onClose={() => setHistoryOpen(false)}
                onOpen={openHistoryConversation}
                onClear={() => {
                  if (window.confirm("Clear all saved conversation history?")) {
                    setHistory([])
                    setHistoryOpen(false)
                  }
                }}
              />
            )}
            <div className="chat-body">
              {landing ? (
                <AssistantLanding
                  assistant={assistant}
                  onHypertension={() => chooseAssistant("hypertension")}
                  onQuestion={startQuestion}
                />
              ) : (
                <div className="message-list">
                  <div className="date-pill">Today</div>
                  {messages.map((message) => (
                    <ChatMessage
                      key={message.id}
                      message={message}
                      onOption={handleOption}
                    />
                  ))}
                  {flow === "emergency-check" && !loading && (
                    <EmergencyChecklist
                      selected={selectedSigns}
                      onChange={setSelectedSigns}
                      onSubmit={submitEmergency}
                    />
                  )}
                  {loading && <Typing />}
                  <div ref={endRef} />
                </div>
              )}
            </div>
            {assistant === "hypertension" ? (
              <Composer input={input} onChange={setInput} onSubmit={send} />
            ) : (
              <div className="composer-area">
                <div className="ghost-input">
                  HealthHub AI Beta is a demonstration view only.
                </div>
                <small>
                  Select Hypertension Assistant to start a conversation.
                </small>
              </div>
            )}
          </>
        )}
        {singpassRequiredOpen && (
          <SimulatedSingpassDialog
            onClose={() => {
              setSingpassRequiredOpen(false)
              setPendingHypertension(null)
            }}
            onSuccess={() => {
              setSingpassSignedIn(true)
              setSingpassRequiredOpen(false)
              if (pendingHypertension?.kind === "history") {
                loadHistoryConversation(pendingHypertension.item)
              } else {
                setAssistant("hypertension")
                setLanding(true)
                setMessages([])
                setFlow("idle")
                setSelectedSigns([])
              }
              setPendingHypertension(null)
            }}
          />
        )}
      </aside>
      {handoffOpen && (
        <HandoffModal
          confirmed={handoffConfirmed}
          unresolved={unresolved}
          showCareOptions={flow !== "emergency"}
          onClose={() => setHandoffOpen(false)}
          onConfirm={() => {
            setHandoffConfirmed(true)
            saveHistory("Clinical handoff summary", "Summary confirmed")
          }}
          onDownload={downloadSummary}
        />
      )}
    </div>
  )
}

function Consent({
  onAccept,
  onClose,
  onSignedIn,
  signedIn,
}: {
  onAccept: () => void
  onClose: () => void
  onSignedIn: () => void
  signedIn: boolean
}) {
  const [helperOpen, setHelperOpen] = useState(false)
  const [singpassOpen, setSingpassOpen] = useState(false)

  const openSingpass = () => {
    setHelperOpen(false)
    setSingpassOpen(true)
  }

  return (
    <div className="consent-page">
      <div className="consent-header">
        <button
          className={`icon-button ${helperOpen ? "active" : ""}`}
          aria-expanded={helperOpen}
          aria-label={helperOpen ? "Close helper menu" : "Open helper menu"}
          onClick={() => setHelperOpen((value) => !value)}
        >
          <Icon name="menu" size={27} />
        </button>
        <strong>
          HealthHub AI <span>Beta</span>
        </strong>
        <button className="close-circle" onClick={onClose} aria-label="Close">
          <Icon name="close" size={18} />
        </button>
      </div>
      {helperOpen && (
        <>
          <button
            className="helper-scrim"
            aria-label="Close helper menu"
            onClick={() => setHelperOpen(false)}
          />
          <div className="consent-helper">
            <div className="helper-heading">
              <div>
                <span>HELP &amp; SETTINGS</span>
                <strong>How can we help?</strong>
              </div>
              <button
                className="icon-button"
                aria-label="Close helper menu"
                onClick={() => setHelperOpen(false)}
              >
                <Icon name="close" size={18} />
              </button>
            </div>
            <div className="consent-links">
              <button onClick={() => setHelperOpen(false)}>
                <span>
                  <strong>Change Language</strong>
                  <small>Select your preferred language for HealthHub AI</small>
                </span>
                <Icon name="chevron" />
              </button>
              <button onClick={openSingpass}>
                <span>
                  <strong>Singpass</strong>
                  <small>
                    Log in to view personalised suggestions (simulated)
                  </small>
                </span>
                <Icon name="chevron" />
              </button>
              <button onClick={() => setHelperOpen(false)}>
                <span>
                  <strong>User Guide</strong>
                  <small>Learn how to use HealthHub AI</small>
                </span>
                <Icon name="chevron" />
              </button>
            </div>
          </div>
        </>
      )}
      <div className="consent-content">
        <div className="welcome-bot">
          <Icon name="bot" size={27} />
        </div>
        <span className="beta-pill">AI BETA</span>
        <h2>Hello, I’m HealthHub AI</h2>
        <p>
          I can help you find general health information and guide you to
          HealthHub services.
        </p>
        <div className={`singpass-suggestion ${signedIn ? "signed-in" : ""}`}>
          <Icon name={signedIn ? "check" : "shield"} />
          <div>
            <strong>
              {signedIn
                ? "Signed in with Singpass"
                : "Get more relevant suggestions"}
            </strong>
            <span>
              {signedIn
                ? "Welcome, Alex. Personalised suggestions are enabled."
                : "Log in with Singpass for a personalised experience."}
            </span>
          </div>
          <button disabled={signedIn} onClick={openSingpass}>
            {signedIn ? "Signed in" : "Log in"}
          </button>
        </div>
        <div className="terms-box">
          <Icon name="alert" size={19} />
          <div>
            <p>
              HealthHub AI’s responses are for general information and should
              not be taken as professional medical advice.
            </p>
            <p>
              Please do not share personal or sensitive information. To proceed,
              read and accept our <a href="#terms">Terms of Use</a> and{" "}
              <a href="#privacy">Privacy Policy</a>.
            </p>
          </div>
        </div>
        <button className="agree-button" onClick={onAccept}>
          I agree to proceed
        </button>
        <small className="prototype-disclaimer">
          Prototype only. No live HealthHub, Singpass or medical record
          connection.
        </small>
      </div>
      <div className="consent-bottom">
        <div className="ghost-input">Ask me anything about health…</div>
        <button>
          <Icon name="send" />
        </button>
      </div>
      {singpassOpen && (
        <SimulatedSingpassDialog
          onClose={() => setSingpassOpen(false)}
          onSuccess={() => {
            onSignedIn()
            setSingpassOpen(false)
          }}
        />
      )}
    </div>
  )
}

function SimulatedSingpassDialog({
  onClose,
  onSuccess,
}: {
  onClose: () => void
  onSuccess: () => void
}) {
  const [loading, setLoading] = useState(false)
  const loginTimer = useRef<number | null>(null)

  useEffect(
    () => () => {
      if (loginTimer.current !== null) {
        window.clearTimeout(loginTimer.current)
      }
    },
    [],
  )

  const simulateLogin = () => {
    setLoading(true)
    loginTimer.current = window.setTimeout(onSuccess, 900)
  }

  return (
    <div
      className="singpass-layer"
      role="dialog"
      aria-modal="true"
      aria-labelledby="singpass-title"
    >
      <button
        className="singpass-scrim"
        aria-label="Close simulated Singpass login"
        onClick={onClose}
      />
      <div className="singpass-dialog">
        <header>
          <div className="singpass-wordmark">Singpass</div>
          <button
            className="icon-button"
            aria-label="Close simulated Singpass login"
            onClick={onClose}
          >
            <Icon name="close" size={18} />
          </button>
        </header>
        <div className="singpass-dialog-content">
          <span className="simulation-pill">SIMULATION</span>
          <div className="singpass-shield">
            <Icon name="shield" size={30} />
          </div>
          <h3 id="singpass-title">Log in to HealthHub</h3>
          <p>
            This prototype will simulate a successful Singpass login. No
            credentials or personal information are required.
          </p>
          <div className="login-request">
            <span>Requesting service</span>
            <strong>HealthHub AI Beta</strong>
          </div>
          <button
            className="singpass-continue"
            disabled={loading}
            onClick={simulateLogin}
          >
            {loading ? (
              <>
                <span className="login-spinner" /> Signing in…
              </>
            ) : (
              "Simulate Singpass login"
            )}
          </button>
          <small>
            Prototype only. This does not connect to Singpass or create a real
            session.
          </small>
        </div>
      </div>
    </div>
  )
}

function PanelHeader({
  assistant,
  onClose,
  onHistory,
  onMenu,
}: {
  assistant: "healthhub" | "hypertension"
  onClose: () => void
  onHistory: () => void
  onMenu: () => void
}) {
  return (
    <header className="panel-header">
      <button
        className="icon-button menu-button"
        onClick={onMenu}
        aria-label="Open menu"
      >
        <Icon name="menu" size={25} />
      </button>
      <div>
        <strong>
          {assistant === "hypertension"
            ? "Hypertension Assistant"
            : "HealthHub AI"}{" "}
          <span>Beta</span>
        </strong>
        {assistant === "hypertension" ? (
          <small className="medisync-status">
            <span className="online-dot" /> Running on <strong>MediSync</strong>
          </small>
        ) : (
          <small>
            <span className="online-dot" /> AI-generated information
          </small>
        )}
      </div>
      <button
        className="icon-button"
        onClick={onHistory}
        aria-label="Conversation history"
      >
        <Icon name="history" size={21} />
      </button>
      <button className="close-circle" onClick={onClose} aria-label="Close">
        <Icon name="close" size={18} />
      </button>
    </header>
  )
}

function Navigation({
  active,
  history,
  onChoose,
  onClose,
  onOpenHistory,
  signedIn,
}: {
  active: "healthhub" | "hypertension"
  history: HistoryItem[]
  onChoose: (value: "healthhub" | "hypertension") => void
  onClose: () => void
  onOpenHistory: (item: HistoryItem) => void
  signedIn: boolean
}) {
  return (
    <>
      <button
        className="drawer-scrim"
        onClick={onClose}
        aria-label="Close menu"
      />
      <nav className="drawer">
        <div className="drawer-header">
          <div>
            <Logo />
            <small>Choose an assistant</small>
          </div>
          <button className="icon-button" onClick={onClose}>
            <Icon name="close" />
          </button>
        </div>
        <div className="assistant-options">
          <button
            className={active === "healthhub" ? "active" : ""}
            onClick={() => onChoose("healthhub")}
          >
            <span className="nav-icon">
              <Icon name="bot" />
            </span>
            <span>
              <strong>HealthHub AI Beta</strong>
              <small>Demonstration view only — conversation disabled</small>
            </span>
            {active === "healthhub" && <Icon name="check" size={18} />}
          </button>
          <button
            className={active === "hypertension" ? "active" : ""}
            onClick={() => onChoose("hypertension")}
          >
            <span className="nav-icon red">
              <Icon name="stethoscope" />
            </span>
            <span>
              <strong>Hypertension Assistant</strong>
              <small>
                {signedIn
                  ? "Blood pressure and medicine counselling"
                  : "Singpass login required"}
              </small>
            </span>
            {active === "hypertension" && <Icon name="check" size={18} />}
          </button>
        </div>
        <div className="drawer-recent">
          <span className="drawer-label">RECENT CONVERSATIONS</span>
          {history.slice(0, 4).map((item) => (
            <button key={item.id} onClick={() => onOpenHistory(item)}>
              <Icon name="history" size={17} />
              <span>
                <strong>{item.title}</strong>
                <small>{formatConversationTime(item.time)}</small>
              </span>
            </button>
          ))}
        </div>
        <div className="drawer-footer">
          <Icon name="shield" size={17} />
          <span>
            This is an interactive prototype. No live clinical system is
            connected.
          </span>
        </div>
      </nav>
    </>
  )
}

function HistoryPanel({
  history,
  onClose,
  onOpen,
  onClear,
}: {
  history: HistoryItem[]
  onClose: () => void
  onOpen: (item: HistoryItem) => void
  onClear: () => void
}) {
  return (
    <div className="history-panel">
      <div className="history-header">
        <div>
          <span className="drawer-label">SAVED IN THIS PROTOTYPE</span>
          <h3>Conversation history</h3>
        </div>
        <button className="icon-button" onClick={onClose}>
          <Icon name="close" />
        </button>
      </div>
      <div className="history-list">
        {history.map((item) => (
          <button key={item.id} onClick={() => onOpen(item)}>
            <span className="history-symbol">
              <Icon name="history" />
            </span>
            <span>
              <strong>{item.title}</strong>
              <small>{formatConversationTime(item.time)}</small>
              <em
                className={
                  item.status.includes("unresolved") ? "unresolved" : ""
                }
              >
                {item.status}
              </em>
            </span>
            <Icon name="chevron" size={17} />
          </button>
        ))}
      </div>
      {history.length > 0 && (
        <button className="history-clear-button" onClick={onClear}>
          Clear all conversation history
        </button>
      )}
    </div>
  )
}

function AssistantLanding({
  assistant,
  onHypertension,
  onQuestion,
}: {
  assistant: "healthhub" | "hypertension"
  onHypertension: () => void
  onQuestion: (question: string) => void
}) {
  if (assistant === "healthhub") {
    return (
      <div className="landing general-landing">
        <div className="landing-icon">
          <Icon name="bot" size={31} />
        </div>
        <span className="landing-kicker">HEALTHHUB AI BETA</span>
        <h2>How can I help today?</h2>
        <p>
          Ask about general health topics or find your way around HealthHub
          services.
        </p>
        <div className="general-actions">
          <button onClick={() => onQuestion("How do I find a polyclinic?")}>
            Find healthcare services <Icon name="arrow" />
          </button>
          <button onClick={() => onQuestion("Tell me about health screening")}>
            Learn about health screening <Icon name="arrow" />
          </button>
          <button onClick={() => onQuestion("How can HealthHub help me?")}>
            Explore HealthHub features <Icon name="arrow" />
          </button>
        </div>
        <button className="switch-banner" onClick={onHypertension}>
          <span>
            <Icon name="stethoscope" />
          </span>
          <div>
            <strong>Have a blood pressure question?</strong>
            <small>Try the dedicated Hypertension Assistant</small>
          </div>
          <Icon name="chevron" />
        </button>
      </div>
    )
  }
  return (
    <div className="landing hypertension-landing">
      <div className="landing-icon heart">
        <Icon name="stethoscope" size={32} />
      </div>
      <span className="landing-kicker">HYPERTENSION ASSISTANT</span>
      <h2>Hello, I’m here to help with your blood pressure</h2>
      <p>
        Get reviewed information about hypertension, your medicines and when to
        seek professional care.
      </p>
      <div className="safety-note">
        <Icon name="shield" size={18} />
        <span>
          I’ll check for urgent symptoms before giving medicine guidance.
        </span>
      </div>
      <div className="preset-list">
        <span>Choose a question to get started</span>
        {presets.map((preset, index) => (
          <button
            key={preset.title}
            onClick={() => onQuestion(preset.question)}
          >
            <span className="preset-number">0{index + 1}</span>
            <span className="preset-copy">
              <strong>{preset.title}</strong>
              <span>“{preset.question}”</span>
              <small>{preset.description}</small>
            </span>
            <Icon name="chevron" size={17} />
          </button>
        ))}
      </div>
    </div>
  )
}

function ChatMessage({
  message,
  onOption,
}: {
  message: Message
  onOption: (option: string) => void
}) {
  return (
    <div className={`message-row ${message.role}`}>
      {message.role === "assistant" && (
        <span className="bot-avatar">
          <Icon name="bot" size={17} />
        </span>
      )}
      <div className="message-column">
        {message.label && (
          <span className={`message-label ${message.tone}`}>
            {message.label}
          </span>
        )}
        <div className={`bubble ${message.tone || ""}`}>{message.body}</div>
        {message.options && (
          <div className="message-options">
            {message.options.map((option) => (
              <button key={option} onClick={() => onOption(option)}>
                {option}
                <Icon name="chevron" size={15} />
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function EmergencyChecklist({
  selected,
  onChange,
  onSubmit,
}: {
  selected: string[]
  onChange: (value: string[]) => void
  onSubmit: () => void
}) {
  return (
    <div className="checklist-card">
      <div className="checklist-header">
        <span>
          <Icon name="alert" />
        </span>
        <div>
          <strong>Emergency warning signs</strong>
          <small>Select any that apply right now</small>
        </div>
      </div>
      <div className="checklist-items">
        {emergencySigns.map((sign) => {
          const checked = selected.includes(sign)
          return (
            <label key={sign} className={checked ? "checked" : ""}>
              <input
                type="checkbox"
                checked={checked}
                onChange={() =>
                  onChange(
                    checked
                      ? selected.filter((item) => item !== sign)
                      : [...selected, sign],
                  )
                }
              />
              <span className="fake-check">
                {checked && <Icon name="check" size={14} />}
              </span>
              <span>{sign}</span>
            </label>
          )
        })}
      </div>
      <button
        className={selected.length ? "danger-button" : "safe-button"}
        onClick={onSubmit}
      >
        {selected.length
          ? `Continue with ${selected.length} selected`
          : "None of these apply"}
      </button>
      <small>
        Not sure? Select any possible sign. Do not delay emergency care to
        finish this checklist.
      </small>
    </div>
  )
}

function CounsellingContent({
  type,
}: {
  type: "medicine" | "lifestyle" | "symptom" | "missed-dose" | "precautions"
}) {
  if (type === "lifestyle") {
    return (
      <>
        <strong>Everyday steps can help lower blood pressure</strong>
        <ul>
          <li>Reduce salt and choose fresh, minimally processed foods.</li>
          <li>
            Aim for regular activity suitable for your health and mobility.
          </li>
          <li>
            Take prescribed medicines consistently and track your readings.
          </li>
          <li>
            Limit alcohol, avoid smoking and work towards a healthy weight.
          </li>
        </ul>
        <p className="citation">
          Sources: HealthHub, “High Blood Pressure”; MOH Singapore hypertension
          guidance. Reviewed information for prototype use.
        </p>
        <WarningLine />
      </>
    )
  }
  if (type === "symptom") {
    return (
      <>
        <strong>How these symptoms relate to Amlodipine 5 mg</strong>
        <p>
          Dizziness can occur with Amlodipine, particularly after starting
          treatment or a dose change. A persistent dry cough is not a typical
          Amlodipine effect and can have another cause or relate to a different
          blood pressure medicine, such as an ACE inhibitor.
        </p>
        <ul>
          <li>
            Sit or lie down if light-headed, rise slowly, and record the timing
            of the symptom and dose.
          </li>
          <li>
            Arrange a pharmacist or clinician review if dizziness persists or
            the cough does not settle.
          </li>
          <li>Do not stop or change Amlodipine without professional advice.</li>
        </ul>
        <p className="citation">
          Source: HealthHub, “Amlodipine”; reviewed medication information.
        </p>
        <WarningLine />
      </>
    )
  }
  if (type === "missed-dose") {
    return (
      <>
        <strong>Missed-dose guidance for Amlodipine 5 mg</strong>
        <p>
          For the confirmed illustrative record, take the missed dose when you
          remember unless it is nearly time for your next scheduled dose. If it
          is nearly time, skip the missed dose and continue at the usual time.
        </p>
        <ul>
          <li>Do not take two doses to make up for the missed tablet.</li>
          <li>
            Check your dispensing label because your prescriber’s directions
            take priority.
          </li>
          <li>
            Contact a pharmacist or prescriber if more than one dose was missed
            or the timing is unclear.
          </li>
        </ul>
        <p className="citation">
          Source: HealthHub, “Amlodipine”; reviewed medication information.
        </p>
        <WarningLine />
      </>
    )
  }
  if (type === "precautions") {
    return (
      <>
        <strong>Precautions for Amlodipine 5 mg</strong>
        <p>
          Continue to take the confirmed illustrative medicine exactly as
          directed. Avoid changing the dose or stopping it without speaking to
          your prescriber.
        </p>
        <ul>
          <li>
            Avoid driving or operating machinery if you feel dizzy or
            light-headed.
          </li>
          <li>
            Stand up slowly, particularly when first starting treatment or after
            a dose change.
          </li>
          <li>
            Check with a pharmacist before using supplements, traditional
            medicines or new over-the-counter products.
          </li>
          <li>
            Tell your clinician about pregnancy, breastfeeding, liver conditions
            or troublesome ankle swelling.
          </li>
        </ul>
        <p className="citation">
          Source: HealthHub, “Amlodipine”; reviewed medication information.
        </p>
        <WarningLine />
      </>
    )
  }
  return (
    <>
      <strong>About your recorded Amlodipine</strong>
      <p>
        Amlodipine is commonly used to lower blood pressure. Take it exactly as
        shown on your dispensing label. Do not double a dose or stop it without
        checking with a pharmacist or prescriber.
      </p>
      <ul>
        <li>Try to take it at around the same time each day.</li>
        <li>
          Possible effects can include headache, flushing, dizziness or ankle
          swelling.
        </li>
        <li>Seek review for troublesome or persistent effects.</li>
      </ul>
      <p className="citation">
        Source: HealthHub, “Amlodipine”; reviewed medication information.
      </p>
      <WarningLine />
    </>
  )
}

function WarningLine() {
  return (
    <div className="warning-line">
      <Icon name="alert" size={17} />
      <span>
        Seek urgent help for chest pain, severe breathing difficulty, fainting,
        sudden weakness, confusion or rapidly worsening symptoms.
      </span>
    </div>
  )
}

function EmergencyContent() {
  return (
    <>
      <strong>Seek emergency medical help now</strong>
      <p>
        Go to the nearest A&amp;E department. For a life-threatening emergency
        in Singapore, call <strong>995</strong>.
      </p>
      <p>
        Do not wait for another chat response and do not drive yourself if you
        feel faint or severely unwell.
      </p>
      <small className="mock-note">
        This chatbot cannot call 995, dispatch an ambulance or confirm that help
        is on the way.
      </small>
    </>
  )
}

function CareOptions() {
  const [route, setRoute] =
    useState<"teleconsult" | "clinic" | "emergency" | null>(null)
  const [appointment, setAppointment] = useState<string | null>(null)

  return (
    <div className="care-options">
      <strong>Choose a suitable care route</strong>
      <button
        className={route === "teleconsult" ? "selected" : ""}
        onClick={() => setRoute("teleconsult")}
      >
        <span>
          <Icon name="stethoscope" />
        </span>
        <p>
          <b>Teleconsultation</b>
          <small>For non-emergency review today or soon</small>
        </p>
        <Icon name="chevron" size={16} />
      </button>
      <button
        className={route === "clinic" ? "selected" : ""}
        onClick={() => setRoute("clinic")}
      >
        <span>
          <Icon name="home" />
        </span>
        <p>
          <b>Your usual clinic</b>
          <small>Choose a nearby polyclinic or GP appointment</small>
        </p>
        <Icon name="chevron" size={16} />
      </button>
      <button
        className={route === "emergency" ? "selected emergency" : ""}
        onClick={() => setRoute("emergency")}
      >
        <span>
          <Icon name="alert" />
        </span>
        <p>
          <b>A&amp;E / 995</b>
          <small>For life-threatening or emergency warning signs</small>
        </p>
        <Icon name="chevron" size={16} />
      </button>

      {route === "teleconsult" && (
        <div className="route-detail">
          <div className="route-heading">
            <span className="route-icon">
              <Icon name="stethoscope" size={17} />
            </span>
            <div>
              <b>Singapore teleconsult services</b>
              <small>Opens the provider’s website in a new tab</small>
            </div>
          </div>
          <div className="provider-list">
            <a
              href="https://www.doctoranywhere.com/"
              target="_blank"
              rel="noreferrer"
            >
              <span>
                <b>Doctor Anywhere</b>
                <small>Online GP consultations</small>
              </span>
              <Icon name="arrow" size={15} />
            </a>
            <a
              href="https://whitecoat.global/"
              target="_blank"
              rel="noreferrer"
            >
              <span>
                <b>WhiteCoat</b>
                <small>Telemedicine and medication delivery</small>
              </span>
              <Icon name="arrow" size={15} />
            </a>
            <a href="https://speedoc.com/sg/" target="_blank" rel="noreferrer">
              <span>
                <b>Speedoc</b>
                <small>Virtual and home-based care</small>
              </span>
              <Icon name="arrow" size={15} />
            </a>
          </div>
          <p className="route-disclaimer">
            These are example external providers, not endorsements. Fees,
            eligibility and availability vary. No booking is made by this
            prototype.
          </p>
        </div>
      )}

      {route === "clinic" && (
        <div className="route-detail">
          <div className="location-chip">
            <Icon name="home" size={15} />
            Example location: Outram, Singapore
          </div>
          <div className="clinic-list">
            {[
              {
                name: "Outram Polyclinic",
                detail: "3 Second Hospital Avenue · 0.4 km",
                slot: "Tomorrow, 10:20 am",
              },
              {
                name: "Raffles Medical — Tiong Bahru",
                detail: "302 Tiong Bahru Road · 1.8 km",
                slot: "Today, 4:30 pm",
              },
            ].map((clinic) => (
              <div className="clinic-card" key={clinic.name}>
                <div>
                  <b>{clinic.name}</b>
                  <small>{clinic.detail}</small>
                  <span>Next example slot: {clinic.slot}</span>
                </div>
                <button onClick={() => setAppointment(clinic.name)}>
                  Select
                </button>
              </div>
            ))}
          </div>
          {appointment && (
            <div className="appointment-confirmation">
              <Icon name="check" size={16} />
              <span>
                <b>{appointment} selected</b>
                <small>
                  Appointment preference recorded for this simulation only. No
                  clinic booking was made.
                </small>
              </span>
            </div>
          )}
          <p className="route-disclaimer">
            “Nearby” results use an example location because this prototype does
            not access your device location.
          </p>
        </div>
      )}

      {route === "emergency" && (
        <div className="route-detail emergency-detail">
          <span className="emergency-label">NEAREST TO EXAMPLE LOCATION</span>
          <h4>Singapore General Hospital A&amp;E</h4>
          <p>Outram Road, Singapore 169608 · Open 24 hours</p>
          <a
            className="hospital-link"
            href="https://www.sgh.com.sg/patient-care/visiting-specialist/accident-emergency"
            target="_blank"
            rel="noreferrer"
          >
            View hospital information <Icon name="arrow" size={15} />
          </a>
          <a className="call-995" href="tel:995">
            <Icon name="alert" size={18} />
            Call 995 now
          </a>
          <div className="emergency-disclaimer">
            <Icon name="shield" size={16} />
            <span>
              Pressing this button opens your device’s phone dialler. The
              chatbot does not place the call, dispatch an ambulance or confirm
              that help is coming.
            </span>
          </div>
        </div>
      )}
      <p className="citation">
        Routes are illustrative. No appointment or referral has been made.
      </p>
    </div>
  )
}

function Typing() {
  return (
    <div className="message-row assistant">
      <span className="bot-avatar">
        <Icon name="bot" size={17} />
      </span>
      <div className="typing">
        <span />
        <span />
        <span />
      </div>
    </div>
  )
}

function Composer({
  input,
  onChange,
  onSubmit,
}: {
  input: string
  onChange: (value: string) => void
  onSubmit: (event: FormEvent) => void
}) {
  return (
    <div className="composer-area">
      <form className="composer" onSubmit={onSubmit}>
        <button type="button" aria-label="Attach file">
          <Icon name="paperclip" size={19} />
        </button>
        <textarea
          aria-label="Message"
          placeholder="Ask a question about your health…"
          rows={1}
          value={input}
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault()
              event.currentTarget.form?.requestSubmit()
            }
          }}
        />
        <button type="button" aria-label="Voice input">
          <Icon name="mic" size={19} />
        </button>
        <button className="send-button" aria-label="Send" type="submit">
          <Icon name="send" size={18} />
        </button>
      </form>
      <small>
        AI-generated information may be inaccurate. This prototype is not a
        medical service.
      </small>
    </div>
  )
}

function HandoffModal({
  confirmed,
  unresolved,
  showCareOptions,
  onClose,
  onConfirm,
  onDownload,
}: {
  confirmed: boolean
  unresolved: boolean
  showCareOptions: boolean
  onClose: () => void
  onConfirm: () => void
  onDownload: () => void
}) {
  return (
    <div className="modal-layer">
      <button
        className="modal-scrim"
        onClick={onClose}
        aria-label="Close summary"
      />
      <section className="handoff-modal">
        <header>
          <div>
            <span className="drawer-label">SIMULATED CLINICAL HANDOFF</span>
            <h2>Review your summary</h2>
          </div>
          <button className="icon-button" onClick={onClose}>
            <Icon name="close" />
          </button>
        </header>
        <div className="handoff-status">
          <Icon name={confirmed ? "check" : "alert"} />
          <div>
            <strong>
              {confirmed ? "Patient confirmed" : "Confirmation required"}
            </strong>
            <span>Review the information before generating a copy.</span>
          </div>
        </div>
        <div className="summary-sheet">
          <div className="summary-brand">
            <Logo />
            <span>Prototype summary</span>
          </div>
          <dl>
            <div>
              <dt>Assistant</dt>
              <dd>Hypertension Assistant</dd>
            </div>
            <div>
              <dt>Concern</dt>
              <dd>Blood pressure medicine / symptom enquiry</dd>
            </div>
            <div>
              <dt>Illustrative record</dt>
              <dd>Amlodipine 5 mg, once daily</dd>
            </div>
            <div>
              <dt>Emergency check</dt>
              <dd>No warning sign confirmed in summary</dd>
            </div>
            <div>
              <dt>Suggested route</dt>
              <dd>Teleconsultation or usual clinic</dd>
            </div>
            <div>
              <dt>Follow-up status</dt>
              <dd className={unresolved ? "red-text" : ""}>
                {unresolved
                  ? "Unresolved — outcome not confirmed"
                  : "Patient reports intent to seek care"}
              </dd>
            </div>
          </dl>
          <div className="summary-note">
            <Icon name="shield" size={18} />
            <span>
              This has not been sent to a clinic and is not part of a real
              medical record.
            </span>
          </div>
          {showCareOptions && (
            <div className="summary-care-options">
              <div className="section-heading">
                <div>
                  <span className="drawer-label">NEXT STEP</span>
                  <h3>Book a care option</h3>
                </div>
              </div>
              <CareOptions />
            </div>
          )}
        </div>
        <div className="handoff-actions">
          {!confirmed ? (
            <>
              <button className="secondary-button" onClick={onClose}>
                Go back and edit
              </button>
              <button className="primary-button" onClick={onConfirm}>
                <Icon name="check" size={18} /> Confirm summary
              </button>
            </>
          ) : (
            <>
              <span className="confirmed-note">
                <Icon name="check" size={17} /> Saved to prototype history
              </span>
              <button className="primary-button" onClick={onDownload}>
                <Icon name="download" size={18} /> Download PDF-style summary
              </button>
            </>
          )}
        </div>
      </section>
    </div>
  )
}

export default App
