// client/src/components/ChatBox.tsx
import React, { useState, useRef, useEffect } from 'react'
import { motion } from 'framer-motion'
import { CameraIcon, MicrophoneIcon } from '@heroicons/react/24/outline'
import { sendTextToAPI, sendAudioToAPI } from '../services/api'

export interface Message {
  user: 'user' | 'bot'
  text: string
}

export interface ChatBoxProps {
  onOpenPhotoMode(): void
}

export function ChatBox({ onOpenPhotoMode }: ChatBoxProps) {
  const [messages, setMessages]   = useState<Message[]>([])
  const [input, setInput]         = useState('')
  const [loading, setLoading]     = useState(false)
  const [recording, setRecording] = useState(false)
  const [recorder, setRecorder]   = useState<MediaRecorder|null>(null)
  const bottomRef = useRef<HTMLDivElement>(null)

  // auto-scroll
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // send text
  const handleSend = async () => {
    const t = input.trim()
    if (!t) return
    setMessages(m => [...m, { user: 'user', text: t }])
    setInput('')
    setLoading(true)

    try {
      const { text: botText, audio } = await sendTextToAPI(t)
      setMessages(m => [...m, { user: 'bot', text: botText }])
      if (audio) new Audio(audio).play()
    } catch {
      setMessages(m => [...m, { user: 'bot', text: '⚠️ Server error' }])
    }

    setLoading(false)
  }

  // voice
  const startVoice = async () => {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    const mr = new MediaRecorder(stream)
    const chunks: Blob[] = []

    mr.ondataavailable = e => chunks.push(e.data)
    mr.onstop = async () => {
      setMessages(m => [...m, { user: 'user', text: '[🎤 Voice]' }])
      setLoading(true)
      const blob = new Blob(chunks, { type: 'audio/webm; codecs=opus' })
      const file = new File([blob], 'voice.webm', { type: blob.type })
      try {
        const { text: botText, audio } = await sendAudioToAPI(file)
        setMessages(m => [...m, { user: 'bot', text: botText }])
        if (audio) new Audio(audio).play()
      } catch {
        setMessages(m => [...m, { user: 'bot', text: '⚠️ Server error' }])
      }
      setLoading(false)
    }

    mr.start()
    setRecorder(mr)
    setRecording(true)
  }
  const stopVoice = () => {
    recorder?.stop()
    setRecording(false)
  }

  return (
    <div className="flex flex-col h-full bg-gray-900 text-white">
      {/* Header */}
      <header className="py-4 text-center text-2xl font-semibold border-b border-gray-700">
        🇮🇳 Bharat Saathi AI
      </header>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-6 space-y-4">
        {messages.map((m, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className={`flex ${m.user === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            <div
              className={`
                max-w-[70%] px-4 py-2 rounded-2xl shadow
                ${m.user === 'user' ? 'bg-blue-600 text-white' : 'bg-gray-800 text-gray-100'}
              `}
            >
              {m.text}
            </div>
          </motion.div>
        ))}
        <div ref={bottomRef} />
      </div>

      {/* Input bar */}
      <div className="px-4 pb-6 bg-gray-900 border-t border-gray-800">
        <div className="mx-auto max-w-2xl flex items-center bg-gray-800 rounded-full px-4 py-2 space-x-2">
          {/* Camera */}
          <button
            onClick={onOpenPhotoMode}
            disabled={loading}
            className="p-2 rounded hover:bg-gray-700"
          >
            <CameraIcon className="w-6 h-6 text-gray-400 hover:text-gray-200" />
          </button>

          {/* Text */}
          <input
            type="text"
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleSend()}
            placeholder="Ask anything…"
            disabled={loading}
            className="flex-1 bg-transparent focus:outline-none text-gray-100 placeholder-gray-500"
          />

          {/* Send */}
          <button
            onClick={handleSend}
            disabled={loading}
            className={`rounded-full px-4 py-2 font-medium ${
              loading ? 'bg-blue-400' : 'bg-blue-600 hover:bg-blue-500'
            }`}
          >
            Send
          </button>

          {/* Microphone */}
          <button
            onClick={recording ? stopVoice : startVoice}
            className={`rounded-full p-2 ${
              recording ? 'bg-red-500' : 'bg-green-500 hover:bg-green-400'
            }`}
          >
            <MicrophoneIcon className="w-6 h-6 text-white" />
          </button>
        </div>
      </div>
    </div>
  )
}