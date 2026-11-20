export type WorkflowState =
  | "idle"
  | "medicine-confirmation"
  | "medicine-scope"
  | "emergency-check"
  | "clinical-questions"
  | "clinical-background"
  | "symptom-description"
  | "symptom-detail"
  | "counselling"
  | "professional-consultation"
  | "emergency"
  | "handoff"
  | "general"

export type AssistantExtraction = {
  intent: "medicine_use" | "symptom" | "symptom_and_medicine" | "general" | "unclear"
  medicines: Array<{
    name: string | null
    dose: string | null
    frequency: string | null
    confirmedByPatient: boolean
  }>
  symptoms: Array<{
    description: string
    onset: string | null
    severity: "mild" | "moderate" | "severe" | "unknown"
    worsening: boolean | null
  }>
  emergencySigns: Array<{
    sign: string
    present: boolean
    confirmed: boolean
  }>
  context: {
    pregnancy: boolean | null
    breastfeeding: boolean | null
    recentAdmission: boolean | null
    recentMedicineChange: boolean | null
    otherConditions: string[]
    otherMedicines: string[]
  }
  medicineTaken: "yes" | "no" | "uncertain"
  lastDoseTiming: string | null
  patientAction: string | null
  missingInformation: string[]
  uncertainty: string[]
}

export type StructuredAssistantResult = {
  extraction: AssistantExtraction
  response: string
  suggestedState?: WorkflowState
}

export function emptyExtraction(): AssistantExtraction {
  return {
    intent: "unclear",
    medicines: [],
    symptoms: [],
    emergencySigns: [],
    context: {
      pregnancy: null,
      breastfeeding: null,
      recentAdmission: null,
      recentMedicineChange: null,
      otherConditions: [],
      otherMedicines: [],
    },
    medicineTaken: "uncertain",
    lastDoseTiming: null,
    patientAction: null,
    missingInformation: [],
    uncertainty: [],
  }
}

