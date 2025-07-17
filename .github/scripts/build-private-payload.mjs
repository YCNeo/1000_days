#!/usr/bin/env node
/**
 * build-private-payload.mjs
 *
 * Reads private content (auth.json, content.json, card.html, assets/img/*),
 * builds encrypted bundle for RR-only access.
 *
 * Output: site/private.enc.json  (single JSON file)
 *
 * Security Level B2: images embedded (base64 data) inside payload.
 */

import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ---------- CONFIG FROM ENV OR DEFAULTS ----------
const PRIVATE_DIR = process.env.PRIVATE_DIR || path.resolve(__dirname, '../../..', 'private-content');
const PUBLIC_SITE_DIR = process.env.PUBLIC_SITE_DIR || path.resolve(__dirname, '../../..', 'site');
const PAYLOAD_OUT = path.join(PUBLIC_SITE_DIR, 'private.enc.json');

// PBKDF2 iterations (adjust for perf)
const PBKDF2_ITER = parseInt(process.env.PBKDF2_ITER || '250000', 10); // 250k
const PBKDF2_KEYBYTES = 32; // 256-bit
const MASTER_KEY_BYTES = 32; // Kp length
const SALT_BYTES = 16;
const IV_BYTES = 12;

// normalization: same as front-end must do
function normalizeAnswer(s) {
    if (!s) return '';
    // drop spaces (any whitespace + fullwidth)
    let out = s.replace(/\s+/g, '');
    // drop common punctuation separators
    out = out.replace(/[-_./:：;；,，]/g, '');
    // lower-case
    out = out.toLowerCase();
    return out;
}

// pbkdf2 -> key Buffer
function deriveKey(answerNorm, salt) {
    return crypto.pbkdf2Sync(answerNorm, salt, PBKDF2_ITER, PBKDF2_KEYBYTES, 'sha256');
}

async function aesGcmEncryptRaw(keyBuf, plaintextBuf) {
    const iv = crypto.randomBytes(IV_BYTES);
    const key = await crypto.webcrypto.subtle.importKey('raw', keyBuf, 'AES-GCM', false, ['encrypt']);
    const ct = Buffer.from(await crypto.webcrypto.subtle.encrypt({
        name: 'AES-GCM',
        iv
    }, key, plaintextBuf));
    return { iv, ct };
}

async function aesGcmDecryptRaw(keyBuf, iv, ctBuf) {
    const key = await crypto.webcrypto.subtle.importKey('raw', keyBuf, 'AES-GCM', false, ['decrypt']);
    const pt = Buffer.from(await crypto.webcrypto.subtle.decrypt({
        name: 'AES-GCM',
        iv
    }, key, ctBuf));
    return pt;
}

function b64(buf) { return Buffer.from(buf).toString('base64'); }

// read file safe
async function readIfExists(p) { try { return await fs.readFile(p); } catch { return null; } }

// read JSON
async function readJSON(p) {
    const raw = await fs.readFile(p, 'utf8');
    return JSON.parse(raw);
}

// read private images => base64 dataURL map
async function readPrivateImages(imgDir) {
    const out = {};
    let entries;
    try {
        entries = await fs.readdir(imgDir, { withFileTypes: true });
    } catch {
        return out;
    }
    for (const ent of entries) {
        if (!ent.isFile()) continue;
        const fp = path.join(imgDir, ent.name);
        const buf = await fs.readFile(fp);
        // naive mime detect
        let mime = 'image/jpeg';
        if (ent.name.endsWith('.png')) mime = 'image/png';
        else if (ent.name.endsWith('.webp')) mime = 'image/webp';
        out[ent.name] = `data:${mime};base64,${b64(buf)}`;
    }
    return out;
}

async function main() {
    console.log('[build-private-payload] PRIVATE_DIR =', PRIVATE_DIR);
    console.log('[build-private-payload] PUBLIC_SITE_DIR =', PUBLIC_SITE_DIR);

    // read auth
    const auth = await readJSON(path.join(PRIVATE_DIR, 'auth.json'));
    const question = auth.question || '請輸入密碼';
    const ttlMinutes = auth.ttl_minutes ?? 15;
    const answers = Array.isArray(auth.answers) ? auth.answers : [];
    if (!answers.length) {
        throw new Error('auth.json: answers[] empty');
    }

    // read content & card
    const contentJson = await readJSON(path.join(PRIVATE_DIR, 'content.json'));
    const cardHtml = await fs.readFile(path.join(PRIVATE_DIR, 'card.html'), 'utf8');

    // images
    const images = await readPrivateImages(path.join(PRIVATE_DIR, 'assets', 'img'));

    // payload object
    const payloadObj = {
        version: 1,
        content: contentJson,
        card_html: cardHtml,
        images
    };
    const payloadBuf = Buffer.from(JSON.stringify(payloadObj), 'utf8');

    // master key
    const masterKey = crypto.randomBytes(MASTER_KEY_BYTES);
    // encrypt payload with master key
    const { iv: payloadIv, ct: payloadCt } = await aesGcmEncryptRaw(masterKey, payloadBuf);

    // global salt for pbkdf2
    const salt = crypto.randomBytes(SALT_BYTES);

    // envelopes: wrap master key w/ each answer
    const envelopes = [];
    for (const ans of answers) {
        const norm = normalizeAnswer(ans);
        const keyA = deriveKey(norm, salt);
        const { iv, ct } = await aesGcmEncryptRaw(keyA, masterKey);
        envelopes.push({ iv: b64(iv), data: b64(ct) });
    }

    // final out structure
    const out = {
        v: 1,
        question,
        ttl_ms: ttlMinutes * 60 * 1000,
        pbkdf2_iter: PBKDF2_ITER,
        salt: b64(salt),
        envelopes,
        payload: { iv: b64(payloadIv), data: b64(payloadCt) }
    };

    await fs.writeFile(PAYLOAD_OUT, JSON.stringify(out), 'utf8');
    console.log('[build-private-payload] wrote', PAYLOAD_OUT);
}

main().catch(err => { console.error(err); process.exit(1); });
