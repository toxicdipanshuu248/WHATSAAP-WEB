// ============================================================
// DEV WP FYT SYSTEM v4 — MULTI-SESSION WhatsApp panel (Baileys 7)
// • unlimited sessions (jitne chahe bots) — auto-restore on start
// • pairing: get code → enter on phone → login
// • GC LINK SYSTEM (raid-style): invite link → check → join
// • anti-crash + auto-reboot + loop watchdog
// ============================================================
import makeWASocket, { useMultiFileAuthState, DisconnectReason, Browsers, fetchLatestBaileysVersion, makeCacheableSignalKeyStore } from '@whiskeysockets/baileys';
import { Boom } from '@hapi/boom';
import pino from 'pino';
import express from 'express';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 3000);
const DATA_DIR = path.join(__dirname, 'data');
const SESS_FILE = path.join(DATA_DIR, 'sessions.json');
const logger = pino({ level: 'silent' });
const BRAND = 'ᚔ᚜ 𓆩『𓍼ֶָ֢˖ ࣪ꨄ𝐃⃝𝛆 𝐖𝐏 𝐅𝐘𝐓 𝐒𝐘𝐒𝐓𝐄𝐌 .་༘࿐』𓆪 ᚛ᚔ🐉';

const delayMs = (ms) => new Promise(r => setTimeout(r, ms));
const rnd = (a, b) => { const lo = Math.max(0, Math.floor(Number(a) || 0)); const hi = Math.max(lo + 1, Math.floor(Number(b) || lo + 1)); return lo + Math.floor(Math.random() * (hi - lo + 1)); };
const cleanPhone = (p) => { let d = String(p || '').replace(/\D/g, ''); if (d.startsWith('0')) d = d.slice(1); if (d.length === 10) d = '91' + d; return d; };
const jidFromNumber = (n) => { const d = cleanPhone(n); return d ? `${d}@s.whatsapp.net` : null; };
const digits = (j) => String(j || '').split('@')[0].replace(/\D/g, '');
const jidEq = (a, b) => a && b && digits(a) === digits(b);
const isGrp = (j) => String(j || '').endsWith('@g.us');
const cut = (t, n = 180) => { const a = Array.from(String(t || '')); return a.length > n ? a.slice(0, n).join('') : String(t || ''); };
const inviteCode = (link) => { const m = String(link || '').match(/chat\.whatsapp\.com\/([A-Za-z0-9_-]{10,})/i); if (m) return m[1]; const t = String(link || '').trim(); return /^[A-Za-z0-9_-]{10,32}$/.test(t) && !/^\d{5,20}$/.test(t) ? t : null; };

// ---------------- state ----------------
const S = { sessions: {}, // id -> session
    selected: null, loops: {}, logs: [], engineRestarts: 0 };
const setPhase = (s, p) => { s.phase = p; s.phaseAt = Date.now(); };
const log = (tag, kind, msg) => { S.logs.unshift({ t: Date.now(), tag: tag || 'sys', kind, msg: String(msg).slice(0, 240) }); if (S.logs.length > 120) S.logs.length = 120; try { console.log(`[${tag}] ${msg}`); } catch (e) {} };

fs.mkdirSync(DATA_DIR, { recursive: true });
const saveSessions = () => { try { fs.writeFileSync(SESS_FILE, JSON.stringify(Object.values(S.sessions).map(s => ({ id: s.id, name: s.name })), null, 2)); } catch (e) {} };
const loadSessions = () => { try { return JSON.parse(fs.readFileSync(SESS_FILE, 'utf8') || '[]'); } catch (e) { return []; } };

// crash guards
process.on('uncaughtException', (e) => { try { log('sys', 'err', '[CRASH-GUARD] ' + String(e?.stack || e?.message || e).slice(0, 220)); } catch (_) {} });
process.on('unhandledRejection', (r) => { try { log('sys', 'warn', '[CRASH-GUARD] ' + String(r?.message || r).slice(0, 160)); } catch (_) {} });

// ==================== SESSION CORE ====================
function newSession(id, name) {
    const s = {
        id, name: name || 'Bot', sock: null, sockRef: false, manualStop: false,
        authDir: path.join(DATA_DIR, 'auth', id),
        phase: 'idle', phaseAt: Date.now(), connected: false, jid: null, number: null,
        code: null, pairPhone: null, lastError: null, reconnectCount: 0, uptimeAt: null,
        groups: [], groupsLoadedAt: 0, created: Date.now()
    };
    S.sessions[id] = s;
    if (!S.selected) S.selected = id;
    saveSessions();
    return s;
}
async function ensureAuthDir(s) { fs.mkdirSync(s.authDir, { recursive: true }); }
function hardReset(s, reason) { log(s.id, 'warn', `♻️ AUTO-REBOOT → ${reason}`); S.engineRestarts++; stopLoops(s.id); try { s.sock?.end(new Error('reboot ' + reason)); } catch (e) {} s.sock = null; s.sockRef = false; s.connected = false; if (s.phase === 'open') setPhase(s, 'retrying'); setTimeout(() => { if (!s.manualStop && !s.destroyed) connectWA(s).catch(() => {}); }, 2500); }

