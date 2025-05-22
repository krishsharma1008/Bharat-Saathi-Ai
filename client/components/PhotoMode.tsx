// client/src/components/PhotoMode.tsx
import React, {
  useState,
  useRef,
  useEffect,
  ChangeEvent,
} from 'react'
import Draggable from 'react-draggable'
import { MicrophoneIcon } from '@heroicons/react/24/outline'
import {
  parseFormImage,
  generateFilledPdf,
  sendAudioToAPI,
  explainForm,
  FormField,
} from '../services/api'

export default function PhotoMode() {
  // template + field detection
  const [imageSrc, setImageSrc] = useState<string>()
  const [fields, setFields] = useState<FormField[]>([])
  const [imgSize, setImgSize] = useState<{ width: number; height: number }>()

  // answers & conversational flow
  const [answers, setAnswers] = useState<Record<string, string>>({})
  const [current, setCurrent] = useState<number>(-1)

  // audio recording for fill
  const [recording, setRecording] = useState(false)
  const [recorder, setRecorder] = useState<MediaRecorder | null>(null)

  // form explanation
  const [explaining, setExplaining] = useState(false)
  const [explanationText, setExplanationText] = useState<string>()
  const [explanationAudio, setExplanationAudio] = useState<string>()

  const imgRef = useRef<HTMLImageElement>(null)

  // capture natural dimensions once loaded
  useEffect(() => {
    if (imgRef.current && imageSrc) {
      setImgSize({
        width: imgRef.current.naturalWidth,
        height: imgRef.current.naturalHeight,
      })
    }
  }, [imageSrc])

  // 1) user uploads image
  const onImageUpload = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setImageSrc(URL.createObjectURL(file))
    const detected = await parseFormImage(file)
    setFields(detected)
    setCurrent(0) // start fill flow
  }

  // 2) conversational fill recording
  const startRecording = async () => {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    const mr = new MediaRecorder(stream)
    const chunks: Blob[] = []

    mr.ondataavailable = e => chunks.push(e.data)
    mr.onstop = async () => {
      const blob = new Blob(chunks, { type: 'audio/webm; codecs=opus' })
      const file = new File([blob], 'voice.webm', { type: blob.type })
      const { text } = await sendAudioToAPI(file)
      onAnswer(text)
    }

    mr.start()
    setRecorder(mr)
    setRecording(true)
  }
  const stopRecording = () => {
    recorder?.stop()
    setRecording(false)
  }

  // 3) handle each answer (typed or voice)
  const onAnswer = (value: string) => {
    const name = fields[current].name
    setAnswers(a => ({ ...a, [name]: value }))
    if (current + 1 < fields.length) {
      setCurrent(current + 1)
    } else {
      setCurrent(-2) // done
    }
  }

  // 4) download filled PDF
  const downloadFilledPDF = async () => {
    if (!imgSize || !imageSrc) return
    const resp = await fetch(imageSrc)
    const blob = await resp.blob()
    const base64 = await new Promise<string>(res => {
      const fr = new FileReader()
      fr.onload = () => res((fr.result as string).split(',')[1])
      fr.readAsDataURL(blob)
    })

    const pdfB64 = await generateFilledPdf(
      base64,
      imgSize.width,
      imgSize.height,
      fields.map(f => ({
        ...f,
        value: answers[f.name] || '',
      }))
    )

    const link = document.createElement('a')
    link.href = 'data:application/pdf;base64,' + pdfB64
    link.download = 'filled-form.pdf'
    link.click()
  }

  // 5) explain the form
  const handleExplain = async () => {
    setExplaining(true)
    try {
      const { text, audio } = await explainForm(fields)
      setExplanationText(text)
      if (audio) {
        setExplanationAudio(audio)
        new Audio(audio).play()
      }
    } catch (err) {
      console.error('❌ Explain error', err)
    }
    setExplaining(false)
  }

  return (
    <div className="p-4 space-y-4">
      {/* Image picker */}
      {current < 0 && (
        <input
          type="file"
          accept="image/*"
          onChange={onImageUpload}
          className="border p-2 rounded"
        />
      )}

      {/* Preview + tweak + explain */}
      {imageSrc && current < 0 && (
        <div className="relative inline-block border p-4 bg-white">
          <img ref={imgRef} src={imageSrc} alt="form" className="block" />

          {fields.map(f => (
            <Draggable
              key={f.name}
              defaultPosition={{ x: f.bbox.x, y: f.bbox.y }}
            >
              <input
                style={{
                  width: f.bbox.width,
                  height: f.bbox.height,
                }}
                className="absolute border bg-white"
                placeholder={f.label}
                value={answers[f.name] || ''}
                onChange={e =>
                  setAnswers(a => ({
                    ...a,
                    [f.name]: e.target.value,
                  }))
                }
              />
            </Draggable>
          ))}

          <div className="mt-4 flex gap-2">
            <button
              onClick={() => setCurrent(0)}
              className="px-4 py-2 bg-blue-600 text-white rounded"
            >
              Start Conversational Fill
            </button>

            <button
              onClick={handleExplain}
              disabled={explaining}
              className="px-4 py-2 bg-green-600 text-white rounded disabled:opacity-50"
            >
              {explaining ? 'Explaining…' : 'Explain Form'}
            </button>
          </div>

          {explanationText && (
            <div className="mt-4 p-4 bg-gray-100 rounded">
              <h3 className="font-semibold mb-2">Form Explanation</h3>
              <p>{explanationText}</p>
            </div>
          )}
        </div>
      )}

      {/* Conversational Q&A */}
      {current >= 0 && current < fields.length && (
        <div className="space-y-2">
          <p>
            <strong>Field:</strong> {fields[current].label}
          </p>

          <div className="flex gap-2">
            <input
              type="text"
              placeholder={`Enter ${fields[current].label}`}
              onKeyDown={e =>
                e.key === 'Enter' &&
                onAnswer((e.target as HTMLInputElement).value)
              }
              className="flex-1 border px-2 py-1 rounded"
            />

            <button
              onClick={recording ? stopRecording : startRecording}
              className={`p-2 rounded ${
                recording ? 'bg-red-500' : 'bg-green-500'
              }`}
            >
              <MicrophoneIcon className="w-6 h-6 text-white" />
            </button>
          </div>
        </div>
      )}

      {/* Download when done */}
      {current === -2 && (
        <button
          onClick={downloadFilledPDF}
          className="px-6 py-2 bg-indigo-600 text-white rounded"
        >
          Download Filled PDF
        </button>
      )}
    </div>
  )
}