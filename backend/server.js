import express from "express";
import http from "http";
import { WebSocketServer } from "ws";
import cors from "cors";
import dotenv from "dotenv";

import { transcribeAudio } from "./services/sttService.js";
import { getLLMResponse } from "./services/llmService.js";
import { generateHealthReport } from "./services/reportService.js";

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

const server = http.createServer(app);
const wss = new WebSocketServer({ server });

wss.on("connection", (ws) => {
  let conversationHistory = [];

  ws.on("message", async (message) => {
    try {
      const data = JSON.parse(message);

      // Call Shuru Hone Par Greeting
      if (data.type === "START_CALL") {
        conversationHistory = [];
        const greeting = "Hello! I am your AI health intake assistant. How can I help you today?";
        conversationHistory.push({ role: "assistant", content: greeting });

        ws.send(JSON.stringify({
          type: "AI_REPLY",
          text: greeting,
        }));
      }

      // Voice Turn Handle Karna
      if (data.type === "USER_AUDIO") {
        const userText = await transcribeAudio(data.audio);

        if (!userText || userText.trim().length === 0) {
          ws.send(JSON.stringify({
            type: "SILENCE_DETECTED",
            text: "I couldn't hear you clearly. Could you please repeat that?",
          }));
          return;
        }

        conversationHistory.push({ role: "user", content: userText });
        ws.send(JSON.stringify({ type: "USER_TRANSCRIPT", text: userText }));

        const aiReply = await getLLMResponse(conversationHistory);
        conversationHistory.push({ role: "assistant", content: aiReply });

        ws.send(JSON.stringify({
          type: "AI_REPLY",
          text: aiReply,
        }));
      }

      // Call Khatam Hone Par Report Generate Karna
      if (data.type === "END_CALL") {
        const report = await generateHealthReport(conversationHistory);
        ws.send(JSON.stringify({
          type: "HEALTH_REPORT",
          report,
          transcript: conversationHistory,
        }));
      }
    } catch (err) {
      console.error("Turn Execution Error:", err);
      ws.send(JSON.stringify({
        type: "ERROR",
        message: "An error occurred while processing the turn.",
      }));
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Backend server active on port ${PORT}`);
});