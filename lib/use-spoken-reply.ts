"use client";

import { useEffect, useRef, useState } from "react";

export function useSpokenReply() {
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [supported, setSupported] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [voiceURI, setVoiceURI] = useState("");
  const [error, setError] = useState("");
  const utterance = useRef<SpeechSynthesisUtterance | null>(null);
  useEffect(() => {
    if (!("speechSynthesis" in window)) return;
    setSupported(true);
    const load = () => setVoices(window.speechSynthesis.getVoices());
    load();
    window.speechSynthesis.addEventListener("voiceschanged", load);
    return () => { window.speechSynthesis.cancel(); window.speechSynthesis.removeEventListener("voiceschanged", load); };
  }, []);
  function stop() { window.speechSynthesis?.cancel(); setSpeaking(false); }
  function speak(text: string) {
    if (!supported) return;
    stop(); setError("");
    const reply = new SpeechSynthesisUtterance(text);
    const language = navigator.language || "en-US";
    const matching = voices.filter((voice) => voice.lang.startsWith(language.split("-")[0]));
    reply.voice = voices.find((voice) => voice.voiceURI === voiceURI) ?? matching.find((voice) => /natural|premium|enhanced/i.test(voice.name)) ?? matching.find((voice) => voice.default) ?? matching[0] ?? null;
    reply.lang = reply.voice?.lang ?? language;
    reply.rate = 1;
    reply.onstart = () => setSpeaking(true);
    reply.onend = () => setSpeaking(false);
    reply.onerror = (event) => { setSpeaking(false); if (event.error !== "canceled" && event.error !== "interrupted") setError("This voice could not play. Try another device voice."); };
    utterance.current = reply;
    window.speechSynthesis.speak(reply);
  }
  return { supported, speaking, voices, voiceURI, setVoiceURI, speak, stop, error };
}
