/* ───────────────────────────  LinguaAI — Server  ─────────────────────────── */

const express = require('express');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const { PDFParse } = require('pdf-parse');
const mammoth = require('mammoth');

// ── Load .env manually (no dotenv dependency) ────────────────────────────────
function loadEnv() {
    try {
        const envPath = path.join(__dirname, '.env');
        const content = fs.readFileSync(envPath, 'utf-8');
        for (const line of content.split('\n')) {
            const trimmed = line.trim();
            if (!trimmed || trimmed.startsWith('#')) continue;
            const eqIndex = trimmed.indexOf('=');
            if (eqIndex === -1) continue;
            const key = trimmed.slice(0, eqIndex).trim();
            const value = trimmed.slice(eqIndex + 1).trim();
            if (!process.env[key]) {
                process.env[key] = value;
            }
        }
    } catch {
        // .env file is optional
    }
}
loadEnv();

const app = express();
const PORT = process.env.PORT || 3000;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

// ── Multer setup (in-memory, 10 MB limit) ────────────────────────────────────
const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 10 * 1024 * 1024 },
    fileFilter: (_req, file, cb) => {
        const allowed = [
            'application/pdf',
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        ];
        if (allowed.includes(file.mimetype)) {
            cb(null, true);
        } else {
            cb(new Error('Only PDF and DOCX files are supported.'));
        }
    },
});

if (!OPENAI_API_KEY || OPENAI_API_KEY === 'your-openai-key-here') {
    console.error('\n⚠️  Please set your OpenAI API key in the .env file!\n');
}

// ── Middleware ────────────────────────────────────────────────────────────────
app.use(express.json({ limit: '5mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// ── Constants ────────────────────────────────────────────────────────────────
const CHUNK_SIZE = 4000;  // max characters per chunk sent to OpenAI

// ── System prompt (shared across all translation calls) ──────────────────────
const SYSTEM_PROMPT = [
    'You are an expert human translator with native fluency in any language.',
    'Your goal is not word-for-word translation, but meaning-for-meaning translation.',
    '',
    'When translating, follow these rules:',
    '- Preserve the original tone, register, and emotional intent (formal, casual, sarcastic, poetic, etc.)',
    '- Use vocabulary and phrasing that a native speaker of the target language would naturally say — avoid calques (word-for-word structures borrowed from the source language)',
    '- Adapt idioms, proverbs, and culturally specific references into equivalent expressions in the target language rather than translating them literally',
    '- Maintain consistency in character voices, terminology, and named concepts throughout the text',
    '- If a word or phrase has no clean equivalent, choose the closest natural option and add a brief translator\'s note in brackets explaining your choice',
    '- Never sacrifice naturalness for literalness unless the literal phrasing is intentional (e.g. poetry, wordplay)',
    '- Preserve the original formatting and paragraph structure',
    '- The input text may contain formatting artifacts from copy-pasting (random line breaks, extra spaces, broken words). Intelligently reconstruct the original meaning before translating.',
    '- Return ONLY the translated text, nothing else (except translator\'s notes in brackets when needed)',
].join('\n');

// ── Chunking helper — splits text at paragraph boundaries ────────────────────
function splitIntoChunks(text, maxLen = CHUNK_SIZE) {
    if (text.length <= maxLen) return [text];

    const chunks = [];
    const paragraphs = text.split(/\n\n+/);
    let current = '';

    for (const para of paragraphs) {
        // If a single paragraph is itself too long, hard-split it by sentences
        if (para.length > maxLen) {
            if (current) { chunks.push(current.trim()); current = ''; }
            const sentences = para.match(/[^.!?]+[.!?]+[\s]*/g) || [para];
            for (const sentence of sentences) {
                if ((current + sentence).length > maxLen && current) {
                    chunks.push(current.trim());
                    current = '';
                }
                current += sentence;
            }
            continue;
        }

        const combined = current ? current + '\n\n' + para : para;
        if (combined.length > maxLen && current) {
            chunks.push(current.trim());
            current = para;
        } else {
            current = combined;
        }
    }
    if (current.trim()) chunks.push(current.trim());
    return chunks;
}

// ── Call OpenAI for a single piece of text ───────────────────────────────────
async function translateChunk(text, targetLang) {
    const userPrompt = `First, automatically detect the language of the following text. Then translate it into ${targetLang}.\n\n${text}`;

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${OPENAI_API_KEY}`,
        },
        body: JSON.stringify({
            model: 'gpt-4o-mini',
            messages: [
                { role: 'system', content: SYSTEM_PROMPT },
                { role: 'user', content: userPrompt },
            ],
            temperature: 0.3,
        }),
    });

    if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        const message = err?.error?.message || `OpenAI API error ${response.status}`;
        throw new Error(message);
    }

    const data = await response.json();
    const translation = data.choices?.[0]?.message?.content?.trim();
    if (!translation) throw new Error('No translation received from OpenAI.');
    return translation;
}

// ── Translation endpoint ─────────────────────────────────────────────────────
app.post('/api/translate', async (req, res) => {
    try {
        if (!OPENAI_API_KEY || OPENAI_API_KEY === 'your-openai-key-here') {
            return res.status(500).json({ error: 'Server API key not configured. Check .env file.' });
        }

        const { text: rawText, sourceLang, targetLang } = req.body;

        if (!rawText || !targetLang) {
            return res.status(400).json({ error: 'Missing required fields: text, targetLang' });
        }

        // Clean up messy copy-pasted text
        const text = rawText
            .replace(/\r\n/g, '\n')
            .replace(/[ \t]+/g, ' ')
            .replace(/ ?\n ?/g, '\n')
            .replace(/([^\n])\n([^\n])/g, '$1 $2')
            .replace(/\n{3,}/g, '\n\n')
            .trim();

        // Split into chunks and translate each
        const chunks = splitIntoChunks(text);
        console.log(`Translating ${text.length} chars in ${chunks.length} chunk(s)…`);

        const translated = [];
        for (const chunk of chunks) {
            const result = await translateChunk(chunk, targetLang);
            translated.push(result);
        }

        res.json({ translation: translated.join('\n\n') });
    } catch (err) {
        console.error('Translation error:', err);
        const status = err.message?.includes('API error') ? 502 : 500;
        res.json({ error: err.message || 'Internal server error' });
    }
});

// ── File upload endpoint ─────────────────────────────────────────────────────
app.post('/api/upload', (req, res) => {
    upload.single('file')(req, res, async (err) => {
        try {
            if (err) {
                const message = err.code === 'LIMIT_FILE_SIZE'
                    ? 'File too large. Maximum size is 10 MB.'
                    : err.message || 'Upload failed.';
                return res.status(400).json({ error: message });
            }

            if (!req.file) {
                return res.status(400).json({ error: 'No file uploaded.' });
            }

            const { buffer, mimetype, originalname } = req.file;
            let text = '';

            if (mimetype === 'application/pdf') {
                const parser = new PDFParse({ data: buffer });
                const result = await parser.getText();
                text = result.text;
                await parser.destroy();
            } else if (
                mimetype === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
            ) {
                const result = await mammoth.extractRawText({ buffer });
                text = result.value;
            }

            text = text.trim();
            if (!text) {
                return res.status(400).json({ error: 'No readable text found in the file.' });
            }

            res.json({ text, filename: originalname });
        } catch (uploadErr) {
            console.error('File processing error:', uploadErr);
            res.status(500).json({ error: 'Failed to extract text from the file.' });
        }
    });
});

// ── Start ────────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
    console.log(`\n🌐 LinguaAI running at http://localhost:${PORT}\n`);
});
