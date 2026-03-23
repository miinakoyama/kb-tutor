"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  DEFAULT_TTS_RATE,
  TTS_RATE_OPTIONS,
  getStoredTtsRate,
  isValidTtsRate,
  setStoredTtsRate,
} from "@/lib/tts-settings";

export type ReadSection = "question" | "choices" | "feedback";

interface UseTextToSpeechOptions {
  defaultRate?: number;
  lang?: string;
}

function splitIntoChunks(text: string, maxLength = 220): string[] {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (!normalized) return [];

  const sentenceChunks = normalized.match(/[^.!?]+[.!?]?/g) ?? [normalized];
  const chunks: string[] = [];

  for (const sentence of sentenceChunks) {
    const trimmed = sentence.trim();
    if (!trimmed) continue;

    if (trimmed.length <= maxLength) {
      chunks.push(trimmed);
      continue;
    }

    for (let i = 0; i < trimmed.length; i += maxLength) {
      chunks.push(trimmed.slice(i, i + maxLength));
    }
  }

  return chunks;
}

export function useTextToSpeech({
  defaultRate = DEFAULT_TTS_RATE,
  lang = "en-US",
}: UseTextToSpeechOptions = {}) {
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [currentSection, setCurrentSection] = useState<ReadSection | null>(null);
  const [rate, setRateState] = useState(() => {
    return getStoredTtsRate(defaultRate);
  });

  const synthRef = useRef<SpeechSynthesis | null>(null);
  const cancelledRef = useRef(false);
  const rateRef = useRef(defaultRate);
  const queueRef = useRef<{
    chunks: string[];
    index: number;
    section: ReadSection | null;
  }>({ chunks: [], index: 0, section: null });

  const isSupported =
    typeof window !== "undefined" && "speechSynthesis" in window;

  useEffect(() => {
    if (!isSupported) return;
    synthRef.current = window.speechSynthesis;
  }, [isSupported]);

  useEffect(() => {
    rateRef.current = rate;
  }, [rate]);

  const stop = useCallback(() => {
    cancelledRef.current = true;
    synthRef.current?.cancel();
    queueRef.current = { chunks: [], index: 0, section: null };
    setIsSpeaking(false);
    setCurrentSection(null);
  }, []);

  const speak = useCallback(
    (section: ReadSection, text: string) => {
      if (!isSupported) return;

      const chunks = splitIntoChunks(text);
      if (chunks.length === 0) return;

      cancelledRef.current = true;
      synthRef.current?.cancel();

      cancelledRef.current = false;
      queueRef.current = { chunks, index: 0, section };
      setCurrentSection(section);
      setIsSpeaking(true);

      const speakChunk = () => {
        const synth = synthRef.current;
        const queue = queueRef.current;

        if (!synth) {
          setIsSpeaking(false);
          setCurrentSection(null);
          return;
        }

        if (cancelledRef.current) return;

        if (queue.index >= queue.chunks.length) {
          setIsSpeaking(false);
          setCurrentSection(null);
          return;
        }

        const utterance = new SpeechSynthesisUtterance(queue.chunks[queue.index]);
        utterance.rate = rateRef.current;
        utterance.lang = lang;

        utterance.onend = () => {
          if (cancelledRef.current) return;
          queueRef.current.index += 1;
          speakChunk();
        };

        utterance.onerror = () => {
          setIsSpeaking(false);
          setCurrentSection(null);
        };

        synth.speak(utterance);
      };

      speakChunk();
    },
    [isSupported, lang],
  );

  const toggleSpeak = useCallback(
    (section: ReadSection, text: string) => {
      if (isSpeaking && currentSection === section) {
        stop();
        return;
      }
      speak(section, text);
    },
    [currentSection, isSpeaking, speak, stop],
  );

  useEffect(() => {
    return () => stop();
  }, [stop]);

  return {
    isSupported,
    isSpeaking,
    currentSection,
    rate,
    setRate: (nextRate: number) => {
      if (!isValidTtsRate(nextRate)) {
        return;
      }
      setRateState(nextRate);
      setStoredTtsRate(nextRate);
    },
    toggleSpeak,
    stop,
    rateOptions: TTS_RATE_OPTIONS,
  };
}
