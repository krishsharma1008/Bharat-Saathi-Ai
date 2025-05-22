export const BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5001';

export interface ChatResponse {
  text: string;
  audio?: string;
}

export interface VoiceResponse {
  text: string;
  audio?: string;
}

export interface FormField {
  name: string;
  label: string;
  bbox: { x: number; y: number; width: number; height: number };
}

/**
 * 1) TEXT CHAT → /api/chat
 */
export async function sendTextToAPI(text: string): Promise<ChatResponse> {
  const res = await fetch(`${BASE}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text }),
  });
  if (!res.ok) {
    const errBody = await res.json().catch(() => ({}));
    throw new Error(`Chat API error (${res.status}): ${errBody.error || res.statusText}`);
  }
  return res.json();
}

/**
 * 2) VOICE CHAT → /api/voice
 */
export async function sendAudioToAPI(file: File): Promise<VoiceResponse> {
  const form = new FormData();
  form.append('file', file, file.name); // must match multer.single('file')
  const res = await fetch(`${BASE}/api/voice`, {
    method: 'POST',
    body: form,
  });
  if (!res.ok) {
    const errBody = await res.json().catch(() => ({}));
    throw new Error(`Voice API error (${res.status}): ${errBody.error || res.statusText}`);
  }
  return res.json();
}

/**
 * 3) PHOTO MODE: OCR + field extraction → /api/parse-form-image
 */
export async function parseFormImage(file: File): Promise<FormField[]> {
  const form = new FormData();
  form.append('image', file, file.name); // must match upload.single('image') on server

  const res = await fetch(`${BASE}/api/parse-form-image`, {
    method: 'POST',
    body: form,
  });
  if (!res.ok) {
    const errBody = await res.json().catch(() => ({}));
    throw new Error(`Parse Form API error (${res.status}): ${errBody.error || res.statusText}`);
  }
  const { fields } = await res.json();
  return fields as FormField[];
}

/**
 * 4) PHOTO MODE: Fill template PDF → /api/fill-pdf
 */
export async function generateFilledPdf(
  templateBase64: string,
  imageWidth: number,
  imageHeight: number,
  fields: Array<{ name: string; bbox: { x:number; y:number; width:number; height:number }; value: string }>
): Promise<string> {
  const res = await fetch(`${BASE}/api/fill-pdf`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ templateBase64, imageWidth, imageHeight, fields }),
  });
  if (!res.ok) {
    const errBody = await res.json().catch(() => ({}));
    throw new Error(`Fill PDF API error (${res.status}): ${errBody.error || res.statusText}`);
  }
  const { pdfBase64 } = await res.json();
  return pdfBase64 as string;
}

/**
 * 5) FORM EXPLANATION: GPT → Sarvam TTS
 */
export async function explainForm(fields: FormField[]): Promise<ChatResponse> {
  const labels = fields.map(f => f.label).join(', ');
  const prompt = `Explain this form to someone who has never seen it before. The form fields are: ${labels}.`;
  const res = await fetch(`${BASE}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text: prompt }),
  });
  if (!res.ok) {
    const errBody = await res.json().catch(() => ({}));
    throw new Error(`Explain Form API error (${res.status}): ${errBody.error || res.statusText}`);
  }
  return res.json();
}