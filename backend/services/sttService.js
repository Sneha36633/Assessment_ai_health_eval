import Groq, { toFile } from "groq-sdk";
import dotenv from "dotenv";

dotenv.config();

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

export async function transcribeAudio(base64Audio) {
  try {
    if (!base64Audio) return "";

    // Base64 string se Buffer convert karna (data URI header agar ho to strip karein)
    const base64Data = base64Audio.replace(/^data:audio\/\w+;base64,/, "");
    const audioBuffer = Buffer.from(base64Data, "base64");

    // Groq SDK ki built-in toFile helper method
    const audioFile = await toFile(audioBuffer, "audio.webm", {
      type: "audio/webm",
    });

    const transcription = await groq.audio.transcriptions.create({
      file: audioFile,
      model: "whisper-large-v3",
      prompt: "This is a medical intake screening in English, Hindi, and Hinglish. Always transcribe in English or Roman script using the Latin alphabet. Never use Urdu, Arabic, or Perso-Arabic characters.",
      temperature: 0.0,
    });

    return transcription.text?.trim() || "";
  } catch (error) {
    console.error("STT Service Error:", error?.message || error);
    throw error;
  }
}