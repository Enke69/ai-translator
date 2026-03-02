/* ─────────────────────────── LinguaAI — Stress Test ─────────────────────────
 *  Tests character limits on the /api/translate and /api/upload endpoints.
 *  Run:  node stress-test.js            (server must be running on port 3000)
 * ────────────────────────────────────────────────────────────────────────── */

const BASE = 'http://localhost:3000';

// ── Test sizes (in characters) ───────────────────────────────────────────────
const TEXT_SIZES = [
    { label: '100 chars', chars: 100 },
    { label: '1,000 chars', chars: 1_000 },
    { label: '5,000 chars', chars: 5_000 },
    { label: '10,000 chars', chars: 10_000 },
    { label: '50,000 chars', chars: 50_000 },
    { label: '100,000 chars', chars: 100_000 },   // ~100 KB — near express.json() default limit
    { label: '150,000 chars', chars: 150_000 },   // over default 100 KB limit
    { label: '500,000 chars', chars: 500_000 },   // ~500 KB
    { label: '1,000,000 chars', chars: 1_000_000 }, // ~1 MB
];

// ── Helper to build a realistic-looking text payload ─────────────────────────
function generateText(charCount) {
    const sentence = 'The quick brown fox jumps over the lazy dog. ';
    const repeats = Math.ceil(charCount / sentence.length);
    return sentence.repeat(repeats).slice(0, charCount);
}

// ── Pretty result logger ─────────────────────────────────────────────────────
function logResult(label, status, ok, bodySnippet, timeMs) {
    const icon = ok ? '✅' : '❌';
    const statusStr = String(status).padStart(3);
    const timeStr = `${timeMs}ms`.padStart(8);
    const snippet = bodySnippet.length > 100
        ? bodySnippet.slice(0, 100) + '…'
        : bodySnippet;
    console.log(`  ${icon}  ${label.padEnd(22)}  HTTP ${statusStr}  ${timeStr}  ${snippet}`);
}

// ── Run a single translate test ──────────────────────────────────────────────
async function testTranslate(label, text) {
    const payload = JSON.stringify({
        text,
        sourceLang: 'English',
        targetLang: 'Spanish',
    });

    const payloadKB = (Buffer.byteLength(payload) / 1024).toFixed(1);

    const start = Date.now();
    try {
        const res = await fetch(`${BASE}/api/translate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: payload,
        });

        const body = await res.text();
        const elapsed = Date.now() - start;

        logResult(
            `${label} (${payloadKB} KB)`,
            res.status,
            res.ok,
            body,
            elapsed,
        );

        return { label, status: res.status, ok: res.ok, body, payloadKB, elapsed };
    } catch (err) {
        const elapsed = Date.now() - start;
        logResult(`${label} (${payloadKB} KB)`, 'ERR', false, err.message, elapsed);
        return { label, status: 'ERR', ok: false, body: err.message, payloadKB, elapsed };
    }
}

// ── Test the JSON body-size limit specifically ───────────────────────────────
async function testBodySizeLimit() {
    console.log('\n╔══════════════════════════════════════════════════════════════╗');
    console.log('║              STRESS TEST: JSON Body Size Limit              ║');
    console.log('╠══════════════════════════════════════════════════════════════╣');
    console.log('║  express.json() defaults to 100 KB. Testing around that.    ║');
    console.log('╚══════════════════════════════════════════════════════════════╝\n');

    const results = [];
    for (const { label, chars } of TEXT_SIZES) {
        const text = generateText(chars);
        const result = await testTranslate(label, text);
        results.push(result);

        // Small delay between requests to avoid rate limiting
        await new Promise((r) => setTimeout(r, 300));
    }

    return results;
}

// ── Test empty / edge cases ──────────────────────────────────────────────────
async function testEdgeCases() {
    console.log('\n╔══════════════════════════════════════════════════════════════╗');
    console.log('║              STRESS TEST: Edge Cases                        ║');
    console.log('╚══════════════════════════════════════════════════════════════╝\n');

    // Empty text
    await testTranslate('empty text', '');

    // Missing targetLang
    const start = Date.now();
    try {
        const res = await fetch(`${BASE}/api/translate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text: 'hello' }),
        });
        const body = await res.text();
        logResult('no targetLang', res.status, res.ok, body, Date.now() - start);
    } catch (err) {
        logResult('no targetLang', 'ERR', false, err.message, Date.now() - start);
    }

    // Unicode heavy text (multi-byte characters)
    const unicodeText = '你好世界！'.repeat(20_000); // ~100K chars of 3-byte UTF-8
    await testTranslate('unicode heavy (100K)', unicodeText);
}

