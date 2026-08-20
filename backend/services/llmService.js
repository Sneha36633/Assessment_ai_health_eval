import Groq from "groq-sdk";
import dotenv from "dotenv";
dotenv.config();

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

const INTAKE_SYSTEM_PROMPT = `
You are an empathetic, clinical AI health screening assistant.
Rules:
1. Greet the patient warmly and collect: Name, Age, Main symptom, Duration, Severity, and Secondary symptoms.
2. Ask ONE concise question at a time.
3. Keep responses brief (1-2 sentences).
4. Support English, Hindi, or Hinglish seamlessly.
5. If the patient's reply is vague, ask a natural follow-up.
6. Once complete, wrap up politely.
7. This is a screening tool only, not a diagnosis — if the patient describes symptoms that sound urgent or severe, advise them to seek immediate in-person medical care.
8. Respond with ONLY the message for the patient. Do NOT write any thinking process or use tags.
`;

function cleanResponseText(text) {
  if (typeof text !== "string") {
    text = text ? String(text) : "";
  }
  return text.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();
}

function extractTextFromFailedGeneration(failedGeneration) {
  if (!failedGeneration) return null;

  try {
    const parsed = typeof failedGeneration === "string" ? JSON.parse(failedGeneration) : failedGeneration;
    if (parsed?.message) return String(parsed.message);
    if (parsed?.arguments) return typeof parsed.arguments === "string" ? parsed.arguments : JSON.stringify(parsed.arguments);
  } catch (e) {}

  const match = String(failedGeneration).match(/"(?:arguments|message)":\s*"?([^"}\n\r]+)"?/s);
  if (match && match[1]) {
    return match[1].trim();
  }

  return String(failedGeneration).replace(/[{}\"]/g, "").trim() || null;
}

async function callGroq(model, messages) {
  return groq.chat.completions.create({
    model,
    messages,
    max_tokens: 150,
    temperature: 0.6,
  });
}

export async function getLLMResponse(conversationHistory) {
  const messages = [
    { role: "system", content: INTAKE_SYSTEM_PROMPT },
    ...conversationHistory,
  ];

  // Aapke environment me supported models
  const models = ["openai/gpt-oss-20b", "qwen/qwen3.6-27b"];

  for (let i = 0; i < models.length; i++) {
    try {
      const response = await callGroq(models[i], messages);
      const rawContent = response.choices[0]?.message?.content || "";
      return cleanResponseText(rawContent);
    } catch (error) {
      const failedGen =
        error?.error?.error?.failed_generation ||
        error?.error?.failed_generation ||
        error?.failed_generation;

      const code = error?.error?.error?.code || error?.code;

      if ((code === "tool_use_failed" || code === "output_parse_failed") && failedGen) {
        const recovered = extractTextFromFailedGeneration(failedGen);
        if (recovered) {
          console.warn(`LLM Service: recovered text after glitch (model: ${models[i]})`);
          return cleanResponseText(recovered);
        }
      }

      console.error(`LLM Service Error (model: ${models[i]}):`, error?.message || error);

      if (i === models.length - 1) throw error;
    }
  }
}