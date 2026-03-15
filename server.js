const express = require('express');
const app = express();
app.use(express.json());

// ─── הגדרות הגנה ───────────────────────────────────────────
const MAX_CALLS_PER_DAY = 20;        // מקסימום שיחות ליום למשתמש
const MAX_CALLS_PER_MINUTE = 3;      // מקסימום שיחות בדקה
const MIN_CALL_INTERVAL_SEC = 10;    // מינימום שניות בין שיחה לשיחה
const BLOCKED_COUNTRIES = ['234', '233', '225']; // ניגריה, גאנה, חוף השנהב
const BLOCKED_NUMBERS = [];          // רשימה שחורה ידנית

// ─── זיכרון זמני (in-memory) ───────────────────────────────
const callLog = {}; // { ip: { count, lastCall, minuteCalls, minuteReset } }

// ─── פונקציית בדיקת הונאה ──────────────────────────────────
function checkFraud(ip, number) {
  const now = Date.now();
  const today = new Date().toDateString();

  if (!callLog[ip]) {
    callLog[ip] = { count: 0, date: today, lastCall: 0, minuteCalls: 0, minuteReset: now };
  }

  const user = callLog[ip];

  // איפוס יומי
  if (user.date !== today) {
    user.count = 0;
    user.date = today;
  }

  // איפוס דקה
  if (now - user.minuteReset > 60000) {
    user.minuteCalls = 0;
    user.minuteReset = now;
  }

  // בדיקת מספר חסום
  if (BLOCKED_NUMBERS.includes(number)) {
    return { allowed: false, reason: 'מספר חסום' };
  }

  // בדיקת מדינה חסומה
  const prefix = number.replace('+', '').substring(0, 3);
  if (BLOCKED_COUNTRIES.some(c => prefix.startsWith(c))) {
    return { allowed: false, reason: 'מדינה חסומה' };
  }

  // בדיקת מגבלה יומית
  if (user.count >= MAX_CALLS_PER_DAY) {
    return { allowed: false, reason: 'חרגת ממגבלת השיחות היומית' };
  }

  // בדיקת מגבלה בדקה
  if (user.minuteCalls >= MAX_CALLS_PER_MINUTE) {
    return { allowed: false, reason: 'יותר מדי שיחות בדקה אחת' };
  }

  // בדיקת מרווח מינימלי בין שיחות
  if (now - user.lastCall < MIN_CALL_INTERVAL_SEC * 1000) {
    return { allowed: false, reason: 'יש להמתין בין שיחה לשיחה' };
  }

  // עדכון הלוג
  user.count++;
  user.minuteCalls++;
  user.lastCall = now;

  return { allowed: true };
}

// ─── Routes ────────────────────────────────────────────────

app.get('/', (req, res) => {
  res.send('EgoVoip server running');
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok', message: 'EgoVoip server working' });
});

app.post('/call', (req, res) => {
  const { number } = req.body || {};
  const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;

  // בדיקת תקינות מספר
  if (!number || typeof number !== 'string') {
    return res.status(400).json({ success: false, message: 'מספר טלפון חסר או לא תקין' });
  }

  // בדיקת אורך מספר
  const cleaned = number.replace(/\D/g, '');
  if (cleaned.length < 7 || cleaned.length > 15) {
    return res.status(400).json({ success: false, message: 'מספר טלפון לא תקין' });
  }

  // בדיקת הונאה
  const fraud = checkFraud(ip, cleaned);
  if (!fraud.allowed) {
    console.warn(`🚫 חסום [${ip}]: ${fraud.reason}`);
    return res.status(429).json({ success: false, message: fraud.reason });
  }

  console.log(`📞 שיחה מ-[${ip}] למספר: ${number}`);
  return res.json({ success: true, number, message: `מחייג ל-${number}` });
});

// ─── Start ─────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on port ${PORT}`);
});