import Groq from "groq-sdk";
import dotenv from "dotenv";

dotenv.config();

export async function transcribeAudio(base64Audio) {
  try {
    const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
    const audioBuffer = Buffer.from(base64Audio, "base64");
    const file = new File([audioBuffer], "audio.webm", { type: "audio/webm" });

    const transcription = await groq.audio.transcriptions.create({
      file: file,
      model: "whisper-large-v3",
      // Roman script prompt forces Whisper to NEVER use Urdu/Arabic script:
      prompt: "This is a medical intake screening in English, Hindi, and Hinglish. Always transcribe in English or Roman script using the Latin alphabet. Never use Urdu, Arabic, or Perso-Arabic characters.",
      temperature: 0.0,
    });

    return transcription.text?.trim() || "";
  } catch (error) {
    console.error("STT Service Error:", error);
    throw error;
  }
}