async function connectWA(s) {
    if (s.sockRef || s.manualStop || s.destroyed) return;
    s.sockRef = true;
    setPhase(s, 'connecting');
    log(s.id, 'sys', `engine starting (${s.name})...`);
    try {
        await ensureAuthDir(s);
        const { state, saveCreds } = await useMultiFileAuthState(s.authDir);
        let version; try { version = (await fetchLatestBaileysVersion()).version; } catch (e) { version = undefined; }
        const uid = `DEV-FYT-${s.id}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
        s.sock = makeWASocket({
            version,
            auth: { creds: state.creds, keys: makeCacheableSignalKeyStore(state.keys, logger) },
            logger, browser: Browsers.ubuntu('Chrome', uid), printQRInTerminal: false,
            markOnlineOnConnect: false, syncFullHistory: false, keepAliveIntervalMs: 25000,
            connectTimeoutMs: 90000, defaultQueryTimeoutMs: 60000, retryRequestDelayMs: 2000,
            fireInitQueries: true, generateHighQualityLinkPreview: false, maxMsgRetryCount: 1, emitOwnEvents: false
        });
        s.sock.ev.on('creds.update', saveCreds);
        s.sock.ev.on('connection.update', async (update) => {
            try {
                const { connection, lastDisconnect } = update || {};
                if (connection === 'close') {
                    const code = (lastDisconnect?.error instanceof Boom) ? lastDisconnect.error.output.statusCode : (Number(lastDisconnect?.error?.output?.statusCode) || 500);
                    log(s.id, 'warn', `Connection closed (${code}). ${s.manualStop ? 'manual' : 'auto-reconnect...'}`);
                    const loggedOut = code === DisconnectReason.loggedOut || code === 401;
                    stopLoops(s.id);
                    s.sock = null; s.connected = false;
                    if (loggedOut && !s.manualStop) {
                        setPhase(s, 'loggedout'); s.jid = null; s.number = null; s.code = null;
                        log(s.id, 'warn', 'Logged out — pair again.');
                        try { fs.rmSync(s.authDir, { recursive: true, force: true }); } catch (e) {}
                        s.sockRef = false; return;
                    }
                    if (!s.manualStop) {
                        setPhase(s, 'retrying'); s.reconnectCount++;
                        const backoff = Math.min(25000, 2000 + s.reconnectCount * 1200 + Math.floor(Math.random() * 3500));
                        log(s.id, 'sys', `Auto-reconnect in ${Math.round(backoff / 1000)}s (${s.reconnectCount})`);
                        s.sockRef = false;
                        setTimeout(() => { if (!s.destroyed) connectWA(s); }, backoff);
                        return;
                    }
                    s.sockRef = false;
                } else if (connection === 'open') {
                    s.connected = true; s.reconnectCount = 0; s.uptimeAt = Date.now();
                    s.jid = s.sock?.user?.id || null; s.number = s.sock?.user?.id?.split(':')[0] || null;
                    setPhase(s, 'open');
                    if (s.code) { s.code = null; s.pairPhone = null; }
                    log(s.id, 'ok', `✅ ${s.name} CONNECTED • ${s.number || s.jid}`);
                    refreshGroups(s).catch(() => {});
                }
            } catch (e) { log(s.id, 'err', 'connection.update: ' + e.message); }
        });
        // SWIPE listener (per session)
        s.sock.ev.on('messages.upsert', ({ messages, type }) => {
            try {
                if (type !== 'notify') return;
                for (const msg of messages || []) {
                    if (!msg?.message || msg.key?.fromMe) continue;
                    const grp = msg.key.remoteJid;
                    if (!grp || !grp.endsWith('@g.us')) continue;
                    const sender = msg.key.participant || grp;
                    const now = Date.now();
                    for (const [k, l] of Object.entries(S.loops)) {
                        if (!l || !l.active || l.sessionId !== s.id || l.action !== 'swipe' || l.target !== grp) continue;
                        if (now < (l.nextAt || 0)) continue;
                        if (l.victim && !jidEq(sender, l.victim)) continue;
                        const lines = l.lines || [];
                        const txt = lines.length ? lines[l.count % lines.length] : '';
                        if (!txt) continue;
                        s.sock.sendMessage(grp, { text: cut(txt, 4000) }, { quoted: msg })
                            .then(() => { l.count++; l.lastAt = Date.now(); l.lastBeat = Date.now(); l.lastError = null; })
                            .catch(e => { l.lastError = String(e?.message || e).slice(0, 100); });
                        l.nextAt = now + rnd(l.dMin || 500, l.dMax || 1200);
                    }
                }
            } catch (e) { log(s.id, 'err', 'listener: ' + e.message); }
        });
    } catch (e) {
        log(s.id, 'err', 'Engine start: ' + e.message);
        s.sockRef = false;
        if (s.phase === 'connecting') setPhase(s, 'idle');
        if (!s.manualStop && !s.destroyed) setTimeout(() => connectWA(s), 5000);
    }
}

// ==================== PAIRING (get code → enter on phone → login) ====================
async function requestPair(s, phone) {
    const clean = cleanPhone(phone);
    if (!clean || clean.length < 8 || clean.length > 15) throw new Error('Enter a valid phone number with country code (e.g. 919876543210)');
    if (!s.sock) { await connectWA(s); await delayMs(2200); }
    if (!s.sock) throw new Error('Engine not ready yet — try again in a few seconds');
    if (s.connected && s.jid) throw new Error('This session is already connected');
    s.pairPhone = clean; s.lastError = null;
    let lastErr = null;
    for (let i = 0; i < 14; i++) {
        if (s.manualStop || !s.sock || s.destroyed) break;
        try {
            log(s.id, 'sys', `Pairing code request +${clean} (${i + 1})...`);
            const code = await s.sock.requestPairingCode(clean);
            if (code) { s.code = String(code); setPhase(s, 'pair_code'); log(s.id, 'ok', `🔑 ${s.name} pairing code: ${s.code}`); return { ok: true, code: s.code }; }
        } catch (e) {
            lastErr = e;
            const m = String(e?.message || e);
            if (/already|connected|registered/i.test(m)) { s.lastError = m; break; }
            log(s.id, 'err', 'Pair try: ' + m.slice(0, 110));
            await delayMs(3500);
        }
    }
    s.lastError = lastErr?.message || 'Pairing code not received yet';
    throw new Error(s.lastError);
}
async function refreshGroups(s, force = false) {
    if (!s.sock || !s.connected) return s.groups;
    if (!force && s.groups.length && Date.now() - s.groupsLoadedAt < 20000) return s.groups;
    try {
        const all = await s.sock.groupFetchAllParticipating();
        s.groups = Object.values(all || {}).map(g => ({ jid: g.id, subject: String(g.subject || '(no name)'), size: Array.isArray(g.participants) ? g.participants.length : 0 })).sort((a, b) => a.subject.localeCompare(b.subject));
        s.groupsLoadedAt = Date.now();
        return s.groups;
    } catch (e) { log(s.id, 'err', 'Groups: ' + e.message); return s.groups; }
}

// ==================== LINK SYSTEM (raid-style: link → check bot → join) ====================
async function linkCheck(link) {
    const code = inviteCode(link);
    if (!code) return { ok: false, error: 'Paste a valid group invite link (chat.whatsapp.com/XXXX)' };
    const out = { ok: true, code, info: null, members: [], nonMembers: [] };
    let info = null;
    for (const s of Object.values(S.sessions)) {
        if (!s.connected || !s.sock) continue;
        try {
            const g = await s.sock.groupGetInviteInfo(code);
            if (g && !info) info = { id: g.id, subject: g.subject, size: Array.isArray(g.participants) ? g.participants.length : 0 };
        } catch (e) {}
    }
    if (info) {
        out.info = info;
        for (const s of Object.values(S.sessions)) {
            const inGroup = s.groups.some(g => g.jid === info.id) || (s.sock && s.connected && await isMember(s, info.id));
            (inGroup ? out.members : out.nonMembers).push({ id: s.id, name: s.name });
            if (inGroup && !s.groups.some(g => g.jid === info.id)) await refreshGroups(s, true);
        }
    } else {
        // invite valid but group hidden — try metadata via selected session
        const sel = S.sessions[S.selected];
        if (sel?.connected) { try { const m = await sel.sock.groupMetadata(await sel.sock.groupAcceptInviteCode ? null : null); } catch (e) {} }
        out.info = { id: null, subject: 'Invite valid', size: 0 };
        for (const s of Object.values(S.sessions)) if (s.connected) out.nonMembers.push({ id: s.id, name: s.name });
    }
    return out;
}
async function isMember(s, jid) {
    try { await s.sock.groupMetadata(jid); return s.groups.some(g => g.jid === jid) || true; } catch (e) { return false; }
}
async function linkJoin(s, link) {
    const code = inviteCode(link);
    if (!code) throw new Error('Paste a valid invite link');
    const jid = await s.sock.groupAcceptInviteCode(code);
    await refreshGroups(s, true);
    const g = s.groups.find(x => x.jid === jid) || { jid, subject: 'Joined' };
    log(s.id, 'ok', `🔗 ${s.name} JOINED ${g.subject}`);
    return { ok: true, jid: g.jid, subject: g.subject };
}

// ==================== BUILDERS (same as v3) ====================
const WRAPS = [['『', '』'], ['《', '》'], ['【', '】'], ['〈', '〉'], ['〔', '〕'], ['「', '」'], ['꧁', '꧂'], ['᯽', '᯽']];
const ENDS = ['🪭', '🦠', '🕯', '🐋', '🫍', '🌌', '⛓️', '💥', '⚗️', '🦪', '🦕', '🪐', '🌀', '🌊'];
const FACES = ['🫩', '😩', '🫪', '😵', '🥶', '🤤', '😪', '🫣'];
const FRUITS = ['🍈', '🌶️', '🥭', '🍆', '🍌', '🥒', '🍓', '🌽', '🍇', '🌵', '🍉', '🍊', '🍑', '🥥', '🍍'];
const CNC_SYMS = ['𓍼͙͘͡★', '⚡ᯓ★', '☬', '𒈙', '᯽᯽', '۞', '🕸️', '𓆙', '𓅓', 'ᚔ᚜', '🪐', '⛓️'];
const RAPID3 = ['{t} 𝐊𝐎 𝐏𝐄𝐋𝐓𝐄 𝐇𝐔𝐄 𝐃𝐄𝐕 𝐏𝐀𝐏𝐀 𝐊𝐈 𝐄𝐍𝐓𝐑𝐘😎❤️‍🔥', '{t} 𝐂𝐇𝐀𝐋 𝐀𝐁 𝐃𝐄𝐕 𝐏𝐀𝐏𝐀 𝐁𝐎𝐋 𝐆𝐔𝐋𝐀𝐌🤣🩷🤚🏼', '{t} 𝐑𝐄𝐏𝐋𝐘 𝐊𝐀𝐑 𝐆𝐀𝐑𝐈𝐁 𝐃𝐀𝐑 𝐊𝐘𝐔 𝐑𝐀𝐇𝐀 𝐇?😂🤙🏼🤍', '{t} 𝐂𝐇𝐀𝐋 𝐓𝐄𝐑𝐈 𝐌𝐀 𝐂𝐇𝐎𝐃𝐔 𝐏𝐀𝐓𝐀𝐊 𝐏𝐀𝐓𝐀𝐊 𝐊𝐄🤣👻🩶', '{t} 𝐊𝐀𝐁𝐀𝐃𝐈 𝐖𝐀𝐋𝐄 𝐊𝐈 𝐌𝐊𝐁😂👻🩷'];
const DEFAULT_PAIRS = WRAPS.map(w => `${w[0]} ${w[1]}`);
let CUSTOM = {};
const L = (act, key, defs) => { const c = CUSTOM[act]; return (c && Array.isArray(c[key]) && c[key].length) ? c[key] : defs; };
const ROT = (arr, i) => (arr.length ? arr[Math.floor(i) % arr.length] : '');
const PB = (s) => { const p = String(s || '').split(/\s+/).filter(Boolean); return p.length === 2 ? p : null; };
const ACTION_LISTS = { spam: ['pre', 'suf'], enc: ['syms'], cnc: ['syms'], nc: ['faces', 'pairs', 'ends'], desc: ['syms', 'ends'], rapid: ['ends'] };
const builders = {
    nc: (n, i) => { const pb = PB(ROT(L('nc', 'pairs', DEFAULT_PAIRS), i)); const b = pb || ['『', '』']; return cut(`${ROT(L('nc', 'faces', FACES), i)} ➣𓂃✧°${b[0]}${n}${b[1]} 𖤐 ${ROT(L('nc', 'ends', ENDS), i)}`); },
    enc: (n, i) => { const s = ROT(L('enc', 'syms', CNC_SYMS), i); return cut(`${s} ${n} ${s}`); },
    domain: (n, i) => { const b = WRAPS[i % WRAPS.length]; return cut(`${b[0]}${n}${b[1]} ${ENDS[i % ENDS.length]} 🜲 ${FACES[i % FACES.length]}`); },
    domainLong: (n, i) => { const b = WRAPS[i % WRAPS.length]; return cut(`${b[0]}${n}${b[1]} ${ENDS[i % ENDS.length]} 𒈙𒈙𒌙⸻${'𒈙'.repeat(2 + (i % 4))}`, 195); },
    desc: (t, i, m) => {
        const s = ROT(L('desc', 'syms', CNC_SYMS), i), e = ROT(L('desc', 'ends', ENDS), i);
        if (m === 'coc') { const fr = [`꧁𓊈𒆜 ${s} ${t} ${s} 𒆜𓊉꧂ ${e}`, `╔═══✦ ෴ ═══╗\n${s} ${t} ${s}\n╚═══✦ ෴ ═══╝ ${e}`, `${e} ➣𓂃✧°《${t}》✧° 𖤐 ${s}`]; return cut(fr[i % fr.length], 500); }
        return cut(`${s} ${t} ${e}`, 500);
    },
    cnc: (n, i) => { const s = ROT(L('cnc', 'syms', CNC_SYMS), i); return cut(`『 ${s} ${n} ${s} 』`); },
    rapid: (n, i, st) => {
        const end = ROT(L('rapid', 'ends', ENDS), i), face = ROT(L('rapid', 'faces', FACES), i), b = WRAPS[i % WRAPS.length];
        switch (Number(st)) {
            case 1: return cut(`${face} ➣𓂃✧°《${n}》𝕃𝕌ℕ𝔻 ℂℍ𝕌𝕊 ℝ𝔸ℕ𝔻𝕀𝕂𝔼 𝔹ℂℂℍ𝔼 _° ➣ ${end}`);
            case 2: return cut(`${n} 𝐓ᴍᴋᴄ 𝐌ᴇ 𓍼ֶָ֢˖۝${FRUITS[i % FRUITS.length]}ᚔ᚜🐉᚛ᚔ`);
            case 3: return cut(RAPID3[i % RAPID3.length].replace(/\{t\}/gi, n));
            case 4: return cut(`⁀✘${n} 𝗧𝗘𝗥𝗜 𝗠𝗔𝗔 !! 𝗕𝗛𝗘𝗡 𝗞𝗢 𝗟𝗨𝗡𝗗 𝗣𝗘𝗥 𝗕𝗔𝗜𝗧𝗛𝗔 𝗞𝗔𝗥 𝗖𝗛𝗢𝗗𝗨𝗚𝗔 𝗥𝗔𝗡𝗗𝗜𝗞𝗘 𝗣𝗜𝗟𝗟𝗘 ✘✘_`);
            case 5: return cut(`➣𓂃✧° ꨄ︎ ִֶָ☾. ${n} 𝐔sᴋᴇ 𝐓ᴀᴛᴛᴏ 𝐌ᴀʜᴏʀᴀɢ𝐚 𝐏𝐚𝐩𝐚 𝐊𝐚 𝐋ᴜɴ𝐝 𝐂ʜᴜs ༊࿐ ${end}`);
            case 6: return cut(`${n} ${end}`, 190);
            default: return cut(`${end} ➣𓂃✧°${b[0]}${n}${b[1]} 𖤐 ${end}`);
        }
    }
};

// ==================== LOOPS ====================
const FLOORS = { spam: 20, domain: 10, name: 10, rapid: 15, cnc: 10, desc: 10, swipe: 200, tagall: 500, kickall: 500 };
const DEF_DL = { spam: [300, 900], domain: [30, 80], enc: [20, 50], nc: [50, 100], rapid: [30, 70], cnc: [20, 50], desc: [15, 45], swipe: [500, 1200], tagall: [1200, 2200], kickall: [1000, 1800] };
const DEF_THR = { spam: 1, domain: 2, enc: 4, nc: 2, rapid: 1, cnc: 6, desc: 1, swipe: 1, tagall: 1, kickall: 1 };
function stopLoopKey(key) { const l = S.loops[key]; if (l) { l.active = false; try { l.workers.forEach(w => clearTimeout(w)); } catch (e) {} } delete S.loops[key]; }
function stopLoops(sid) { for (const k of Object.keys(S.loops)) { if (!sid || S.loops[k].sessionId === sid) stopLoopKey(k); } }
function stopAction(sid, action, target) { let n = 0; for (const k of Object.keys(S.loops)) { const l = S.loops[k]; if ((!sid || l.sessionId === sid) && (!action || l.action === action) && (!target || l.target === target)) { stopLoopKey(k); n++; } } return n; }

async function runOp(key, entry, cfg, w) {
    const { action, lines, mode, dMin, dMax, iterations } = cfg;
    const s = S.sessions[entry.sessionId];
    let errStreak = 0, participants = [];
    try {
        if ((action === 'tagall' || action === 'kickall') && s?.sock) {
            const meta = await s.sock.groupMetadata(entry.target);
            participants = (meta?.participants || []).map(p => ({ id: p.id, admin: p.admin }));
            if (action === 'kickall' && !participants.some(p => p.id === s.sock.user?.id && p.admin)) { entry.lastError = 'Bot is NOT group admin — KICKALL blocked'; stopLoopKey(key); return; }
        }
        for (let i = 0; ; i++) {
            const cur = S.loops[key];
            if (!cur || !cur.active || !s?.sock || !s.connected) break;
            if (iterations && cur.count >= iterations) { stopLoopKey(key); return; }
            cur.lastBeat = Date.now();
            const rot = cur.count + w * 7;
            const linesArr = lines.length ? lines : [''];
            const txt = linesArr[Math.floor(rot) % linesArr.length] || linesArr[0] || '';
            try {
                if (action === 'spam') {
                    if (!txt) break;
                    const pre = ROT(L('spam', 'pre', []), rot), suf = ROT(L('spam', 'suf', []), rot);
                    await s.sock.sendMessage(entry.target, { text: cut((pre ? pre + ' ' : '') + txt + (suf ? ' ' + suf : ''), 4000) });
                }
                else if (action === 'name') { if (mode === 'nc') await s.sock.groupUpdateSubject(entry.target, builders.nc(txt, rot)); else await s.sock.groupUpdateSubject(entry.target, builders.enc(txt, rot)); }
                else if (action === 'domain') {
                    await s.sock.groupUpdateSubject(entry.target, Number(mode) === 5 ? builders.domainLong(txt, rot) : builders.domain(txt, rot));
                    if ((mode === '1' || mode === '2') && rot % 3 === 0) await s.sock.groupUpdateDescription(entry.target, builders.desc(txt + ' ⚡ ' + ENDS[rot % ENDS.length], rot)).catch(() => {});
                    if ((mode === '1' || mode === '3') && rot % 5 === 0 && linesArr[1]) await s.sock.sendMessage(entry.target, { text: cut(linesArr[1], 4000) }).catch(() => {});
                }
                else if (action === 'rapid') await s.sock.groupUpdateSubject(entry.target, builders.rapid(txt, rot, mode));
                else if (action === 'cnc') await s.sock.groupUpdateSubject(entry.target, builders.cnc(txt, rot));
                else if (action === 'desc') await s.sock.groupUpdateDescription(entry.target, builders.desc(txt, rot, mode));
                else if (action === 'tagall') await s.sock.sendMessage(entry.target, { text: cut(txt, 4000) || ' ', mentions: participants.map(p => p.id) });
                else if (action === 'kickall') { const v = participants[Math.floor(rot) % participants.length]; if (v?.admin || v?.id === s.sock.user?.id) { await delayMs(300); continue; } await s.sock.groupParticipantsUpdate(entry.target, [v.id], 'remove'); }
                errStreak = 0; cur.count++; cur.lastAt = Date.now(); cur.lastError = null;
                if (cur.count % 10 === 0) log(s.id, 'ok', `${action} → ${cur.count}`);
            } catch (e) {
                errStreak++; const m = String(e?.message || e); cur.lastError = m.slice(0, 110);
                if (errStreak >= 5) { log(s.id, 'err', `${action} stop (${errStreak} errors): ${m.slice(0, 80)}`); stopLoopKey(key); return; }
                await delayMs(2500 + errStreak * 1200);
            }
            const wait = rnd(dMin, dMax);
            if (wait > 0) await delayMs(wait);
        }
    } catch (e) { log(s?.id || '?', 'err', `[worker] crash-safe: ${String(e?.message || e).slice(0, 110)}`); }
    if (S.loops[key] && S.loops[key].active && Date.now() - (S.loops[key].lastBeat || 0) > 5000) stopLoopKey(key);
}
function startLoop(s, action, target, cfg) {
    const key = `${s.id}::${action}|${target}`;
    stopLoopKey(key);
    const threads = Math.max(1, Math.min(20, Number(cfg.threads) || 1));
    const entry = { active: true, sessionId: s.id, sessionName: s.name, action, target, count: 0, startedAt: Date.now(), lastAt: null, lastBeat: Date.now(), lastError: null, revive: 0, nextAt: 0, victim: cfg.victim || null, lines: cfg.lines || [], dMin: cfg.dMin, dMax: cfg.dMax, mode: cfg.mode || '4', workers: [] };
    S.loops[key] = entry;
    if (action !== 'swipe') for (let w = 0; w < threads; w++) runOp(key, entry, cfg, w).catch(() => {});
    return { key, entry };
}

// watchdog
setInterval(() => {
    const now = Date.now();
    for (const s of Object.values(S.sessions)) {
        if (s.destroyed || s.manualStop) continue;
        if ((s.phase === 'connecting' || s.phase === 'retrying') && now - s.phaseAt > 150000 && !s.sockRef) { hardReset(s, 'phase stuck'); continue; }
        if (s.phase === 'connecting' && now - s.phaseAt > 120000 && s.sockRef) { hardReset(s, 'connect timeout'); }
    }
    for (const [k, l] of Object.entries(S.loops)) {
        if (!l || !l.active || l.action === 'swipe') continue;
        const s = S.sessions[l.sessionId];
        if (!s?.connected) continue;
        if (now - (l.lastBeat || 0) > 60000 && l.revive < 4) { l.revive++; log(s.id, 'warn', `♻️ loop auto-revive ${l.action}`); runOp(k, l, { action: l.action, lines: l.lines, mode: l.mode, dMin: l.dMin, dMax: l.dMax, iterations: 0 }, l.revive).catch(() => {}); }
    }
}, 4000);

// ==================== API ====================
const app = express();
app.use(express.json({ limit: '2mb' }));
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.static(__dirname)); // fallback: repo-root layout (index.html at root)
// ==================== PIN LOCK ====================
const PIN = '709177';
const PIN_TOKENS = new Set();
const isUnlocked = (req) => { const t = String(req.headers['x-fyt-token'] || ''); return !!t && PIN_TOKENS.has(t); };
app.post('/api/unlock', (req, res) => { try {
    if (String(req.body?.pin || '') === PIN) { const tk = crypto.randomUUID().replace(/-/g, ''); if (PIN_TOKENS.size > 400) PIN_TOKENS.clear(); PIN_TOKENS.add(tk); res.json({ ok: true, token: tk }); }
    else res.json({ ok: false, error: 'Wrong PIN' });
} catch (e) { res.json({ ok: false, error: e.message }); } });
app.post('/api/*', (req, res, next) => { if (req.path === '/api/unlock' || isUnlocked(req)) return next(); res.status(403).json({ ok: false, error: 'Locked — enter PIN to operate', locked: true }); });
// ==================== CUSTOM ROTATION ====================
const saveCustom = () => { try { fs.mkdirSync(path.join(__dirname, 'data'), { recursive: true }); fs.writeFileSync(path.join(__dirname, 'data', 'custom.json'), JSON.stringify(CUSTOM, null, 2)); } catch (e) {} };
app.post('/api/custom', (req, res) => { try {
    const action = String(req.body?.action || '');
    if (!ACTION_LISTS[action]) throw new Error('Unknown action');
    if (req.body?.reset) { delete CUSTOM[action]; saveCustom(); return res.json({ ok: true, custom: {} }); }
    const out = {};
    for (const key of ACTION_LISTS[action]) { const raw = Array.isArray(req.body?.lists?.[key]) ? req.body.lists[key] : []; out[key] = raw.map(x => String(x).trim().slice(0, 80)).filter(Boolean).slice(0, 300); }
    CUSTOM[action] = out; saveCustom(); res.json({ ok: true, custom: out });
} catch (e) { res.json({ ok: false, error: e.message }); } });
app.use((err, req, res, next) => res.status(500).json({ ok: false, error: 'server: ' + err.message }));

const pub = (s) => ({ id: s.id, name: s.name, phase: s.phase, connected: s.connected, jid: s.jid, number: s.number, code: s.code, pairPhone: s.pairPhone, lastError: s.lastError, reconnectCount: s.reconnectCount, engineReboots: S.engineRestarts, uptime: s.uptimeAt, groups: s.groups, groupsLoadedAt: s.groupsLoadedAt });
const apiState = () => ({ sessions: Object.values(S.sessions).map(pub), selected: S.selected, loops: S.loops, logs: S.logs.slice(0, 45), engineRestarts: S.engineRestarts, custom: CUSTOM });
const getS = (req) => { const id = String(req.body?.sessionId || req.query?.sessionId || S.selected || ''); const s = S.sessions[id]; if (!s) throw new Error('Session not found — create one first'); return s; };

app.get('/api/state', (req, res) => res.json(apiState()));
app.post('/api/session/add', (req, res) => {
    try {
        const n = Object.keys(S.sessions).length + 1;
        const s = newSession('s' + n, String(req.body?.name || ('Bot ' + n)).slice(0, 24));
        connectWA(s).catch(() => {});
        res.json({ ok: true, session: pub(s) });
    } catch (e) { res.json({ ok: false, error: e.message }); }
});
app.post('/api/session/select', (req, res) => { try { const s = getS(req); S.selected = s.id; res.json({ ok: true, selected: s.id }); } catch (e) { res.json({ ok: false, error: e.message }); } });
app.post('/api/session/pair', async (req, res) => { try { const s = getS(req); const r = await requestPair(s, req.body?.phone); res.json({ ok: true, sessionId: s.id, code: r.code }); } catch (e) { res.json({ ok: false, error: e.message }); } });
app.post('/api/session/newcode', async (req, res) => { try { const s = getS(req); if (!s.pairPhone) throw new Error('Enter a phone number and press GET CODE first'); const r = await requestPair(s, s.pairPhone); res.json({ ok: true, code: r.code }); } catch (e) { res.json({ ok: false, error: e.message }); } });
app.post('/api/session/reboot', (req, res) => { try { const s = getS(req); hardReset(s, 'manual'); res.json({ ok: true }); } catch (e) { res.json({ ok: false, error: e.message }); } });
app.post('/api/session/logout', async (req, res) => { try { const s = getS(req); s.manualStop = true; stopLoops(s.id); const sock = s.sock; s.sock = null; try { if (sock) await sock.logout(); } catch (e) {} try { if (sock) sock.end(new Error('logout')); } catch (e) {} try { fs.rmSync(s.authDir, { recursive: true, force: true }); } catch (e) {} Object.assign(s, { connected: false, jid: null, number: null, code: null, pairPhone: null, groups: [], lastError: null, reconnectCount: 0 }); setPhase(s, 'idle'); s.sockRef = false; log(s.id, 'sys', 'Logout — fresh pairing ready'); setTimeout(() => { s.manualStop = false; if (!s.destroyed) connectWA(s).catch(() => {}); }, 1500); res.json({ ok: true }); } catch (e) { res.json({ ok: false, error: e.message }); } });
app.post('/api/session/remove', async (req, res) => { try { const s = getS(req); stopLoops(s.id); s.destroyed = true; s.manualStop = true; try { if (s.sock) await s.sock.logout(); } catch (e) {} try { if (s.sock) s.sock.end(new Error('remove')); } catch (e) {} try { fs.rmSync(s.authDir, { recursive: true, force: true }); } catch (e) {} s.sock = null; delete S.sessions[s.id]; if (S.selected === s.id) S.selected = Object.keys(S.sessions)[0] || null; saveSessions(); log(s.id, 'sys', '🗑 Session removed'); res.json({ ok: true }); } catch (e) { res.json({ ok: false, error: e.message }); } });
app.post('/api/groups', async (req, res) => { try { const s = getS(req); res.json({ ok: true, groups: await refreshGroups(s, true) }); } catch (e) { res.json({ ok: false, error: e.message, groups: [] }); } });
app.post('/api/ping', async (req, res) => { try { const s = getS(req); if (!s.sock || !s.connected) throw new Error('Session offline'); const t0 = Date.now(); await s.sock.sendMessage(s.jid, { text: `🏓 PING ${Date.now()}` }); const ms = Date.now() - t0; log(s.id, 'ok', `🏓 PING → ${ms}ms`); res.json({ ok: true, sessionId: s.id, ms }); } catch (e) { res.json({ ok: false, error: e.message }); } });
// LINK SYSTEM
app.post('/api/link/check', async (req, res) => { try { res.json(await linkCheck(req.body?.link || '')); } catch (e) { res.json({ ok: false, error: e.message }); } });
app.post('/api/link/join', async (req, res) => { try { const s = getS(req); res.json(await linkJoin(s, req.body?.link || '')); } catch (e) { res.json({ ok: false, error: e.message }); } });
// actions
app.post('/api/start', async (req, res) => {
    try {
        let { action, target, victim, text, mode, style, min, max, threads, iterations, kickOk } = req.body || {};
        const map = { spam: 'spam', message: 'spam', dtx: 'spam', name: 'name', namechange: 'name', enc: 'name', nc: 'name', domain: 'domain', rapid: 'rapid', cnc: 'cnc', desc: 'desc', swipe: 'swipe', tagall: 'tagall', kickall: 'kickall' };
        action = map[String(action || '').toLowerCase()];
        if (!action) return res.json({ ok: false, error: 'Unknown action' });
        const s = getS(req);
        if (!s.sock || !s.connected) return res.json({ ok: false, error: 'Session offline — login first' });
        let jid = null;
        if (target && String(target).includes('@')) jid = String(target);
        else jid = jidFromNumber(target || '');
        if (!jid) return res.json({ ok: false, error: 'No target — set a group via the LINK SYSTEM or enter a DM number' });
        if (action !== 'spam' && !isGrp(jid)) return res.json({ ok: false, error: `${action.toUpperCase()} requires a GROUP target` });
        if (action === 'rapid' && !/^[0-6]$/.test(String(style !== undefined ? style : mode || ''))) return res.json({ ok: false, error: 'Pick RAPID style 0-6' });
        if (action === 'kickall' && !kickOk) return res.json({ ok: false, error: 'KICK confirmation required' });
        const lines = String(text || '').split('\n').map(l => l.trim()).filter(Boolean);
        if (action !== 'kickall' && !lines.length && action !== 'swipe') return res.json({ ok: false, error: 'Enter text first' });
        let m = String(mode || style || '4');
        if (action === 'name') m = ['enc', 'nc'].includes(m) ? m : 'enc';
        if (action === 'desc') m = ['fast', 'coc'].includes(m) ? m : 'coc';
        const floor = FLOORS[action] || 20;
        const defs = action === 'name' ? DEF_DL[m] : DEF_DL[action];
        const dMin = Math.max(floor, Number(min) > 0 ? Number(min) : (defs || DEF_DL.spam)[0]);
        const dMax = Math.max(dMin, Number(max) > 0 ? Number(max) : (defs || DEF_DL.spam)[1]);
        const cfg = { target: jid, victim: (action === 'swipe' && victim) ? (jidFromNumber(victim) || String(victim).trim()) : null, lines, mode: m, dMin, dMax, threads: Math.max(1, Math.min(20, Number(threads) || (action === 'name' ? DEF_THR[m] : DEF_THR[action]) || 1)), iterations: Math.max(0, Math.min(100000, Number(iterations) || 0)) };
        const r = startLoop(s, action, jid, cfg);
        log(s.id, 'ok', `🔥 ${action.toUpperCase()} START → ${jid} [${dMin}-${dMax}ms ×${cfg.threads}${cfg.victim ? ' • victim ' + digits(cfg.victim) : ''}]`);
        res.json({ ok: true, key: r.key });
    } catch (e) { res.json({ ok: false, error: e.message }); }
});
app.post('/api/stop', async (req, res) => {
    try {
        const map = { spam: 'spam', message: 'spam', dtx: 'spam', name: 'name', enc: 'name', nc: 'name', domain: 'domain', rapid: 'rapid', cnc: 'cnc', desc: 'desc', swipe: 'swipe', tagall: 'tagall', kickall: 'kickall' };
        const sid = String(req.body?.sessionId || '');
        const action = map[String(req.body?.action || '').toLowerCase()] || undefined;
        const target = String(req.body?.target || '');
        const key = String(req.body?.key || '');
        let n = 0;
        if (key && S.loops[key]) { stopLoopKey(key); n = 1; }
        else n = stopAction(sid || undefined, action, target || undefined);
        log(sid || 'sys', 'sys', `STOP ${action || (key || 'all')}${sid ? ' (' + sid + ')' : ''} → ${n}`);
        res.json({ ok: true, stopped: n });
    } catch (e) { res.json({ ok: false, error: e.message }); }
});

// ==================== BOOT ====================
app.listen(PORT, '0.0.0.0', () => {
    console.log(`\n${BRAND}\n🐉 DEV WP FYT SYSTEM v7.3.8 (GALAXY — PIN LOCKED) → http://0.0.0.0:${PORT}\n`);
    try { CUSTOM = JSON.parse(fs.readFileSync(path.join(__dirname, 'data', 'custom.json'), 'utf-8')) || {}; } catch (e) { CUSTOM = {}; }
    const saved = loadSessions();
    if (!saved.length) { const s = newSession('s1', 'Bot 1'); connectWA(s).catch(() => {}); }
    else for (const r of saved) { const s = newSession(r.id, r.name); connectWA(s).catch(() => {}); }
    setTimeout(() => { for (const s of Object.values(S.sessions)) refreshGroups(s).catch(() => {}); }, 6000);
});
process.on('SIGTERM', () => { stopLoops(); for (const s of Object.values(S.sessions)) { try { s.sock?.end(new Error('shutdown')); } catch (e) {} } setTimeout(() => process.exit(0), 500); });
