/** Client-safe check for Web Speech API (read aloud). */
export function isSpeechSynthesisSupported(): boolean {
  return typeof window !== "undefined" && "speechSynthesis" in window;
}
