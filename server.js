const express = require("express");
const fs = require("fs");
const path = require("path");
const P = require("pino");
const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason
} = require("@whiskeysockets/baileys");

const app = express();
const PORT = process.env.PORT || 3000;
const AUTH_DIR = path.join(__dirname, "auth_info");

app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

let sock = null;
let connecting = false;
let lastPairingCode = null;

function cleanNumber(value) {
  return String(value || "").replace(/\D/g, "");
}

async function startBot() {
  if (connecting) return;
  connecting = true;

  const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);

  sock = makeWASocket({
    auth: state,
    logger: P({ level: "silent" }),
    printQRInTerminal: false,
    browser: ["ZACKK BOT", "Chrome", "1.0.0"]
  });

  sock.ev.on("creds.update", saveCreds);

  sock.ev.on("connection.update", async ({ connection, lastDisconnect }) => {
    if (connection === "open") {
      connecting = false;
      console.log("✅ ZACKK BOT terhubung.");
    }

    if (connection === "close") {
      connecting = false;
      sock = null;
      const code = lastDisconnect?.error?.output?.statusCode;

      if (code !== DisconnectReason.loggedOut) {
        console.log("🔄 Koneksi terputus, mencoba menyambung lagi...");
        setTimeout(startBot, 3000);
      } else {
        console.log("❌ Sesi logout. Hapus folder auth_info lalu pairing lagi.");
      }
    }
  });

  return sock;
}

app.get("/api/status", (req, res) => {
  res.json({
    connected: !!sock?.user,
    pairingCode: lastPairingCode
  });
});

app.post("/api/pair", async (req, res) => {
  try {
    const number = cleanNumber(req.body.number);

    if (!number) {
      return res.status(400).json({ error: "Nomor WhatsApp wajib diisi." });
    }

    const wa = await startBot();

    // Pairing code tersedia untuk perangkat yang belum terdaftar.
    if (wa.user) {
      return res.json({ message: "Bot sudah terhubung.", connected: true });
    }

    if (!wa.requestPairingCode) {
      return res.status(500).json({
        error: "Library WhatsApp tidak menyediakan pairing code pada koneksi ini."
      });
    }

    lastPairingCode = await wa.requestPairingCode(number);
    res.json({ pairingCode: lastPairingCode });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message || "Gagal membuat pairing code." });
  }
});

// Contoh command bot.
async function handleMessage(msg) {
  if (!msg.message || msg.key.fromMe) return;

  const jid = msg.key.remoteJid;
  const text =
    msg.message.conversation ||
    msg.message.extendedTextMessage?.text ||
    "";

  if (text.trim().toLowerCase() === ".menu") {
    await sock.sendMessage(jid, {
      text:
`╭─「 ZACKK BOT 」
│
│ .menu
│ .ping
│ .owner
│ .info
│
╰────────────`
    });
  }

  if (text.trim().toLowerCase() === ".ping") {
    await sock.sendMessage(jid, { text: "🏓 Pong! ZACKK BOT aktif." });
  }

  if (text.trim().toLowerCase() === ".owner") {
    await sock.sendMessage(jid, { text: "👑 Owner: ZACKK" });
  }

  if (text.trim().toLowerCase() === ".info") {
    await sock.sendMessage(jid, {
      text: "🤖 ZACKK BOT\nStatus: Online\nVersi: 1.0.0"
    });
  }
}

(async () => {
  await startBot();
})();

app.listen(PORT, () => {
  console.log(`🌐 Panel: http://localhost:${PORT}`);
});
