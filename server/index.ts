import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import multer from 'multer';
import fs from 'fs';
import path from 'path';
import axios from 'axios';
import FormData from 'form-data';
import { Buffer } from 'buffer';
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import { OpenAI } from 'openai';

////////////////////////////////////////////////////////////////////////////////
// App & Config
////////////////////////////////////////////////////////////////////////////////

const app = express();
const PORT = Number(process.env.PORT ?? 5001);

// allow large JSON bodies (for base64-encoded PDF/image templates)
app.use(cors());
app.use(express.json({ limit: '100mb' }));

// OpenAI & Sarvam keys
const OPENAI_KEY = process.env.OPENAI_API_KEY!;
const SARVAM_KEY = process.env.SARVAM_API_KEY!;
const openai     = new OpenAI({ apiKey: OPENAI_KEY });

// Multer destination for uploads
const upload = multer({ dest: path.join(__dirname, 'uploads') });

////////////////////////////////////////////////////////////////////////////////
// 1) TEXT CHAT → GPT → Sarvam TTS
////////////////////////////////////////////////////////////////////////////////

app.post('/api/chat', async (req, res) => {
  const userText = String(req.body.text || '').trim();
  if (!userText) {
    res.status(400).json({ error: 'No `text` provided' });
    return;
  }
  try {
    // Ask GPT
    const chat = await openai.chat.completions.create({
      model:    'gpt-3.5-turbo',
      messages: [
        { role: 'system', content: 'You are Bharat Saathi AI: an empathetic Hindi assistant.' },
        { role: 'user',   content: userText }
      ]
    });
    const botText = chat.choices[0].message.content?.trim() || '';

    // Sarvam TTS
    const ttsResp = await axios.post(
      'https://api.sarvam.ai/text-to-speech',
      { text: botText, target_language_code: 'hi-IN', speaker: 'anushka' },
      { headers: {
          'Content-Type':          'application/json',
          'api-subscription-key':  SARVAM_KEY
        }
      }
    );
    const b64   = ttsResp.data.audios?.[0] || '';
    const audio = b64 ? `data:audio/wav;base64,${b64}` : undefined;

    res.json({ text: botText, audio });
  } catch (err: any) {
    console.error('❌ /api/chat', err.response?.data || err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

////////////////////////////////////////////////////////////////////////////////
// 2) VOICE CHAT → Whisper STT → GPT → Sarvam TTS
////////////////////////////////////////////////////////////////////////////////

app.post('/api/voice', upload.single('file'), async (req, res) => {
  const file = (req as any).file;
  if (!file) {
    res.status(400).json({ error: 'No `file` uploaded' });
    return;
  }
  try {
    // Whisper STT
    const form = new FormData();
    form.append('file', fs.createReadStream(file.path) as any, file.originalname);
    form.append('model', 'whisper-1');
    form.append('response_format', 'text');
    form.append('language', 'hi');

    const sttResp = await axios.post(
      'https://api.openai.com/v1/audio/transcriptions',
      form,
      { headers: { ...form.getHeaders(), Authorization: `Bearer ${OPENAI_KEY}` } }
    );
    const userText = String(sttResp.data).trim();

    // GPT
    const chat = await openai.chat.completions.create({
      model:    'gpt-3.5-turbo',
      messages: [
        { role: 'system', content: 'You are Bharat Saathi AI: an empathetic Hindi assistant.' },
        { role: 'user',   content: userText }
      ]
    });
    const botText = chat.choices[0].message.content?.trim() || '';

    // Sarvam TTS
    const ttsResp = await axios.post(
      'https://api.sarvam.ai/text-to-speech',
      { text: botText, target_language_code: 'hi-IN', speaker: 'anushka' },
      { headers: {
          'Content-Type':          'application/json',
          'api-subscription-key':  SARVAM_KEY
        }
      }
    );
    const b642  = ttsResp.data.audios?.[0] || '';
    const audio = b642 ? `data:audio/wav;base64,${b642}` : undefined;

    res.json({ text: botText, audio });
  } catch (err: any) {
    console.error('❌ /api/voice', err.response?.data || err.message);
    res.status(500).json({ error: 'Internal server error' });
  } finally {
    fs.unlinkSync(file.path);
  }
});

////////////////////////////////////////////////////////////////////////////////
// 3) PARSE FORM IMAGE → base64 → GPT function-call
////////////////////////////////////////////////////////////////////////////////

app.post('/api/parse-form-image', upload.single('image'), async (req, res) => {
  const file = (req as any).file;
  if (!file) {
    res.status(400).json({ error: 'No image uploaded' });
    return;
  }
  try {
    // Read & base64 encode
    const imgB64 = fs.readFileSync(file.path).toString('base64');

    // GPT function schema
    const fnSpec = {
      name:        'extractFormFields',
      description: 'Identify blank form fields in this form image',
      parameters: {
        type:       'object',
        properties: {
          fields: {
            type:  'array',
            items: {
              type:       'object',
              properties: {
                name:  { type: 'string' },
                label: { type: 'string' },
                bbox:  {
                  type:       'object',
                  properties: {
                    x:      { type: 'number' },
                    y:      { type: 'number' },
                    width:  { type: 'number' },
                    height: { type: 'number' }
                  }
                }
              },
              required: ['name','label','bbox']
            }
          }
        },
        required: ['fields']
      }
    };

    // Ask GPT to extract fields
    const chat = await openai.chat.completions.create({
      model:          'gpt-4o-mini',
      messages:       [
        { role: 'system', content: 'You are a form-parsing assistant.' },
        { role: 'user',   content: imgB64 }
      ],
      functions:      [fnSpec],
      function_call:  { name: 'extractFormFields' }
    });

    // Coerce everything into numbers & strings
    const raw    = JSON.parse(chat.choices[0].message.function_call!.arguments);
    const fields = raw.fields.map((f: any) => ({
      name:  String(f.name),
      label: String(f.label),
      bbox: {
        x:      Number(f.bbox.x),
        y:      Number(f.bbox.y),
        width:  Number(f.bbox.width),
        height: Number(f.bbox.height),
      }
    }));

    console.log('📝 Fields:', fields);
    res.json({ fields });
  } catch (err: any) {
    console.error('❌ /api/parse-form-image', err);
    res.status(500).json({ error: 'Failed to parse form image' });
  } finally {
    fs.unlinkSync(file.path);
  }
});

////////////////////////////////////////////////////////////////////////////////
// 4) FILL PDF → embed image or wrap + draw text (with list fallback)
////////////////////////////////////////////////////////////////////////////////

app.post('/api/fill-pdf', async (req, res) => {
  interface Field {
    name: string;
    label: string;
    bbox:  { x:number; y:number; width:number; height:number };
    value: string;
  }
  const { templateBase64, imageWidth, imageHeight, fields } = req.body as {
    templateBase64: string;
    imageWidth:     number;
    imageHeight:    number;
    fields:         Field[];
  };

  let iw = imageWidth, ih = imageHeight;

  console.log('🔧 /api/fill-pdf payload:', { imageWidth, imageHeight, totalFields: fields.length });
  console.log('🔧 Raw field bboxes:', fields.map(f => f.bbox));
  try {
    let pdfDoc: PDFDocument;

    // If your input was already a PDF…
    if (templateBase64.trimStart().startsWith('%PDF')) {
      pdfDoc = await PDFDocument.load(Buffer.from(templateBase64, 'base64'));
    } else {
      // Otherwise build a new PDF & embed your form image onto it
      pdfDoc = await PDFDocument.create();
      const raw = Buffer.from(templateBase64, 'base64');
      let img;
      try {
        img = await pdfDoc.embedJpg(raw);
      } catch {
        img = await pdfDoc.embedPng(raw);
      }
      iw = img.width;
      ih = img.height;
      const page = pdfDoc.addPage([iw, ih]);
      page.drawImage(img, { x: 0, y: 0, width: iw, height: ih });
    }

    // Now draw each field …
    const page       = pdfDoc.getPage(0);
    const { width, height } = page.getSize();
    const scaleX     = width  / iw;
    const scaleY     = height / ih;
    const font       = await pdfDoc.embedFont(StandardFonts.Helvetica);

    // Debug: compute and log each field's pixel coordinates
    fields.forEach(f => {
      const x = f.bbox.x * (page.getSize().width  / iw) + 2;
      const y = page.getSize().height - f.bbox.y * (page.getSize().height / ih) - 12;
      console.log(`🔍 Field "${f.name}" raw bbox=${JSON.stringify(f.bbox)}, computed x=${x}, y=${y}`);
    });

    // Filter out any bad coords
    const valid = fields.filter(f => {
      const x = f.bbox.x * scaleX + 2;
      const y = height - f.bbox.y * scaleY - 12;
      return isFinite(x) && isFinite(y);
    });
    console.log(`✅ Valid fields (coords in-bounds): ${valid.length} of ${fields.length}`);

    if (valid.length > 0) {
      for (const f of valid) {
        const x = f.bbox.x * scaleX + 2;
        const y = height - f.bbox.y * scaleY - 12;
        page.drawText(f.value || f.label, {
          x, y,
          size:     12,
          font,
          color:    rgb(0,0,0),
          maxWidth: f.bbox.width * scaleX - 4
        });
      }
    } else {
      console.warn('All coords invalid, falling back to list mode');
      // List everything at the top
      let cursorY = height - 20;
      for (const f of fields) {
        const text = `${f.label}: ${f.value || ''}`;
        page.drawText(text, { x:10, y:cursorY, size:12, font, color:rgb(0,0,0) });
        cursorY -= 14;
      }
    }

    const pdfBytes = await pdfDoc.save();
    res.json({ pdfBase64: Buffer.from(pdfBytes).toString('base64') });

  } catch (err: any) {
    console.error('❌ /api/fill-pdf', err);
    res.status(500).json({ error: 'Failed to fill PDF' });
  }
});

////////////////////////////////////////////////////////////////////////////////
// Start server
////////////////////////////////////////////////////////////////////////////////

app.listen(PORT, () => {
  console.log(`🚀 Server listening at http://localhost:${PORT}`);
});