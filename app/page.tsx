"use client";

import React, { useState, useRef, useEffect } from "react";
import styles from "./page.module.css";

// Define a type for each conversation item
type ConversationItem = {
  type: "user" | "ai";
  text: string;
  language: string;
  timestamp: Date;
};

export default function Home() {
  // Conversation and voice-assistant states
  const [isRecording, setIsRecording] = useState(false);
  const [userText, setUserText] = useState("");
  const [language, setLanguage] = useState("");
  const [aiReply, setAiReply] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [darkMode, setDarkMode] = useState(false);
  const [recordingLevel, setRecordingLevel] = useState(0);
  const [conversationHistory, setConversationHistory] = useState<ConversationItem[]>([]);
  const [showSettings, setShowSettings] = useState(false);

  // Refs for audio handling
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animationFrameRef = useRef<number | null>(null);

  // On mount: restore theme only
  useEffect(() => {
    const savedTheme = localStorage.getItem("eternals-theme");
    if (savedTheme === "dark") {
      setDarkMode(true);
    }
  }, []);

  // Called when user clicks the mic button (requests permission & records)
  const handleMicClick = async () => {
    if (isRecording || isProcessing) return;

    try {
      // Always attempt to getUserMedia on click
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      beginRecordingWithStream(stream);
    } catch (err) {
      console.warn("Microphone access denied or unavailable:", err);
      alert(
        "🔴 Cannot access microphone. Please allow microphone access in your browser settings and try again."
      );
    }
  };

  // Actually start recording using the provided MediaStream
  const beginRecordingWithStream = async (stream: MediaStream) => {
    try {
      const mediaRecorder = new MediaRecorder(stream, { mimeType: "audio/webm" });
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event: BlobEvent) => {
        audioChunksRef.current.push(event.data);
      };

      mediaRecorder.onstop = async () => {
        setIsProcessing(true);
        const audioBlob = new Blob(audioChunksRef.current, { type: "audio/webm" });
        const formData = new FormData();
        formData.append("audio", audioBlob, "recording.webm");

        try {
          // 1) Whisper transcription call
          const whisperRes = await fetch("/api/whisper", {
            method: "POST",
            body: formData,
          });
          const whisperJson = await whisperRes.json();
          const text = whisperJson.text as string;
          const detectedLanguage = whisperJson.language as string;

          setUserText(text);
          setLanguage(detectedLanguage);

          // 2) GPT API call
          const gptRes = await fetch("/api/ask", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ userText: text, languageCode: detectedLanguage }),
          });
          const gptJson = await gptRes.json();
          const reply = gptJson.reply as string;

          setAiReply(reply);

          // 3) Add to conversation history
          setConversationHistory((prev) => [
            ...prev,
            { type: "user", text, language: detectedLanguage, timestamp: new Date() },
            { type: "ai", text: reply, language: detectedLanguage, timestamp: new Date() },
          ]);

          // 4) Speak the AI reply
          speakTextInChunks(reply, detectedLanguage);
        } catch (error) {
          console.error("Error processing audio:", error);
        } finally {
          setIsProcessing(false);
        }
      };

      // Start recording & set up the visualizer
      mediaRecorder.start();
      setIsRecording(true);

      audioContextRef.current = new AudioContext();
      const sourceNode = audioContextRef.current.createMediaStreamSource(stream);
      analyserRef.current = audioContextRef.current.createAnalyser();
      sourceNode.connect(analyserRef.current);
      analyserRef.current.fftSize = 256;
      animateVisualizer();

      // Automatically stop after 10 seconds
      setTimeout(() => {
        mediaRecorder.stop();
        setIsRecording(false);
        if (animationFrameRef.current !== null) {
          cancelAnimationFrame(animationFrameRef.current);
        }
        setRecordingLevel(0);
      }, 10000);
    } catch (error) {
      console.error("Error starting MediaRecorder:", error);
      alert("🔴 Failed to start recording. Please try again.");
      setIsRecording(false);
    }
  };

  // Visualizer: animate audio levels
  const animateVisualizer = () => {
    if (!analyserRef.current) return;
    const dataArray = new Uint8Array(analyserRef.current.frequencyBinCount);
    analyserRef.current.getByteFrequencyData(dataArray);
    const average = dataArray.reduce((acc, val) => acc + val, 0) / dataArray.length;
    setRecordingLevel(average / 128);

    if (isRecording) {
      const frameId = requestAnimationFrame(animateVisualizer);
      animationFrameRef.current = frameId;
    }
  };

  // Helper: split long text into chunks & speak sequentially
  const speakTextInChunks = (fullText: string, langCode: string) => {
    window.speechSynthesis.cancel(); // stop any ongoing speech

    let utterLang: string;
    if (langCode.startsWith("es")) utterLang = "es-ES";
    else if (langCode.startsWith("fr")) utterLang = "fr-FR";
    else if (langCode.startsWith("pt")) utterLang = "pt-PT";
    else if (langCode.startsWith("it")) utterLang = "it-IT";
    else if (langCode.startsWith("ru")) utterLang = "ru-RU";
    else if (langCode.startsWith("ja")) utterLang = "ja-JP";
    else utterLang = "en-US";

    const chunkSize = 150;
    const regex = new RegExp(`(.|\\s){1,${chunkSize}}(?=\\s|$)`, "g");
    const chunks = fullText.match(regex) || [fullText];

    const speakChunk = (index: number) => {
      if (index >= chunks.length) {
        setIsSpeaking(false);
        return;
      }
      setIsSpeaking(true);
      const utter = new SpeechSynthesisUtterance(chunks[index]);
      utter.lang = utterLang;
      utter.rate = 0.9;
      utter.pitch = 1.1;
      utter.onend = () => {
        speakChunk(index + 1);
      };
      window.speechSynthesis.speak(utter);
    };

    speakChunk(0);
  };

  const stopSpeaking = () => {
    window.speechSynthesis.cancel();
    setIsSpeaking(false);
  };

  const clearConversation = () => {
    setConversationHistory([]);
    setUserText("");
    setAiReply("");
  };

  // SVG Icons (all fixed, no stray backticks)
  const MicIcon = ({ className = "w-6 h-6" }: { className?: string }) => (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z"
      />
    </svg>
  );

  const MicOffIcon = ({ className = "w-6 h-6" }: { className?: string }) => (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M5.586 5.586l12.828 12.828M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z"
      />
    </svg>
  );

  const VolumeIcon = ({ className = "w-6 h-6" }: { className?: string }) => (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M15.536 8.464a5 5 0 010 7.072M18.364 5.636a9 9 0 010 12.728M12 6l-2 2H7a1 1 0 00-1 1v6a1 1 0 001 1h3l2 2V6z"
      />
    </svg>
  );

  const BrainIcon = ({ className = "w-6 h-6" }: { className?: string }) => (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"
      />
    </svg>
  );

  const SettingsIcon = ({ className = "w-6 h-6" }: { className?: string }) => (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
      />
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
      />
    </svg>
  );

  const SunIcon = ({ className = "w-6 h-6" }: { className?: string }) => (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z"
      />
    </svg>
  );

  const MoonIcon = ({ className = "w-6 h-6" }: { className?: string }) => (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z"
      />
    </svg>
  );

  const ZapIcon = ({ className = "w-6 h-6" }: { className?: string }) => (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M13 10V3L4 14h7v7l9-11h-7z"
      />
    </svg>
  );

  const GlobeIcon = ({ className = "w-6 h-6" }: { className?: string }) => (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9"
      />
    </svg>
  );

  const MessageIcon = ({ className = "w-6 h-6" }: { className?: string }) => (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
      />
    </svg>
  );

  return (
    <div className={darkMode ? styles.containerDark : styles.container}>
      {/* ==== Background Effects ==== */}
      <div className={styles.backgroundEffects}>
        <div className={`${styles.floatingOrb} ${styles.orb1}`} />
        <div className={`${styles.floatingOrb} ${styles.orb2}`} />
        <div className={`${styles.floatingOrb} ${styles.orb3}`} />
      </div>

      {/* ==== Header ==== */}
      <header className={styles.header}>
        <div className={styles.logo}>
          <div className={styles.logoIcon}>
            <ZapIcon className="w-5 h-5 text-white" />
          </div>
          <span className={styles.logoText}>Eternals AI</span>
        </div>

        <div className={styles.headerButtons}>
          <button
            onClick={() => setShowSettings(!showSettings)}
            className={styles.headerButton}
          >
            <SettingsIcon className="w-5 h-5" />
          </button>
          <button
            onClick={() => {
              setDarkMode(!darkMode);
              localStorage.setItem("eternals-theme", !darkMode ? "dark" : "light");
            }}
            className={styles.headerButton}
          >
            {darkMode ? <SunIcon className="w-5 h-5" /> : <MoonIcon className="w-5 h-5" />}
          </button>
        </div>
      </header>

      {/* ==== Main Content ==== */}
      <main className={styles.main}>
        {/* --- Hero Section --- */}
        <div className={styles.hero}>
          <h1 className={styles.title}>Eternals</h1>
          <p className={styles.subtitle}>Advanced AI Voice Assistant</p>
          <div className={styles.features}>
            <div className={styles.feature}>
              <GlobeIcon className="w-4 h-4" />
              <span>Multi-language Support</span>
            </div>
            <div className={styles.feature}>
              <BrainIcon className="w-4 h-4" />
              <span>Neural Processing</span>
            </div>
            <div className={styles.feature}>
              <MessageIcon className="w-4 h-4" />
              <span>Natural Conversation</span>
            </div>
          </div>
        </div>

        {/* --- Recording Interface (click mic to request & record) --- */}
        <div className={styles.recordingInterface}>
          {/* Audio Level Visualizer */}
          {isRecording && (
            <div className={styles.visualizer}>
              {[...Array(20)].map((_, i) => (
                <div
                  key={i}
                  className={styles.visualizerBar}
                  style={{
                    height: `${Math.max(
                      4,
                      recordingLevel * 40 + Math.sin(Date.now() * 0.01 + i) * 10
                    )}px`,
                    opacity: recordingLevel * 20 > i ? 1 : 0.3,
                  }}
                />
              ))}
            </div>
          )}

          {/* Mic Button: click to request permission & record */}
          <div>
            <button
              onClick={handleMicClick}
              disabled={isProcessing}
              className={`${styles.recordButton} ${
                isRecording
                  ? styles.recordButtonRecording
                  : isProcessing
                  ? styles.recordButtonProcessing
                  : styles.recordButtonNormal
              }`}
            >
              <div
                style={{
                  position: "absolute",
                  inset: 0,
                  borderRadius: "50%",
                  background: "linear-gradient(45deg, #8b5cf6, #06b6d4)",
                  opacity: 0.2,
                  animation: isRecording ? "pulse 2s ease-in-out infinite" : "none",
                }}
              />
              {isRecording ? (
                <MicOffIcon className="w-8 h-8 text-red-400" />
              ) : isProcessing ? (
                <BrainIcon className="w-8 h-8 text-yellow-400" />
              ) : (
                <MicIcon className="w-8 h-8 text-purple-400" />
              )}
            </button>
          </div>

          <p className={styles.statusText}>
            {isProcessing
              ? "🧠 Processing your request..."
              : isRecording
              ? "🎧 Listening... (10s max)"
              : "🎤 Tap the mic to speak"}
          </p>
        </div>

        {/* --- Conversation Display --- */}
        <div className={styles.conversationGrid}>
          {/* User Input Card */}
          {userText && (
            <div className={styles.conversationCard}>
              <div className={styles.cardHeader}>
                <div className={styles.cardHeaderLeft}>
                  <div className={`${styles.avatar} ${styles.userAvatar}`}>You</div>
                  <span style={{ fontSize: "0.875rem", opacity: 0.7 }}>
                    {language && `Detected: ${language}`}
                  </span>
                </div>
              </div>
              <p className={styles.cardText}>{userText}</p>
            </div>
          )}

          {/* AI Response Card */}
          {aiReply && (
            <div className={styles.conversationCard}>
              <div className={styles.cardHeader}>
                <div className={styles.cardHeaderLeft}>
                  <div className={`${styles.avatar} ${styles.aiAvatar}`}>
                    <ZapIcon className="w-4 h-4" />
                  </div>
                  <span style={{ fontSize: "0.875rem", opacity: 0.7 }}>Eternals AI</span>
                </div>
                {isSpeaking ? (
                  <button
                    onClick={stopSpeaking}
                    className={`${styles.actionButton} ${styles.stopButton}`}
                  >
                    <MicOffIcon className="w-4 h-4" />
                  </button>
                ) : (
                  <button
                    onClick={() => speakTextInChunks(aiReply, language)}
                    className={`${styles.actionButton} ${styles.speakButton}`}
                  >
                    <VolumeIcon className="w-4 h-4" />
                  </button>
                )}
              </div>
              <p className={styles.cardText}>{aiReply}</p>
            </div>
          )}
        </div>

        {/* --- Conversation History --- */}
        {conversationHistory.length > 0 && (
          <div className={styles.historySection}>
            <div className={styles.historyHeader}>
              <h3 className={styles.historyTitle}>Conversation History</h3>
              <button onClick={clearConversation} className={styles.clearButton}>
                Clear History
              </button>
            </div>
            <div className={styles.historyContainer}>
              {conversationHistory.map((item, index) => (
                <div
                  key={index}
                  className={styles.historyItem}
                  style={{ flexDirection: item.type === "ai" ? "row-reverse" : "row" }}
                >
                  <div
                    className={`${styles.historyBubble} ${
                      item.type === "user" ? styles.userBubble : styles.aiBubble
                    }`}
                  >
                    <p className={styles.historyText}>{item.text}</p>
                    <span className={styles.historyTime}>
                      {item.timestamp.toLocaleTimeString()}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* --- Settings Modal --- */}
        {showSettings && (
          <div
            className={styles.modal}
            onClick={(e: React.MouseEvent<HTMLDivElement>) => {
              if (e.currentTarget === e.target) setShowSettings(false);
            }}
          >
            <div
              className={darkMode ? styles.modalContentDark : styles.modalContent}
              onClick={(e: React.MouseEvent<HTMLDivElement>) => e.stopPropagation()}
            >
              <h3 className={darkMode ? styles.modalTitleDark : styles.modalTitle}>
                Settings
              </h3>
              <div className={styles.settingsGrid}>
                <div className={styles.settingItem}>
                  <span className={darkMode ? styles.settingLabelDark : styles.settingLabel}>
                    Dark Mode
                  </span>
                  <button
                    onClick={() => {
                      setDarkMode(!darkMode);
                      localStorage.setItem("eternals-theme", !darkMode ? "dark" : "light");
                    }}
                    style={{
                      padding: "0.25rem 0.75rem",
                      borderRadius: "6px",
                      background: darkMode
                        ? "rgba(139, 92, 246, 0.2)"
                        : "rgba(59, 130, 246, 0.2)",
                      color: darkMode ? "#a855f7" : "#3b82f6",
                      border: "none",
                      cursor: "pointer",
                      fontSize: "0.75rem",
                    }}
                  >
                    {darkMode ? "ON" : "OFF"}
                  </button>
                </div>
                <div className={styles.settingItem}>
                  <span className={styles.settingLabel}>Voice Feedback</span>
                  <button
                    style={{
                      padding: "0.25rem 0.75rem",
                      borderRadius: "6px",
                      background: "rgba(34, 197, 94, 0.2)",
                      color: "#22c55e",
                      border: "none",
                      cursor: "pointer",
                      fontSize: "0.75rem",
                    }}
                  >
                    ON
                  </button>
                </div>
                <div className={styles.settingItem}>
                  <span className={styles.settingLabel}>Recording Duration</span>
                  <span style={{ fontSize: "0.75rem", opacity: 0.7 }}>10 seconds</span>
                </div>
                <div className={styles.settingItem}>
                  <span className={styles.settingLabel}>Auto-Language Detection</span>
                  <button
                    style={{
                      padding: "0.25rem 0.75rem",
                      borderRadius: "6px",
                      background: "rgba(34, 197, 94, 0.2)",
                      color: "#22c55e",
                      border: "none",
                      cursor: "pointer",
                      fontSize: "0.75rem",
                    }}
                  >
                    ON
                  </button>
                </div>
              </div>
              <button onClick={() => setShowSettings(false)} className={styles.closeButton}>
                Close Settings
              </button>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
