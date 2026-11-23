"use client";

import { useCallback, useEffect, useRef, useState } from "react";

interface RecognitionResultEvent {
  resultIndex: number;
  results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }>;
}

interface Recognition {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((event: RecognitionResultEvent) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
}

type RecognitionConstructor = new () => Recognition;

function getRecognition(): RecognitionConstructor | null {
  if (typeof window === "undefined") return null;
  const scope = window as unknown as {
    SpeechRecognition?: RecognitionConstructor;
    webkitSpeechRecognition?: RecognitionConstructor;
    Capacitor?: { isNativePlatform?: () => boolean };
  };
  // The Android app's web view has no working speech recogniser, so voice input is hidden there for now.
  if (scope.Capacitor?.isNativePlatform?.()) return null;
  return scope.SpeechRecognition ?? scope.webkitSpeechRecognition ?? null;
}

/** Whether voice input can work here (false in the Android app and in browsers without speech recognition). */
export function speechAvailable() {
  return Boolean(getRecognition());
}

const ERROR_TEXT: Record<string, string> = {
  "not-allowed": "Microphone access was blocked. Allow it in your browser settings to add by voice.",
  "service-not-allowed": "Voice input is not allowed in this browser.",
  "no-speech": "I didn't hear anything. Tap the microphone and try again.",
  "audio-capture": "No microphone was found.",
  network: "Voice input needs a connection in this browser."
};

/** Speech-to-text using the browser's built-in recogniser. Nothing is recorded or stored by DayBoard. */
export function useSpeech(onFinal?: (text: string) => void) {
  const [supported, setSupported] = useState(false);
  const [listening, setListening] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [error, setError] = useState<string | null>(null);
  const recognitionRef = useRef<Recognition | null>(null);
  const finalRef = useRef("");
  const onFinalRef = useRef(onFinal);
  onFinalRef.current = onFinal;

  useEffect(() => {
    setSupported(Boolean(getRecognition()));
    return () => recognitionRef.current?.abort();
  }, []);

  const stop = useCallback(() => recognitionRef.current?.stop(), []);

  const start = useCallback(() => {
    const Constructor = getRecognition();
    if (!Constructor) return;
    recognitionRef.current?.abort();
    const recognition = new Constructor();
    recognition.lang = navigator.language || "en-US";
    recognition.continuous = true;
    recognition.interimResults = true;
    finalRef.current = "";
    setTranscript("");
    setError(null);

    recognition.onresult = (event) => {
      let interim = "";
      for (let index = event.resultIndex; index < event.results.length; index += 1) {
        const result = event.results[index];
        if (result.isFinal) finalRef.current = `${finalRef.current} ${result[0].transcript}`.trim();
        else interim += result[0].transcript;
      }
      setTranscript(`${finalRef.current} ${interim}`.trim());
    };
    recognition.onerror = (event) => {
      if (event.error !== "aborted") setError(ERROR_TEXT[event.error] ?? "Voice input stopped unexpectedly.");
    };
    recognition.onend = () => {
      setListening(false);
      if (finalRef.current) onFinalRef.current?.(finalRef.current);
    };

    recognitionRef.current = recognition;
    try {
      recognition.start();
      setListening(true);
    } catch {
      setError("Voice input could not start. Try again.");
    }
  }, []);

  return { supported, listening, transcript, error, start, stop };
}
