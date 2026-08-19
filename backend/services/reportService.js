import Groq from "groq-sdk";
import dotenv from "dotenv";
dotenv.config();

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

const REPORT_SYSTEM_PROMPT = `
You are a clinical intake summarizer. Synthesize the dialogue into a structured JSON report.
Return ONLY valid JSON:
{
  "callStatus": "Completed" | "Partial / Aborted",
  "patientName": string,
  "primaryConcern": string,
  "duration": string,
  "severity": string,
  "associatedSymptoms": string[],
  "clinicalFollowUpFlags": string[],
  "summaryNotes": string
}`;

async function callGroq(model, messages) {
  return groq.chat.completions.create({
    model,
    response_format: { type: "json_object" },
    messages,
    temperature: 0.2,
  });
}

export async function generateHealthReport(conversationHistory) {
  const messages = [
    { role: "system", content: REPORT_SYSTEM_PROMPT },
    ...conversationHistory,
  ];

  const models = ["openai/gpt-oss-20b", "qwen/qwen3.6-27b"];

  for (let i = 0; i < models.length; i++) {
    try {
      const response = await callGroq(models[i], messages);
      return JSON.parse(response.choices[0].message.content);
    } catch (error) {
      console.error(`Report Service Error (model: ${models[i]}):`, error?.message || error);
      if (i === models.length - 1) throw error;
    }
  }
}