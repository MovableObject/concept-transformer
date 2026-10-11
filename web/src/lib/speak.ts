// Read text aloud with the browser's own voice. Pressing again on the same thing stops it.
import { create } from 'zustand'

export const useSpeaking = create<{ key: string | null }>(() => ({ key: null }))

export function speak(text: string, key: string) {
  const synth = window.speechSynthesis
  if (!synth || !text) return
  synth.cancel()
  if (useSpeaking.getState().key === key) { useSpeaking.setState({ key: null }); return }
  const u = new SpeechSynthesisUtterance(text)
  u.onend = u.onerror = () => { if (useSpeaking.getState().key === key) useSpeaking.setState({ key: null }) }
  useSpeaking.setState({ key })
  synth.speak(u)
}
