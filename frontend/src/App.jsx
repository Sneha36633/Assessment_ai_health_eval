import React, { useState, useEffect, useRef } from "react";
import {
  Mic,
  PhoneOff,
  PhoneCall,
  Activity,
  CheckCircle2,
  AlertTriangle,
  User,
  Clock,
  Sparkles,
  Stethoscope,
  Radio,
  ClipboardList,
} from "lucide-react";

export default function App() {
  const [callActive, setCallActive] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [aiSpeaking, setAiSpeaking] = useState(false);
  const [status, setStatus] = useState("Standby");
  const [transcript, setTranscript] = useState([]);
  const [report, setReport] = useState(null);

  const socketRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const streamRef = useRef(null);
  const isRecordingRef = useRef(false);
  const transcriptEndRef = useRef(null);

  useEffect(() => {
    transcriptEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [transcript]);

  // Robust, Non-Blocking Speech Synthesis
  const speakText = (text) => {
    if (!text || text.trim().length === 0) return;

    if ("speechSynthesis" in window) {
      window.speechSynthesis.cancel();

      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = "en-US";
      utterance.rate = 1.05;
      utterance.pitch = 1.0;

      window.activeUtterance = utterance;

      utterance.onstart = () => {
        setAiSpeaking(true);
        setStatus("AI Intake Agent is Speaking...");
      };

      utterance.onend = () => {
        setAiSpeaking(false);
        setStatus("Your Turn: Tap or Hold to Speak");
        window.activeUtterance = null;
      };

      utterance.onerror = () => {
        setAiSpeaking(false);
        setStatus("Ready for Voice Input");
        window.activeUtterance = null;
      };

      if (window.speechSynthesis.paused) {
        window.speechSynthesis.resume();
      }

      window.speechSynthesis.speak(utterance);
    }
  };

  const connectWebSocket = () => {
    socketRef.current = new WebSocket("ws://localhost:3000");

    socketRef.current.onopen = () => setStatus("Connected & System Ready");
    socketRef.current.onerror = () => setStatus("Connection Error");

    socketRef.current.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);

        if (data.type === "AI_REPLY") {
          setTranscript((prev) => [...prev, { role: "assistant", text: data.text }]);
          speakText(data.text);
        }

        if (data.type === "USER_TRANSCRIPT") {
          setTranscript((prev) => [...prev, { role: "user", text: data.text }]);
        }

        if (data.type === "SILENCE_DETECTED") {
          setStatus(data.text);
          speakText(data.text);
        }

        if (data.type === "HEALTH_REPORT") {
          setReport(data.report);
          setAiSpeaking(false);
          setStatus("Intake Session Concluded");
        }

        if (data.type === "ERROR") {
          setStatus(data.message);
        }
      } catch (err) {
        console.error("Message parsing error:", err);
      }
    };
  };

  useEffect(() => {
    connectWebSocket();

    // Global listener so releasing mouse anywhere stops recording instantly
    const handleGlobalRelease = () => {
      if (isRecordingRef.current) {
        stopRecording();
      }
    };

    window.addEventListener("mouseup", handleGlobalRelease);
    window.addEventListener("touchend", handleGlobalRelease);

    return () => {
      window.removeEventListener("mouseup", handleGlobalRelease);
      window.removeEventListener("touchend", handleGlobalRelease);
      socketRef.current?.close();
      cleanupMedia();
    };
  }, []);

  const cleanupMedia = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
  };

  const handleStartCall = () => {
    if (socketRef.current?.readyState !== WebSocket.OPEN) {
      connectWebSocket();
    }
    setTranscript([]);
    setReport(null);
    setCallActive(true);
    setStatus("Connecting Screening Call...");
    socketRef.current.send(JSON.stringify({ type: "START_CALL" }));
  };

  const handleEndCall = () => {
    window.speechSynthesis.cancel();
    stopRecording();
    setAiSpeaking(false);
    setCallActive(false);
    setStatus("Synthesizing Medical Intake Summary...");
    socketRef.current.send(JSON.stringify({ type: "END_CALL" }));
  };

  // Instant Start Recording
  const startRecording = async (e) => {
    if (e) e.preventDefault();
    if (isRecordingRef.current) return;

    window.speechSynthesis.cancel();
    setAiSpeaking(false);

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      let mimeType = "audio/webm";
      if (!MediaRecorder.isTypeSupported("audio/webm")) {
        mimeType = MediaRecorder.isTypeSupported("audio/mp4") ? "audio/mp4" : "";
      }

      const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
      mediaRecorderRef.current = recorder;
      audioChunksRef.current = [];

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      recorder.onstop = () => {
        if (audioChunksRef.current.length === 0) return;

        const audioBlob = new Blob(audioChunksRef.current, {
          type: recorder.mimeType || "audio/webm",
        });

        const reader = new FileReader();
        reader.readAsDataURL(audioBlob);
        reader.onloadend = () => {
          const base64Data = reader.result.split(",")[1];
          if (socketRef.current?.readyState === WebSocket.OPEN) {
            socketRef.current.send(
              JSON.stringify({
                type: "USER_AUDIO",
                audio: base64Data,
              })
            );
            setStatus("Transcribing & Analyzing...");
          }
        };
        cleanupMedia();
      };

      // 200ms slice ensures audio is buffered smoothly
      recorder.start(200);
      isRecordingRef.current = true;
      setIsRecording(true);
      setStatus("Recording your voice... (Release to send)");
    } catch (err) {
      console.error("Mic error:", err);
      setStatus("Microphone permission denied");
    }
  };

  // Instant Stop Recording
  const stopRecording = (e) => {
    if (e) e.preventDefault();
    if (mediaRecorderRef.current && isRecordingRef.current) {
      isRecordingRef.current = false;
      setIsRecording(false);
      if (mediaRecorderRef.current.state !== "inactive") {
        mediaRecorderRef.current.stop();
      }
    }
  };

  return (
    <div className="min-h-screen bg-[#06080F] text-slate-100 flex flex-col items-center p-4 md:p-8 relative overflow-x-hidden selection:bg-teal-500 selection:text-white">
      {/* Background Glow */}
      <div className="fixed -top-40 left-1/2 -translate-x-1/2 w-[750px] h-[350px] bg-gradient-to-r from-teal-500/15 via-indigo-500/15 to-sky-500/15 blur-[140px] rounded-full pointer-events-none -z-10" />

      {/* Header */}
      <header className="w-full max-w-6xl flex flex-wrap items-center justify-between gap-4 pb-6 border-b border-slate-800/80">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-teal-500/10 border border-teal-500/30 rounded-2xl shadow-inner shadow-teal-500/20">
            <Stethoscope className="text-teal-400 w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2.5">
              <h1 className="text-lg md:text-xl font-bold tracking-tight bg-gradient-to-r from-white via-slate-100 to-slate-400 bg-clip-text text-transparent">
                Clinical Health Intake AI
              </h1>
              <span className="text-[10px] font-mono uppercase tracking-widest px-2 py-0.5 rounded-full bg-teal-500/10 text-teal-400 border border-teal-500/20">
                Voice Agent
              </span>
            </div>
            <p className="text-xs text-slate-400">Autonomous Patient Screening & Doctor Synthesis</p>
          </div>
        </div>

        <div className="flex items-center gap-2.5 bg-slate-900/90 border border-slate-800 px-4 py-2 rounded-full text-xs font-mono backdrop-blur-md">
          <span
            className={`w-2.5 h-2.5 rounded-full transition-all duration-300 ${
              aiSpeaking
                ? "bg-teal-400 shadow-lg shadow-teal-400 animate-ping"
                : isRecording
                ? "bg-rose-500 shadow-lg shadow-rose-500 animate-pulse"
                : callActive
                ? "bg-emerald-400 shadow-md shadow-emerald-400"
                : "bg-slate-600"
            }`}
          />
          <span className="text-slate-300 font-medium">{status}</span>
        </div>
      </header>

      {/* Center Visualizer & Fast Button */}
      <div className="w-full max-w-6xl my-6 p-8 bg-slate-900/40 border border-slate-800/70 rounded-3xl backdrop-blur-xl shadow-2xl flex flex-col items-center justify-center relative overflow-hidden">
        <div className="relative flex items-center justify-center my-2">
          <div
            className={`w-24 h-24 rounded-full flex items-center justify-center transition-all duration-300 border ${
              aiSpeaking
                ? "bg-gradient-to-tr from-teal-500/30 to-sky-500/30 border-teal-400/60 shadow-lg shadow-teal-500/30 animate-pulse"
                : isRecording
                ? "bg-gradient-to-tr from-rose-500/30 to-amber-500/30 border-rose-500/60 shadow-lg shadow-rose-500/30 scale-105"
                : callActive
                ? "bg-slate-800/60 border-slate-700"
                : "bg-slate-900/40 border-slate-800 opacity-60"
            }`}
          >
            {aiSpeaking ? (
              <Radio className="w-9 h-9 text-teal-300 animate-pulse" />
            ) : isRecording ? (
              <Mic className="w-9 h-9 text-rose-400 animate-bounce" />
            ) : (
              <Activity className="w-9 h-9 text-slate-500" />
            )}
          </div>
        </div>

        {/* Dynamic Waveform */}
        <div className="h-8 flex items-center justify-center gap-1.5 my-3">
          {[...Array(16)].map((_, i) => (
            <div
              key={i}
              className={`w-1 rounded-full transition-all duration-100 ${
                aiSpeaking
                  ? "bg-gradient-to-t from-teal-500 to-sky-300"
                  : isRecording
                  ? "bg-gradient-to-t from-rose-500 to-amber-400"
                  : "bg-slate-800 h-1.5"
              }`}
              style={{
                height: aiSpeaking
                  ? `${Math.max(6, Math.sin(i * 0.8 + Date.now() / 150) * 26 + 10)}px`
                  : isRecording
                  ? `${Math.max(6, Math.cos(i * 0.6) * 24 + 10)}px`
                  : "4px",
              }}
            />
          ))}
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-4 mt-2">
          {!callActive ? (
            <button
              onClick={handleStartCall}
              className="group flex items-center gap-3 bg-gradient-to-r from-teal-600 via-teal-500 to-emerald-600 hover:from-teal-500 hover:to-emerald-500 text-white px-8 py-3.5 rounded-2xl font-semibold shadow-xl shadow-teal-950/60 transition-all duration-200 active:scale-95 cursor-pointer border border-teal-400/30"
            >
              <PhoneCall className="w-5 h-5 transition-transform group-hover:rotate-12" />
              <span>Start Voice Screening</span>
            </button>
          ) : (
            <div className="flex items-center gap-4">
              {/* Ultra-Responsive Hold Button */}
              <button
                onMouseDown={startRecording}
                onTouchStart={startRecording}
                className={`flex items-center gap-3 px-8 py-3.5 rounded-2xl font-semibold select-none transition-all duration-150 active:scale-95 cursor-pointer border ${
                  isRecording
                    ? "bg-rose-600 text-white shadow-xl shadow-rose-950 border-rose-400/40 ring-4 ring-rose-500/20"
                    : "bg-slate-800/90 hover:bg-slate-700 text-slate-100 border-slate-700 shadow-lg active:bg-slate-700"
                }`}
              >
                <Mic className={`w-5 h-5 ${isRecording ? "animate-bounce text-white" : "text-teal-400"}`} />
                <span>{isRecording ? "Listening... (Release anywhere)" : "Hold to Talk"}</span>
              </button>

              <button
                onClick={handleEndCall}
                className="flex items-center gap-2 bg-rose-950/30 hover:bg-rose-600 border border-rose-800/50 hover:border-rose-500 text-rose-300 hover:text-white px-6 py-3.5 rounded-2xl font-semibold transition-all duration-200 active:scale-95 cursor-pointer shadow-lg"
              >
                <PhoneOff className="w-5 h-5" />
                <span>End Call</span>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Main Workspace Split Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 w-full max-w-6xl flex-1">
        {/* Left: Dialogue Transcript */}
        <div className="lg:col-span-5 bg-slate-900/40 border border-slate-800/80 rounded-3xl p-5 flex flex-col h-[520px] backdrop-blur-md shadow-xl">
          <div className="flex items-center justify-between pb-3 border-b border-slate-800/70 mb-3">
            <h2 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-2">
              <Activity className="w-4 h-4 text-teal-400" /> Live Intake Transcript
            </h2>
            <span className="text-[11px] text-slate-500 font-mono">{transcript.length} turns</span>
          </div>

          <div className="flex-1 overflow-y-auto space-y-3 pr-2 scrollbar-thin">
            {transcript.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-slate-600 text-sm gap-2">
                <Sparkles className="w-6 h-6 text-slate-700" />
                <p>Click "Start Voice Screening" to begin dialogue.</p>
              </div>
            ) : (
              transcript.map((msg, idx) => (
                <div
                  key={idx}
                  className={`p-3.5 rounded-2xl text-sm leading-relaxed transition-all ${
                    msg.role === "assistant"
                      ? "bg-slate-800/70 border border-slate-700/50 text-slate-200 ml-2 rounded-tl-sm"
                      : "bg-teal-950/40 border border-teal-800/40 text-teal-100 mr-2 ml-6 text-right rounded-tr-sm"
                  }`}
                >
                  <p
                    className={`text-[10px] font-bold uppercase tracking-wider mb-1 ${
                      msg.role === "assistant" ? "text-teal-400" : "text-slate-400"
                    }`}
                  >
                    {msg.role === "assistant" ? "AI Intake Agent" : "Patient"}
                  </p>
                  {msg.text}
                </div>
              ))
            )}
            <div ref={transcriptEndRef} />
          </div>
        </div>

        {/* Right: Structured Clinical Doctor Report */}
        <div className="lg:col-span-7 bg-slate-900/40 border border-slate-800/80 rounded-3xl p-5 flex flex-col h-[520px] backdrop-blur-md shadow-xl">
          <div className="flex items-center justify-between pb-3 border-b border-slate-800/70 mb-3">
            <h2 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-2">
              <ClipboardList className="w-4 h-4 text-teal-400" /> Clinical Intake Synthesis
            </h2>
            {report && (
              <span className="flex items-center gap-1 text-[11px] text-teal-400 bg-teal-500/10 px-2.5 py-0.5 rounded-full border border-teal-500/20 font-medium">
                <CheckCircle2 className="w-3.5 h-3.5" /> Structured Record
              </span>
            )}
          </div>

          <div className="flex-1 overflow-y-auto pr-2">
            {report ? (
              <div className="space-y-4">
                <div className="grid grid-cols-3 gap-2.5">
                  <div className="bg-slate-800/40 border border-slate-700/40 p-3 rounded-2xl">
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 flex items-center gap-1.5 mb-1">
                      <User className="w-3 h-3 text-slate-400" /> Patient
                    </span>
                    <span className="font-semibold text-sm text-slate-100">{report.patientName || "Not reported"}</span>
                  </div>

                  <div className="bg-slate-800/40 border border-slate-700/40 p-3 rounded-2xl">
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 flex items-center gap-1.5 mb-1">
                      <Clock className="w-3 h-3 text-slate-400" /> Duration
                    </span>
                    <span className="font-semibold text-sm text-slate-100">{report.duration || "Not specified"}</span>
                  </div>

                  <div className="bg-slate-800/40 border border-slate-700/40 p-3 rounded-2xl">
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 flex items-center gap-1.5 mb-1">
                      <Activity className="w-3 h-3 text-amber-400" /> Severity
                    </span>
                    <span className="font-semibold text-sm text-amber-300">{report.severity || "Not reported"}</span>
                  </div>
                </div>

                <div className="bg-slate-800/30 border border-slate-700/40 p-3.5 rounded-2xl">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-1">
                    Primary Concern / Chief Complaint
                  </span>
                  <p className="text-sm font-medium text-slate-200">{report.primaryConcern || "Not reported"}</p>
                </div>

                <div>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-1.5">
                    Associated Symptoms
                  </span>
                  <div className="flex flex-wrap gap-1.5">
                    {report.associatedSymptoms && report.associatedSymptoms.length > 0 ? (
                      report.associatedSymptoms.map((symptom, i) => (
                        <span
                          key={i}
                          className="text-xs bg-teal-500/10 text-teal-300 border border-teal-500/30 px-3 py-1 rounded-xl font-medium"
                        >
                          {symptom}
                        </span>
                      ))
                    ) : (
                      <span className="text-xs text-slate-500">None reported</span>
                    )}
                  </div>
                </div>

                {report.clinicalFollowUpFlags && report.clinicalFollowUpFlags.length > 0 && (
                  <div className="bg-rose-950/20 border border-rose-800/40 p-3.5 rounded-2xl">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-rose-400 flex items-center gap-1.5 mb-1.5">
                      <AlertTriangle className="w-4 h-4 text-rose-400" /> Clinical Attention Required
                    </span>
                    <ul className="space-y-1">
                      {report.clinicalFollowUpFlags.map((flag, idx) => (
                        <li key={idx} className="text-xs text-rose-200/90 flex items-start gap-2">
                          <span className="w-1.5 h-1.5 rounded-full bg-rose-400 mt-1.5 shrink-0" />
                          <span>{flag}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                <div className="bg-slate-800/30 border border-slate-700/40 p-3.5 rounded-2xl">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-1">
                    Physician Summary Notes
                  </span>
                  <p className="text-xs leading-relaxed text-slate-300">{report.summaryNotes}</p>
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center h-full text-slate-600 text-sm gap-2">
                <ClipboardList className="w-8 h-8 opacity-30 text-slate-400" />
                <p>End the screening call to synthesize structured doctor notes.</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}