// ── Upload endpoint tests ────────────────────────────────────────────────────
async function testUploadLimits() {
    console.log('\n╔══════════════════════════════════════════════════════════════╗');
    console.log('║              STRESS TEST: File Upload Limits                ║');
    console.log('╠══════════════════════════════════════════════════════════════╣');
    console.log('║  Multer is configured for 10 MB max file size.              ║');
    console.log('╚══════════════════════════════════════════════════════════════╝\n');

    // Test with a non-PDF/DOCX file type
    {
        const blob = new Blob(['hello world'], { type: 'text/plain' });
        const form = new FormData();
        form.append('file', blob, 'test.txt');

        const start = Date.now();
        const res = await fetch(`${BASE}/api/upload`, { method: 'POST', body: form });
        const body = await res.text();
        logResult('wrong file type (.txt)', res.status, res.ok, body, Date.now() - start);
    }

    // Test with no file at all
    {
        const form = new FormData();
        const start = Date.now();
        const res = await fetch(`${BASE}/api/upload`, { method: 'POST', body: form });
        const body = await res.text();
        logResult('no file attached', res.status, res.ok, body, Date.now() - start);
    }
}

// ── Summary ──────────────────────────────────────────────────────────────────
function printSummary(results) {
    console.log('\n╔══════════════════════════════════════════════════════════════╗');
    console.log('║                        SUMMARY                              ║');
    console.log('╚══════════════════════════════════════════════════════════════╝\n');

    const firstFailure = results.find((r) => !r.ok);
    const lastSuccess = [...results].reverse().find((r) => r.ok);

    if (firstFailure) {
        console.log(`  ⚠️  FIRST FAILURE at: ${firstFailure.label} (payload: ${firstFailure.payloadKB} KB)`);
        console.log(`      HTTP status: ${firstFailure.status}`);
        const errSnippet = firstFailure.body.length > 200
            ? firstFailure.body.slice(0, 200) + '…'
            : firstFailure.body;
        console.log(`      Response: ${errSnippet}`);
    } else {
        console.log('  ✅  All tests passed!');
    }

    if (lastSuccess) {
        console.log(`\n  ✅  LARGEST SUCCESS: ${lastSuccess.label} (payload: ${lastSuccess.payloadKB} KB)`);
    }

    // Recommendation
    console.log('\n  ── Recommendations ──');
    if (firstFailure && firstFailure.body.includes('entity too large')) {
        console.log('  💡  The express.json() middleware has a default 100 KB limit.');
        console.log('      Fix: app.use(express.json({ limit: "5mb" })) in server.js');
    }
    if (firstFailure && (firstFailure.body.includes('max_tokens') || firstFailure.body.includes('context_length'))) {
        console.log('  💡  The text exceeds the OpenAI model context window.');
        console.log('      Fix: Add chunking logic to split large texts before sending to OpenAI.');
    }
    console.log('');
}

// ── Main ─────────────────────────────────────────────────────────────────────
async function main() {
    console.log('');
    console.log('═══════════════════════════════════════════════════════════════');
    console.log('            LinguaAI — Character Limit Stress Test            ');
    console.log('═══════════════════════════════════════════════════════════════');

    // 1. Quick health check
    console.log('\n🔍 Checking server is reachable...');
    try {
        const res = await fetch(BASE);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        console.log('   Server is up! ✅\n');
    } catch (err) {
        console.error(`   ❌ Cannot reach ${BASE}: ${err.message}`);
        console.error('   Make sure the server is running (npm start)\n');
        process.exit(1);
    }

    // 2. JSON body-size tests
    const results = await testBodySizeLimit();

    // 3. Edge cases
    await testEdgeCases();

    // 4. File upload tests
    await testUploadLimits();

    // 5. Summary
    printSummary(results);
}

main().catch(console.error);
