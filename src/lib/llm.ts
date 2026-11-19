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

const systemPrompt = `You are HealthHub AI Beta, a cautious health-information assistant for Singapore users.
Provide general education only, not diagnosis, prescriptions, or personalised treatment changes.
Never tell a user to stop, start, or change a medicine dose. Encourage a pharmacist or clinician for medication-specific decisions.
If the user reports chest pain, severe breathing difficulty, fainting, sudden weakness, confusion, severe headache, or rapidly worsening symptoms, tell them to seek emergency help immediately and call 995 in Singapore.
Be concise, empathetic, and clear. Say when you are uncertain. Do not claim access to medical records, bookings, or live services.
This is a prototype and your response must not imply that a clinician has reviewed it.`

const endpoint = import.meta.env.VITE_LLM_API_URL || "/api/chat"

export async function askLLM(messages: ChatMessage[], signal?: AbortSignal) {
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      messages: [{ role: "system", content: systemPrompt }, ...messages],
    }),
    signal,
  })

  if (!response.ok) {
    throw new Error(`LLM request failed (${response.status})`)
  }

  const data = (await response.json()) as {
    reply?: string
    message?: { content?: string }
    choices?: Array<{ message?: { content?: string } }>
  }
  const reply = data.reply || data.message?.content || data.choices?.[0]?.message?.content
  if (!reply?.trim()) throw new Error("LLM response did not contain a reply")
  return reply.trim()
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
