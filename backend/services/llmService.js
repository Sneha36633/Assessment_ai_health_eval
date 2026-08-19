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
`;

// Groq's gpt-oss models occasionally misclassify a normal text reply as a
// tool call attempt (a known "harmony format" parsing bug on their end).
// When that happens, the model's actual answer is still embedded in the
// error's failed_generation field — this pulls it back out.
function extractTextFromFailedGeneration(failedGeneration) {
  if (!failedGeneration) return null;
  const match = failedGeneration.match(/"arguments":\s*(.*)\}\s*$/s);
  if (!match) return null;
  let text = match[1].trim();
  // Strip a wrapping quote if the model happened to produce one
  if (text.startsWith('"') && text.endsWith('"')) {
    text = text.slice(1, -1);
  }
  return text.trim() || null;
}

async function callGroq(model, messages) {
  return groq.chat.completions.create({
    model,
    messages,
    max_tokens: 120,
    temperature: 0.6,
  });
}

export async function getLLMResponse(conversationHistory) {
  const messages = [
    { role: "system", content: INTAKE_SYSTEM_PROMPT },
    ...conversationHistory,
  ];

  const models = ["openai/gpt-oss-20b", "qwen/qwen3.6-27b"];

  for (let i = 0; i < models.length; i++) {
    try {
      const response = await callGroq(models[i], messages);
      return response.choices[0].message.content;
    } catch (error) {
      const failedGeneration = error?.error?.error?.failed_generation;
      const code = error?.error?.error?.code;

      if (code === "tool_use_failed" && failedGeneration) {
        const recovered = extractTextFromFailedGeneration(failedGeneration);
        if (recovered) {
          console.warn(`LLM Service: recovered text after tool_use_failed glitch (model: ${models[i]})`);
          return recovered;
        }
      }

      console.error(`LLM Service Error (model: ${models[i]}):`, error?.message || error);

      // Last model in the list — nothing left to fall back to
      if (i === models.length - 1) throw error;
      // Otherwise fall through to try the next model
    }
  }
}