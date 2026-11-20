import { AssistantExtraction, StructuredAssistantResult, emptyExtraction } from "./workflow"

export type ChatRole = "system" | "user" | "assistant"

export type ChatMessage = {
  role: ChatRole
  content: string
}

export type IntentClassification = {
  intent: "medicine" | "symptom" | "emergency" | "general" | "unclear"
  mentionsMedication: boolean
  mentionsSymptoms: boolean
  possibleEmergency: boolean
}

const systemPrompt = `You are the Hypertension Assistant, a cautious health-information assistant for Singapore patients taking hypertension medicines.
Only answer questions about hypertension medicines, how they are used, possible medicine-related symptoms, and when to seek care. For unrelated health, lifestyle, administrative, or general HealthHub questions, politely say that they are outside your scope.
Provide general education only, not diagnosis, prescriptions, or personalised treatment changes.
Never tell a user to stop, start, or change a medicine dose. Encourage a pharmacist or clinician for medication-specific decisions.
If the user reports chest pain, severe breathing difficulty, fainting, sudden weakness, confusion, severe headache, or rapidly worsening symptoms, tell them to seek emergency help immediately and call 995 in Singapore.
Use the known clinical context supplied with the conversation. Do not ask the patient to repeat their medicines or symptoms when they have already provided them; ask only for missing or changed information.
Be concise, empathetic, and clear. Say when you are uncertain. Do not claim access to medical records, bookings, or live services.
This is a prototype and your response must not imply that a clinician has reviewed it.`

const structuredPrompt = `${systemPrompt}

For every user message, extract facts into the JSON contract supplied by the application.
Return JSON with exactly these top-level fields: extraction, response, suggestedState.
Never infer that an emergency sign is absent when it was not explicitly checked.
Use null, unknown, or empty arrays for missing information. The application, not the model,
controls emergency escalation and workflow transitions.`

const endpoint = import.meta.env.VITE_LLM_API_URL || "/api/chat"
const browserGeminiKey = import.meta.env.VITE_GEMINI_API_KEY
const browserGeminiModel = import.meta.env.VITE_GEMINI_MODEL || "gemini-3.5-flash-lite"

async function callBrowserGemini(messages: ChatMessage[]) {
  const system = messages.find((message) => message.role === "system")
  const contents = messages
    .filter((message) => message.role !== "system")
    .map((message) => ({
      role: message.role === "assistant" ? "model" : "user",
      parts: [{ text: message.content }],
    }))
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${browserGeminiModel}:generateContent?key=${browserGeminiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        systemInstruction: system ? { parts: [{ text: system.content }] } : undefined,
        contents,
        generationConfig: { responseMimeType: "application/json", maxOutputTokens: 700 },
      }),
    },
  )
  const data = (await response.json()) as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>
    error?: { message?: string }
  }
  if (!response.ok) throw new Error(data.error?.message || `Gemini request failed (${response.status})`)
  return data.candidates?.[0]?.content?.parts?.map((part) => part.text || "").join("") || ""
}

export async function askLLM(
  messages: ChatMessage[],
  signal?: AbortSignal,
  clinicalContext = "",
) : Promise<StructuredAssistantResult> {
  if (browserGeminiKey) {
    const content = await callBrowserGemini([
      { role: "system", content: clinicalContext ? `${structuredPrompt}\n\nKnown clinical context:\n${clinicalContext}` : structuredPrompt },
      ...messages,
    ])
    try {
      const parsed = JSON.parse(content) as Partial<StructuredAssistantResult>
      if (parsed.response) {
        return {
          extraction: parsed.extraction || emptyExtraction(),
          response: parsed.response,
          suggestedState: parsed.suggestedState,
        }
      }
    } catch {
      // Fall through and display a plain model response if JSON was not returned.
    }
    if (content.trim()) return { extraction: emptyExtraction(), response: content.trim() }
  }
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      messages: [
        {
          role: "system",
          content: clinicalContext
            ? `${structuredPrompt}\n\nKnown clinical context:\n${clinicalContext}`
            : structuredPrompt,
        },
        ...messages,
      ],
    }),
    signal,
  })

  if (!response.ok) {
    throw new Error(`LLM request failed (${response.status})`)
  }

  const data = (await response.json()) as {
    reply?: string
    response?: string
    extraction?: AssistantExtraction
    suggestedState?: StructuredAssistantResult["suggestedState"]
    result?: Partial<StructuredAssistantResult>
    message?: { content?: string }
    choices?: Array<{ message?: { content?: string } }>
  }
  const raw = data.result || data
  const reply = raw.response || data.reply || data.message?.content || data.choices?.[0]?.message?.content
  if (!reply?.trim()) throw new Error("LLM response did not contain a reply")
  return {
    extraction: raw.extraction || emptyExtraction(),
    response: reply.trim(),
    suggestedState: raw.suggestedState,
  }
}

export async function classifyIntent(question: string) {
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      mode: "classify",
      question,
    }),
  })
  if (!response.ok) throw new Error(`Classifier request failed (${response.status})`)
  const data = (await response.json()) as { classification?: IntentClassification }
  if (!data.classification) throw new Error("Classifier response was invalid")
  return data.classification
}
