import React, { useState } from 'react'
import { ChatBox } from '../components/ChatBox'
import PhotoMode    from '../components/PhotoMode'

export default function HomePage() {
  const [photoMode, setPhotoMode] = useState(false)

  return (
    <div className="h-screen w-screen relative bg-gray-100">
      {photoMode && (
        <div className="absolute inset-0 bg-black bg-opacity-50 z-20 flex items-center justify-center">
          <div className="bg-white rounded-lg shadow-xl p-4 max-w-2xl w-full relative">
            <button
              className="absolute top-2 right-2 text-gray-600 hover:text-gray-800"
              onClick={() => setPhotoMode(false)}
            >✕</button>
            <PhotoMode />
          </div>
        </div>
      )}

      <ChatBox onOpenPhotoMode={() => setPhotoMode(true)} />
    </div>
  )
}