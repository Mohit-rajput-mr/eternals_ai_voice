"use client";

import { useState, useRef, useEffect } from "react";

export default function Home() {
  const [isRecording, setIsRecording] = useState(false);
  const [userText, setUserText] = useState("");
  const [language, setLanguage] = useState("");
  const [aiReply, setAiReply] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [darkMode, setDarkMode] = useState(false);
  const [recordingLevel, setRecordingLevel] = useState(0);
  const [conversationHistory, setConversationHistory] = useState([]);
  const [showSettings, setShowSettings] = useState(false);
  
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animationFrameRef = useRef<number>();

  useEffect(() => {
    // Check for saved theme preference
    const savedTheme = localStorage.getItem('eternals-theme');
    if (savedTheme === 'dark') {
      setDarkMode(true);
    }
  }, []);

  const toggleTheme = () => {
    setDarkMode(!darkMode);
    localStorage.setItem('eternals-theme', !darkMode ? 'dark' : 'light');
  };

  const analyzeAudio = () => {
    if (!analyserRef.current) return;
    
    const dataArray = new Uint8Array(analyserRef.current.frequencyBinCount);
    analyserRef.current.getByteFrequencyData(dataArray);
    
    const average = dataArray.reduce((acc, val) => acc + val, 0) / dataArray.length;
    setRecordingLevel(average / 128);
    
    if (isRecording) {
      animationFrameRef.current = requestAnimationFrame(analyzeAudio);
    }
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      
      // Setup audio analysis
      audioContextRef.current = new AudioContext();
      const source = audioContextRef.current.createMediaStreamSource(stream);
      analyserRef.current = audioContextRef.current.createAnalyser();
      source.connect(analyserRef.current);
      analyserRef.current.fftSize = 256;
      
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        audioChunksRef.current.push(event.data);
      };

      mediaRecorder.onstop = async () => {
        setIsProcessing(true);
        const audioBlob = new Blob(audioChunksRef.current, { type: "audio/mp3" });
        const formData = new FormData();
        formData.append("audio", audioBlob);

        try {
          // Whisper API call
          const whisperRes = await fetch("/api/whisper", {
            method: "POST",
            body: formData,
          });

          const { text, language } = await whisperRes.json();
          setUserText(text);
          setLanguage(language);

          // GPT API call
          const gptRes = await fetch("/api/ask", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ userText: text, languageCode: language }),
          });

          const data = await gptRes.json();
          setAiReply(data.reply);
          
          // Add to conversation history
          setConversationHistory(prev => [...prev, 
            { type: 'user', text, language, timestamp: new Date() },
            { type: 'ai', text: data.reply, timestamp: new Date() }
          ]);
          
          speakResponse(data.reply, language);
        } catch (error) {
          console.error("Error processing audio:", error);
        } finally {
          setIsProcessing(false);
        }
      };

      mediaRecorder.start();
      setIsRecording(true);
      analyzeAudio();

      setTimeout(() => {
        mediaRecorder.stop();
        setIsRecording(false);
        if (animationFrameRef.current) {
          cancelAnimationFrame(animationFrameRef.current);
        }
        setRecordingLevel(0);
      }, 10000);
    } catch (error) {
      console.error("Error accessing microphone:", error);
    }
  };

  const speakResponse = (text: string, lang: string) => {
    setIsSpeaking(true);
    const utter = new SpeechSynthesisUtterance(text);
    utter.lang = lang || "en-US";
    utter.rate = 0.9;
    utter.pitch = 1.1;
    
    utter.onend = () => setIsSpeaking(false);
    utter.onerror = () => setIsSpeaking(false);
    
    window.speechSynthesis.speak(utter);
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

  // Icons as SVG components
  const MicIcon = ({ className = "w-6 h-6" }) => (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
    </svg>
  );

  const MicOffIcon = ({ className = "w-6 h-6" }) => (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5.586 5.586l12.828 12.828M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
    </svg>
  );

  const VolumeIcon = ({ className = "w-6 h-6" }) => (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.536 8.464a5 5 0 010 7.072M18.364 5.636a9 9 0 010 12.728M12 6l-2 2H7a1 1 0 00-1 1v6a1 1 0 001 1h3l2 2V6z" />
    </svg>
  );

  const BrainIcon = ({ className = "w-6 h-6" }) => (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
    </svg>
  );

  const SettingsIcon = ({ className = "w-6 h-6" }) => (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  );

  const SunIcon = ({ className = "w-6 h-6" }) => (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
    </svg>
  );

  const MoonIcon = ({ className = "w-6 h-6" }) => (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
    </svg>
  );

  const ZapIcon = ({ className = "w-6 h-6" }) => (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
    </svg>
  );

  const GlobeIcon = ({ className = "w-6 h-6" }) => (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9" />
    </svg>
  );

  const MessageIcon = ({ className = "w-6 h-6" }) => (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
    </svg>
  );

  const styles = {
    container: {
      minHeight: '100vh',
      background: darkMode 
        ? 'linear-gradient(135deg, #0f0f23 0%, #1a1a2e 50%, #16213e 100%)' 
        : 'linear-gradient(135deg,rgb(37, 50, 109) 0%,rgb(70, 10, 129) 100%)',
      color: darkMode ? '#ffffff' : '#ffffff',
      fontFamily: '"Segoe UI", system-ui, -apple-system, sans-serif',
      position: 'relative' as const,
      overflow: 'hidden',
    },
    backgroundEffects: {
      position: 'fixed' as const,
      inset: 0,
      overflow: 'hidden',
      pointerEvents: 'none' as const,
      zIndex: 0,
    },
    floatingOrb: {
      position: 'absolute' as const,
      borderRadius: '50%',
      filter: 'blur(60px)',
      opacity: 0.3,
      animation: 'float 20s ease-in-out infinite',
    },
    orb1: {
      top: '10%',
      right: '10%',
      width: '300px',
      height: '300px',
      background: 'radial-gradient(circle, rgba(139, 92, 246, 0.3), rgba(59, 130, 246, 0.3))',
      animationDelay: '0s',
    },
    orb2: {
      bottom: '10%',
      left: '10%',
      width: '400px',
      height: '400px',
      background: 'radial-gradient(circle, rgba(236, 72, 153, 0.3), rgba(167, 243, 208, 0.3))',
      animationDelay: '10s',
    },
    orb3: {
      top: '50%',
      left: '50%',
      transform: 'translate(-50%, -50%)',
      width: '250px',
      height: '250px',
      background: 'radial-gradient(circle, rgba(34, 197, 94, 0.2), rgba(59, 130, 246, 0.2))',
      animationDelay: '5s',
    },
    header: {
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      padding: '1.5rem',
      position: 'relative' as const,
      zIndex: 10,
    },
    logo: {
      display: 'flex',
      alignItems: 'center',
      gap: '0.75rem',
    },
    logoIcon: {
      width: '32px',
      height: '32px',
      borderRadius: '8px',
      background: 'linear-gradient(45deg, #8b5cf6, #06b6d4)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
    },
    logoText: {
      fontSize: '0.875rem',
      fontWeight: '500',
      opacity: 0.8,
    },
    headerButtons: {
      display: 'flex',
      alignItems: 'center',
      gap: '1rem',
    },
    headerButton: {
      padding: '0.5rem',
      borderRadius: '8px',
      background: 'rgba(255, 255, 255, 0.1)',
      border: 'none',
      color: 'inherit',
      cursor: 'pointer',
      transition: 'all 0.2s ease',
      backdropFilter: 'blur(10px)',
    },
    main: {
      maxWidth: '1024px',
      margin: '0 auto',
      padding: '0 1.5rem 2rem',
      position: 'relative' as const,
      zIndex: 10,
    },
    hero: {
      textAlign: 'center' as const,
      marginBottom: '3rem',
    },
    title: {
      fontSize: '4rem',
      fontWeight: 'bold',
      marginBottom: '1rem',
      background: 'linear-gradient(45deg, #8b5cf6, #06b6d4, #10b981)',
      backgroundClip: 'text',
      WebkitBackgroundClip: 'text',
      color: 'transparent',
      textShadow: '0 0 30px rgba(139, 92, 246, 0.3)',
    },
    subtitle: {
      fontSize: '1.25rem',
      opacity: 0.9,
      marginBottom: '1rem',
    },
    features: {
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
      gap: '2rem',
      fontSize: '0.875rem',
      opacity: 0.7,
      flexWrap: 'wrap' as const,
    },
    feature: {
      display: 'flex',
      alignItems: 'center',
      gap: '0.5rem',
    },
    recordingInterface: {
      display: 'flex',
      flexDirection: 'column' as const,
      alignItems: 'center',
      marginBottom: '2rem',
    },
    visualizer: {
      display: 'flex',
      alignItems: 'center',
      gap: '2px',
      marginBottom: '1.5rem',
      height: '60px',
    },
    visualizerBar: {
      width: '3px',
      background: 'linear-gradient(to top, #8b5cf6, #06b6d4)',
      borderRadius: '2px',
      transition: 'all 0.1s ease',
    },
    recordButton: {
      position: 'relative' as const,
      width: '120px',
      height: '120px',
      borderRadius: '50%',
      border: '4px solid',
      background: 'rgba(255, 255, 255, 0.05)',
      backdropFilter: 'blur(20px)',
      cursor: 'pointer',
      transition: 'all 0.3s ease',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      boxShadow: '0 20px 40px rgba(0, 0, 0, 0.1)',
    },
    recordButtonRecording: {
      borderColor: '#ef4444',
      background: 'rgba(239, 68, 68, 0.1)',
      transform: 'scale(1.1)',
      boxShadow: '0 0 30px rgba(239, 68, 68, 0.3)',
    },
    recordButtonProcessing: {
      borderColor: '#f59e0b',
      background: 'rgba(245, 158, 11, 0.1)',
      animation: 'spin 2s linear infinite',
    },
    recordButtonNormal: {
      borderColor: '#8b5cf6',
      background: 'rgba(139, 92, 246, 0.1)',
    },
    statusText: {
      marginTop: '1rem',
      fontSize: '0.875rem',
      opacity: 0.8,
      textAlign: 'center' as const,
    },
    conversationGrid: {
      display: 'grid',
      gap: '1.5rem',
      gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
      marginBottom: '2rem',
    },
    conversationCard: {
      background: 'rgba(255, 255, 255, 0.08)',
      backdropFilter: 'blur(20px)',
      borderRadius: '16px',
      padding: '1.5rem',
      border: '1px solid rgba(255, 255, 255, 0.1)',
      boxShadow: '0 8px 32px rgba(0, 0, 0, 0.1)',
    },
    cardHeader: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: '0.75rem',
    },
    cardHeaderLeft: {
      display: 'flex',
      alignItems: 'center',
      gap: '0.75rem',
    },
    avatar: {
      width: '32px',
      height: '32px',
      borderRadius: '50%',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontSize: '0.875rem',
      fontWeight: 'bold',
      color: 'white',
    },
    userAvatar: {
      background: 'linear-gradient(45deg, #10b981, #3b82f6)',
    },
    aiAvatar: {
      background: 'linear-gradient(45deg, #8b5cf6, #ec4899)',
    },
    cardText: {
      fontSize: '1.125rem',
      lineHeight: '1.6',
      margin: 0,
    },
    actionButton: {
      padding: '0.5rem',
      borderRadius: '8px',
      border: 'none',
      cursor: 'pointer',
      transition: 'all 0.2s ease',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
    },
    speakButton: {
      background: 'rgba(59, 130, 246, 0.2)',
      color: '#3b82f6',
    },
    stopButton: {
      background: 'rgba(239, 68, 68, 0.2)',
      color: '#ef4444',
    },
    historySection: {
      marginTop: '2rem',
    },
    historyHeader: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: '1rem',
    },
    historyTitle: {
      fontSize: '1.125rem',
      fontWeight: '600',
      margin: 0,
    },
    clearButton: {
      fontSize: '0.875rem',
      padding: '0.5rem 1rem',
      borderRadius: '8px',
      background: 'rgba(239, 68, 68, 0.2)',
      color: '#ef4444',
      border: 'none',
      cursor: 'pointer',
      transition: 'all 0.2s ease',
    },
    historyContainer: {
      background: 'rgba(255, 255, 255, 0.05)',
      backdropFilter: 'blur(20px)',
      borderRadius: '16px',
      padding: '1rem',
      border: '1px solid rgba(255, 255, 255, 0.1)',
      maxHeight: '320px',
      overflowY: 'auto' as const,
    },
    historyItem: {
      display: 'flex',
      alignItems: 'flex-start',
      gap: '0.75rem',
      marginBottom: '0.75rem',
    },
    historyBubble: {
      maxWidth: '240px',
      padding: '0.75rem',
      borderRadius: '12px',
    },
    userBubble: {
      background: 'rgba(59, 130, 246, 0.2)',
      marginLeft: 'auto',
    },
    aiBubble: {
      background: 'rgba(139, 92, 246, 0.2)',
    },
    historyText: {
      fontSize: '0.875rem',
      margin: '0 0 0.25rem 0',
    },
    historyTime: {
      fontSize: '0.75rem',
      opacity: 0.6,
    },
    modal: {
      position: 'fixed' as const,
      inset: 0,
      background: 'rgba(0, 0, 0, 0.5)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 50,
      backdropFilter: 'blur(4px)',
    },
    modalContent: {
      background: darkMode ? 'rgba(31, 41, 55, 0.95)' : 'rgba(255, 255, 255, 0.95)',
      backdropFilter: 'blur(20px)',
      borderRadius: '16px',
      padding: '1.5rem',
      maxWidth: '400px',
      width: '90%',
      margin: '1rem',
      boxShadow: '0 20px 40px rgba(0, 0, 0, 0.2)',
      border: '1px solid rgba(255, 255, 255, 0.1)',
    },
    modalTitle: {
      fontSize: '1.25rem',
      fontWeight: 'bold',
      marginBottom: '1rem',
      color: darkMode ? '#ffffff' : '#1f2937',
    },
    settingsGrid: {
      display: 'grid',
      gap: '1rem',
    },
    settingItem: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '0.75rem',
      borderRadius: '8px',
      background: 'rgba(255, 255, 255, 0.05)',
    },
    settingLabel: {
      fontSize: '0.875rem',
      color: darkMode ? '#d1d5db' : '#374151',
    },
    closeButton: {
      marginTop: '1rem',
      width: '100%',
      padding: '0.75rem',
      borderRadius: '8px',
      background: 'linear-gradient(45deg, #8b5cf6, #06b6d4)',
      color: 'white',
      border: 'none',
      cursor: 'pointer',
      fontSize: '0.875rem',
      fontWeight: '500',
    }
  };

  return (
    <div style={styles.container}>
      {/* CSS Animations */}
      <style>{`
        @keyframes float {
          0%, 100% { transform: translateY(0px) rotate(0deg); }
          25% { transform: translateY(-20px) rotate(1deg); }
          50% { transform: translateY(-10px) rotate(-1deg); }
          75% { transform: translateY(-15px) rotate(0.5deg); }
        }
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }
      `}</style>

      {/* Background Effects */}
      <div style={styles.backgroundEffects}>
        <div style={{...styles.floatingOrb, ...styles.orb1}}></div>
        <div style={{...styles.floatingOrb, ...styles.orb2}}></div>
        <div style={{...styles.floatingOrb, ...styles.orb3}}></div>
      </div>

      {/* Header */}
      <header style={styles.header}>
        <div style={styles.logo}>
          <div style={styles.logoIcon}>
            <ZapIcon className="w-5 h-5 text-white" />
          </div>
          <span style={styles.logoText}>Eternals AI</span>
        </div>
        
        <div style={styles.headerButtons}>
          <button
            onClick={() => setShowSettings(!showSettings)}
            style={{...styles.headerButton, ':hover': {background: 'rgba(255, 255, 255, 0.2)'}}}
            onMouseEnter={(e) => e.target.style.background = 'rgba(255, 255, 255, 0.2)'}
            onMouseLeave={(e) => e.target.style.background = 'rgba(255, 255, 255, 0.1)'}
          >
            <SettingsIcon className="w-5 h-5" />
          </button>
          <button
            onClick={toggleTheme}
            style={styles.headerButton}
            onMouseEnter={(e) => e.target.style.background = 'rgba(255, 255, 255, 0.2)'}
            onMouseLeave={(e) => e.target.style.background = 'rgba(255, 255, 255, 0.1)'}
          >
            {darkMode ? <SunIcon className="w-5 h-5" /> : <MoonIcon className="w-5 h-5" />}
          </button>
        </div>
      </header>

      {/* Main Content */}
      <main style={styles.main}>
        {/* Hero Section */}
        <div style={styles.hero}>
          <h1 style={styles.title}>Eternals</h1>
          <p style={styles.subtitle}>Advanced AI Voice Assistant</p>
          <div style={styles.features}>
            <div style={styles.feature}>
              <GlobeIcon className="w-4 h-4" />
              <span>Multi-language Support</span>
            </div>
            <div style={styles.feature}>
              <BrainIcon className="w-4 h-4" />
              <span>Neural Processing</span>
            </div>
            <div style={styles.feature}>
              <MessageIcon className="w-4 h-4" />
              <span>Natural Conversation</span>
            </div>
          </div>
        </div>

        {/* Recording Interface */}
        <div style={styles.recordingInterface}>
          {/* Audio Level Visualizer */}
          {isRecording && (
            <div style={styles.visualizer}>
              {[...Array(20)].map((_, i) => (
                <div
                  key={i}
                  style={{
                    ...styles.visualizerBar,
                    height: `${Math.max(4, recordingLevel * 40 + Math.sin(Date.now() * 0.01 + i) * 10)}px`,
                    opacity: recordingLevel * 20 > i ? 1 : 0.3,
                  }}
                />
              ))}
            </div>
          )}

          {/* Main Recording Button */}
          <div>
            <button
              onClick={startRecording}
              disabled={isRecording || isProcessing}
              style={{
                ...styles.recordButton,
                ...(isRecording ? styles.recordButtonRecording : 
                   isProcessing ? styles.recordButtonProcessing : 
                   styles.recordButtonNormal),
                ':hover': !isRecording && !isProcessing ? {transform: 'scale(1.05)'} : {}
              }}
              onMouseEnter={(e) => {
                if (!isRecording && !isProcessing) {
                  e.target.style.transform = 'scale(1.05)';
                }
              }}
              onMouseLeave={(e) => {
                if (!isRecording && !isProcessing) {
                  e.target.style.transform = 'scale(1)';
                }
              }}
            >
              <div style={{
                position: 'absolute',
                inset: 0,
                borderRadius: '50%',
                background: 'linear-gradient(45deg, #8b5cf6, #06b6d4)',
                opacity: 0.2,
                animation: isRecording ? 'pulse 2s ease-in-out infinite' : 'none'
              }}></div>
              {isRecording ? (
                <MicOffIcon className="w-8 h-8 text-red-400" />
              ) : isProcessing ? (
                <BrainIcon className="w-8 h-8 text-yellow-400" />
              ) : (
                <MicIcon className="w-8 h-8 text-purple-400" />
              )}
            </button>
          </div>

          <p style={styles.statusText}>
            {isRecording ? "🎧 Listening... (10s max)" : 
             isProcessing ? "🧠 Processing your request..." : 
             "🎤 Tap to speak in any language"}
          </p>
        </div>

        {/* Conversation Display */}
        <div style={styles.conversationGrid}>
          {/* User Input */}
          {userText && (
            <div style={styles.conversationCard}>
              <div style={styles.cardHeader}>
                <div style={styles.cardHeaderLeft}>
                  <div style={{...styles.avatar, ...styles.userAvatar}}>
                    You
                  </div>
                  <span style={{fontSize: '0.875rem', opacity: 0.7}}>
                    {language && `Detected: ${language}`}
                  </span>
                </div>
              </div>
              <p style={styles.cardText}>{userText}</p>
            </div>
          )}

          {/* AI Response */}
          {aiReply && (
            <div style={styles.conversationCard}>
              <div style={styles.cardHeader}>
                <div style={styles.cardHeaderLeft}>
                  <div style={{...styles.avatar, ...styles.aiAvatar}}>
                    <ZapIcon className="w-4 h-4" />
                  </div>
                  <span style={{fontSize: '0.875rem', opacity: 0.7}}>Eternals AI</span>
                </div>
                {isSpeaking ? (
                  <button
                    onClick={stopSpeaking}
                    style={{...styles.actionButton, ...styles.stopButton}}
                    onMouseEnter={(e) => e.target.style.background = 'rgba(239, 68, 68, 0.3)'}
                    onMouseLeave={(e) => e.target.style.background = 'rgba(239, 68, 68, 0.2)'}
                  >
                    <MicOffIcon className="w-4 h-4" />
                  </button>
                ) : (
                  <button
                    onClick={() => speakResponse(aiReply, language)}
                    style={{...styles.actionButton, ...styles.speakButton}}
                    onMouseEnter={(e) => e.target.style.background = 'rgba(59, 130, 246, 0.3)'}
                    onMouseLeave={(e) => e.target.style.background = 'rgba(59, 130, 246, 0.2)'}
                  >
                    <VolumeIcon className="w-4 h-4" />
                  </button>
                )}
              </div>
              <p style={styles.cardText}>{aiReply}</p>
            </div>
          )}
        </div>

        {/* Conversation History */}
        {conversationHistory.length > 0 && (
          <div style={styles.historySection}>
            <div style={styles.historyHeader}>
              <h3 style={styles.historyTitle}>Conversation History</h3>
              <button
                onClick={clearConversation}
                style={styles.clearButton}
                onMouseEnter={(e) => e.target.style.background = 'rgba(239, 68, 68, 0.3)'}
                onMouseLeave={(e) => e.target.style.background = 'rgba(239, 68, 68, 0.2)'}
              >
                Clear History
              </button>
            </div>
            <div style={styles.historyContainer}>
              {conversationHistory.map((item, index) => (
                <div key={index} style={{
                  ...styles.historyItem,
                  flexDirection: item.type === 'ai' ? 'row-reverse' : 'row'
                }}>
                  <div style={{
                    ...styles.historyBubble,
                    ...(item.type === 'user' ? styles.userBubble : styles.aiBubble)
                  }}>
                    <p style={styles.historyText}>{item.text}</p>
                    <span style={styles.historyTime}>
                      {item.timestamp.toLocaleTimeString()}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Settings Modal */}
        {showSettings && (
          <div style={styles.modal} onClick={(e) => {
            if (e.target === e.currentTarget) setShowSettings(false);
          }}>
            <div style={styles.modalContent} onClick={(e) => e.stopPropagation()}>
              <h3 style={styles.modalTitle}>Settings</h3>
              <div style={styles.settingsGrid}>
                <div style={styles.settingItem}>
                  <span style={styles.settingLabel}>Dark Mode</span>
                  <button
                    onClick={toggleTheme}
                    style={{
                      padding: '0.25rem 0.75rem',
                      borderRadius: '6px',
                      background: darkMode ? 'rgba(139, 92, 246, 0.2)' : 'rgba(59, 130, 246, 0.2)',
                      color: darkMode ? '#a855f7' : '#3b82f6',
                      border: 'none',
                      cursor: 'pointer',
                      fontSize: '0.75rem'
                    }}
                  >
                    {darkMode ? 'ON' : 'OFF'}
                  </button>
                </div>
                <div style={styles.settingItem}>
                  <span style={styles.settingLabel}>Voice Feedback</span>
                  <button
                    style={{
                      padding: '0.25rem 0.75rem',
                      borderRadius: '6px',
                      background: 'rgba(34, 197, 94, 0.2)',
                      color: '#22c55e',
                      border: 'none',
                      cursor: 'pointer',
                      fontSize: '0.75rem'
                    }}
                  >
                    ON
                  </button>
                </div>
                <div style={styles.settingItem}>
                  <span style={styles.settingLabel}>Recording Duration</span>
                  <span style={{fontSize: '0.75rem', opacity: 0.7}}>10 seconds</span>
                </div>
                <div style={styles.settingItem}>
                  <span style={styles.settingLabel}>Auto-Language Detection</span>
                  <button
                    style={{
                      padding: '0.25rem 0.75rem',
                      borderRadius: '6px',
                      background: 'rgba(34, 197, 94, 0.2)',
                      color: '#22c55e',
                      border: 'none',
                      cursor: 'pointer',
                      fontSize: '0.75rem'
                    }}
                  >
                    ON
                  </button>
                </div>
              </div>
              <button
                onClick={() => setShowSettings(false)}
                style={styles.closeButton}
                onMouseEnter={(e) => e.target.style.opacity = '0.9'}
                onMouseLeave={(e) => e.target.style.opacity = '1'}
              >
                Close Settings
              </button>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}