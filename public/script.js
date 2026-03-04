/* ───────────────────────────  LinguaAI — Script  ─────────────────────────── */

(() => {
    'use strict';

    // ── Language list ──────────────────────────────────────────────────────────
    const LANGUAGES = [
        { code: 'auto', name: 'Auto-detect', sourceOnly: true },
        { code: 'en', name: 'English' },
        { code: 'es', name: 'Spanish' },
        { code: 'fr', name: 'French' },
        { code: 'de', name: 'German' },
        { code: 'it', name: 'Italian' },
        { code: 'pt', name: 'Portuguese' },
        { code: 'nl', name: 'Dutch' },
        { code: 'ru', name: 'Russian' },
        { code: 'zh', name: 'Chinese (Simplified)' },
        { code: 'zh-TW', name: 'Chinese (Traditional)' },
        { code: 'ja', name: 'Japanese' },
        { code: 'ko', name: 'Korean' },
        { code: 'ar', name: 'Arabic' },
        { code: 'hi', name: 'Hindi' },
        { code: 'bn', name: 'Bengali' },
        { code: 'tr', name: 'Turkish' },
        { code: 'pl', name: 'Polish' },
        { code: 'uk', name: 'Ukrainian' },
        { code: 'vi', name: 'Vietnamese' },
        { code: 'th', name: 'Thai' },
        { code: 'sv', name: 'Swedish' },
        { code: 'da', name: 'Danish' },
        { code: 'fi', name: 'Finnish' },
        { code: 'el', name: 'Greek' },
        { code: 'he', name: 'Hebrew' },
        { code: 'id', name: 'Indonesian' },
        { code: 'ms', name: 'Malay' },
        { code: 'mn', name: 'Mongolian' },
        { code: 'ro', name: 'Romanian' },
        { code: 'cs', name: 'Czech' },
        { code: 'hu', name: 'Hungarian' },
    ];

    // ── DOM refs ───────────────────────────────────────────────────────────────
    const $ = (sel) => document.querySelector(sel);
    const sourceLang = $('#sourceLang');
    const targetLang = $('#targetLang');
    const swapBtn = $('#swapBtn');
    const sourceText = $('#sourceText');
    const targetText = $('#targetText');
    const translateBtn = $('#translateBtn');
    const clearBtn = $('#clearBtn');
    const copyBtn = $('#copyBtn');
    const charCount = $('#charCount');
    const uploadZone = $('#uploadZone');
    const uploadBtn = $('#uploadBtn');
    const fileInput = $('#fileInput');
    const fileInfo = $('#fileInfo');
    const fileName = $('#fileName');
    const fileRemove = $('#fileRemove');
    const progressBar = $('#progressBar');
    const progressFill = $('#progressFill');
    const progressPercent = $('#progressPercent');
    const progressLabel = $('.progress-bar__label');

    // ── Initialise language dropdowns ──────────────────────────────────────────
    function populateLanguages() {
        LANGUAGES.forEach((lang) => {
            const srcOpt = document.createElement('option');
            srcOpt.value = lang.code;
            srcOpt.textContent = lang.name;
            sourceLang.appendChild(srcOpt);

            if (!lang.sourceOnly) {
                const tgtOpt = document.createElement('option');
                tgtOpt.value = lang.code;
                tgtOpt.textContent = lang.name;
                targetLang.appendChild(tgtOpt);
            }
        });

        sourceLang.value = 'auto';
        targetLang.value = 'mn';
    }

    // ── Progress bar controller ────────────────────────────────────────────────
    let progressInterval = null;
    let currentProgress = 0;

    function startProgress() {
        currentProgress = 0;
        progressBar.hidden = false;
        progressFill.style.width = '0%';
        progressPercent.textContent = '0%';
        progressLabel.textContent = 'Translating…';

        // Simulated progress: fast at first, slows down near 80%
        progressInterval = setInterval(() => {
            if (currentProgress < 30) {
                currentProgress += Math.random() * 8 + 3;
            } else if (currentProgress < 60) {
                currentProgress += Math.random() * 4 + 1;
            } else if (currentProgress < 85) {
                currentProgress += Math.random() * 1.5 + 0.3;
            } else if (currentProgress < 92) {
                currentProgress += Math.random() * 0.5 + 0.1;
            }
            // Never exceeds 92 until the actual response arrives
            currentProgress = Math.min(currentProgress, 92);
            setProgress(currentProgress);
        }, 200);
    }

    function setProgress(value) {
        const p = Math.min(Math.round(value), 100);
        progressFill.style.width = p + '%';
        progressPercent.textContent = p + '%';
    }

    function completeProgress() {
        clearInterval(progressInterval);
        progressLabel.textContent = 'Complete!';
        setProgress(100);

        setTimeout(() => {
            progressBar.hidden = true;
            progressFill.style.width = '0%';
            currentProgress = 0;
        }, 800);
    }

    function cancelProgress() {
        clearInterval(progressInterval);
        progressBar.hidden = true;
        progressFill.style.width = '0%';
        currentProgress = 0;
    }

    // ── Toast notifications ────────────────────────────────────────────────────
    let toastEl = null;
    let toastTimer = null;

    function toast(message, type = '') {
        if (!toastEl) {
            toastEl = document.createElement('div');
            toastEl.className = 'toast';
            document.body.appendChild(toastEl);
        }

        clearTimeout(toastTimer);
        toastEl.textContent = message;
        toastEl.className = 'toast ' + type;
        void toastEl.offsetWidth;
        toastEl.classList.add('show');

        toastTimer = setTimeout(() => {
            toastEl.classList.remove('show');
        }, 3000);
    }

    // ── File upload ────────────────────────────────────────────────────────────
    async function handleFileUpload(file) {
        if (!file) return;

        const allowed = [
            'application/pdf',
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        ];
        if (!allowed.includes(file.type)) {
            toast('Only PDF and DOCX files are supported.', 'error');
            return;
        }

        const formData = new FormData();
        formData.append('file', file);

        uploadBtn.disabled = true;
        uploadBtn.textContent = 'Reading…';

        try {
            const res = await fetch('/api/upload', {
                method: 'POST',
                body: formData,
            });

            const data = await res.json();

            if (!res.ok) {
                throw new Error(data.error || 'Upload failed.');
            }

            sourceText.value = data.text;
            updateCharCount();

            fileName.textContent = data.filename || file.name;
            fileInfo.hidden = false;

            toast('File text extracted!', 'success');
        } catch (err) {
            toast(err.message, 'error');
        } finally {
            uploadBtn.disabled = false;
            uploadBtn.innerHTML = `
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"
                  stroke-linecap="round" stroke-linejoin="round">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <polyline points="17 8 12 3 7 8" />
                  <line x1="12" y1="3" x2="12" y2="15" />
                </svg>
                Upload PDF / DOCX`;
        }
    }

    function clearFileState() {
        fileInput.value = '';
        fileInfo.hidden = true;
        fileName.textContent = '';
    }

    // ── Translation (calls our backend) ────────────────────────────────────────
    async function translateText() {
        const text = sourceText.value.trim();
        if (!text) {
            toast('Enter some text to translate.', 'error');
            sourceText.focus();
            return;
        }

        const srcLang = sourceLang.value;
        const tgtLang = targetLang.value;
        const tgtName = LANGUAGES.find((l) => l.code === tgtLang)?.name || tgtLang;
        const srcName = srcLang === 'auto'
            ? 'the auto-detected language'
            : (LANGUAGES.find((l) => l.code === srcLang)?.name || srcLang);

        // UI → loading state
        translateBtn.classList.add('loading');
        targetText.innerHTML = '<span class="panel__placeholder">Translating…</span>';
        startProgress();

        try {
            const res = await fetch('/api/translate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    text,
                    sourceLang: srcName,
                    targetLang: tgtName,
                }),
            });

            const data = await res.json();

            if (!res.ok) {
                throw new Error(data.error || `Server error ${res.status}`);
            }

            if (data.translation) {
                completeProgress();
                targetText.textContent = data.translation;
            } else {
                throw new Error('No translation returned');
            }
        } catch (err) {
            cancelProgress();
            targetText.innerHTML = `<span class="panel__placeholder">${escapeHtml(err.message)}</span>`;
            toast(err.message, 'error');
        } finally {
            translateBtn.classList.remove('loading');
        }
    }

    // ── Helpers ────────────────────────────────────────────────────────────────
    function escapeHtml(str) {
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }

    function swapLanguages() {
        const src = sourceLang.value;
        const tgt = targetLang.value;

        if (src === 'auto') {
            toast('Cannot swap when source is Auto-detect', 'error');
            return;
        }

        sourceLang.value = tgt;
        targetLang.value = src;

        const srcText = sourceText.value;
        const tgtText = targetText.textContent;
        const placeholder = targetText.querySelector('.panel__placeholder');

        if (!placeholder && tgtText) {
            sourceText.value = tgtText;
            targetText.textContent = srcText;
            updateCharCount();
        }
    }

    function updateCharCount() {
        charCount.textContent = sourceText.value.length.toLocaleString();
    }

    function clearSource() {
        sourceText.value = '';
        targetText.innerHTML = '<span class="panel__placeholder">Translation will appear here…</span>';
        updateCharCount();
        clearFileState();
        sourceText.focus();
    }

    async function copyTranslation() {
        const placeholder = targetText.querySelector('.panel__placeholder');
        if (placeholder) return;

        try {
            await navigator.clipboard.writeText(targetText.textContent);
            toast('Copied to clipboard!', 'success');
        } catch {
            toast('Failed to copy', 'error');
        }
    }

    // ── Event listeners ────────────────────────────────────────────────────────
    swapBtn.addEventListener('click', swapLanguages);
    translateBtn.addEventListener('click', translateText);
    clearBtn.addEventListener('click', clearSource);
    copyBtn.addEventListener('click', copyTranslation);
    sourceText.addEventListener('input', updateCharCount);

    // File upload events
    uploadBtn.addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', () => {
        if (fileInput.files[0]) handleFileUpload(fileInput.files[0]);
    });
    fileRemove.addEventListener('click', () => {
        clearFileState();
        sourceText.value = '';
        updateCharCount();
    });

    // Drag and drop
    ['dragenter', 'dragover'].forEach((evt) => {
        uploadZone.addEventListener(evt, (e) => {
            e.preventDefault();
            uploadZone.classList.add('drag-over');
        });
    });
    ['dragleave', 'drop'].forEach((evt) => {
        uploadZone.addEventListener(evt, () => {
            uploadZone.classList.remove('drag-over');
        });
    });
    uploadZone.addEventListener('drop', (e) => {
        e.preventDefault();
        const file = e.dataTransfer.files[0];
        if (file) handleFileUpload(file);
    });

    document.addEventListener('keydown', (e) => {
        if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
            e.preventDefault();
            translateText();
        }
    });

    // ── Boot ───────────────────────────────────────────────────────────────────
    populateLanguages();
})();
