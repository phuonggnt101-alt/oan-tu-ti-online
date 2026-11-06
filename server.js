// Oẳn Tù Tì Online — máy chủ Node.js + Socket.IO
// Chạy: npm install && npm start  →  mở http://localhost:3000
const http = require("http");
const fs = require("fs");
const path = require("path");
const { Server } = require("socket.io");

const PORT = process.env.PORT || 3000;
const ROUND_MS = Number(process.env.ROUND_MS || 20000);   // thời gian chọn mỗi lượt
const REVEAL_MS = Number(process.env.REVEAL_MS || 7000);  // thời gian xem kết quả trước lượt sau
const BEATS = { keo: "bao", bua: "keo", bao: "bua" };
const CHOICES = Object.keys(BEATS);

// ---------- static files ----------
const NAV = '<a class="pill" href="/ca-ngua" title="Chơi cờ cá ngựa" style="text-decoration:none;color:inherit">🐴 Cá ngựa</a><a class="pill" href="/bai" title="Sâm, Phỏm, Ba cây" style="text-decoration:none;color:inherit">🃏 Đánh bài</a><a class="pill" href="/caro" title="Chơi cờ caro" style="text-decoration:none;color:inherit">⭕ Caro</a><a class="pill" href="/tai-xiu" title="Chơi tài xỉu" style="text-decoration:none;color:inherit">🎲 Tài xỉu</a>';
const INDEX = fs.readFileSync(path.join(__dirname, "index.html"), "utf8").replace('<div class="meta">', '<div class="meta">' + NAV);
const CANGUA = fs.readFileSync(path.join(__dirname, "ca-ngua.html"));
const BAI = fs.readFileSync(path.join(__dirname, "bai.html"));
const CARO = fs.readFileSync(path.join(__dirname, "caro.html"));
const TAIXIU = fs.readFileSync(path.join(__dirname, "tai-xiu.html"));
const SFXJS = fs.readFileSync(path.join(__dirname, "sfx.js"));
const CHATJS = fs.readFileSync(path.join(__dirname, "chat.js"));
const server = http.createServer((req, res) => {
  const p = (req.url || "/").split("?")[0];
  if (p === "/" || p === "/index.html") {
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    return res.end(INDEX);
  }
  if (p === "/ca-ngua" || p === "/ca-ngua/") {
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    return res.end(CANGUA);
  }
  if (p === "/bai" || p === "/bai/") {
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    return res.end(BAI);
  }
  if (p === "/tai-xiu" || p === "/tai-xiu/") {
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    return res.end(TAIXIU);
  }
  if (p === "/caro" || p === "/caro/") {
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    return res.end(CARO);
  }
  if (p === "/chat.js") {
    res.writeHead(200, { "Content-Type": "text/javascript; charset=utf-8" });
    return res.end(CHATJS);
  }
  if (p === "/sfx.js") {
    res.writeHead(200, { "Content-Type": "text/javascript; charset=utf-8" });
    return res.end(SFXJS);
  }
  if (p === "/healthz") { res.writeHead(200); return res.end("ok"); }
  res.writeHead(404); res.end("Not found");
});
const io = new Server(server);
require("./ca-ngua").attach(io);
require("./bai").attach(io);
require("./caro").attach(io);
require("./taixiu").attach(io);

// ---------- game logic ----------
function judge(picks, players) {
  // picks: {pid: choice}; players: null (lượt mở) | [pid]
  const pickers = Object.keys(picks);
  const timeouts = players ? players.filter((p) => !picks[p]) : [];
  const r = { picks, winners: [], losers: [], timeouts, outcome: "", next: null, finalLoser: null, end: false, winChoice: null };
  if (!pickers.length) { r.outcome = "empty"; r.end = true; return r; }
  if (players && timeouts.length) {
    r.outcome = "timeout"; r.winners = pickers; r.losers = timeouts.slice();
  } else if (!players && pickers.length < 2) {
    r.outcome = "alone"; r.end = true; return r;
  } else {
    const set = [...new Set(pickers.map((p) => picks[p]))];
    if (set.length !== 2) { r.outcome = "draw"; r.next = pickers; return r; }
    const [a, b] = set;
    const w = BEATS[a] === b ? a : b;
    r.outcome = "decided"; r.winChoice = w;
    r.winners = pickers.filter((p) => picks[p] === w);
    r.losers = pickers.filter((p) => picks[p] !== w);
  }
  if (r.losers.length >= 2) r.next = r.losers.slice();
  else { r.end = true; r.finalLoser = r.losers[0] || null; }
  return r;
}

const rooms = new Map();
function getRoom(id) {
  let r = rooms.get(id);
  if (!r) {
    r = { id, people: new Map(), sockets: new Map(), phase: "idle", roundNo: 0, players: null, picks: {}, endsAt: 0, nextAt: 0, result: null, history: [], timer: null, emptySince: null };
    rooms.set(id, r);
  }
  return r;
}

function publicState(room, pid) {
  const online = new Set([...room.sockets.values()]);
  const people = {};
  room.people.forEach((v, k) => { people[k] = { name: v.name, online: online.has(k) }; });
  return {
    room: room.id, now: Date.now(), roundMs: ROUND_MS, revealMs: REVEAL_MS,
    phase: room.phase, roundNo: room.roundNo, players: room.players, endsAt: room.endsAt, nextAt: room.nextAt,
    picked: room.phase === "picking" ? Object.keys(room.picks) : [],
    myPick: room.phase === "picking" ? room.picks[pid] || null : null,
    result: room.result, history: room.history, people, me: pid,
  };
}
function broadcast(room) {
  room.sockets.forEach((pid, sid) => {
    const s = io.sockets.sockets.get(sid);
    if (s) s.emit("state", publicState(room, pid));
  });
}

function startRound(room, players) {
  clearTimeout(room.timer);
  room.phase = "picking"; room.roundNo += 1; room.players = players; room.picks = {}; room.result = null;
  room.endsAt = Date.now() + ROUND_MS; room.nextAt = 0;
  room.timer = setTimeout(() => resolveRound(room), ROUND_MS + 300);
  broadcast(room);
}
function resolveRound(room) {
  if (room.phase !== "picking") return;
  const r = judge({ ...room.picks }, room.players);
  room.result = r; room.history.push({ roundNo: room.roundNo, ...r });
  if (room.history.length > 40) room.history.shift();
  room.phase = r.end ? "done" : "result";
  room.nextAt = r.end ? 0 : Date.now() + REVEAL_MS;
  if (!r.end) room.timer = setTimeout(() => startRound(room, r.next), REVEAL_MS);
  broadcast(room);
}

io.on("connection", (socket) => {
  let room = null, pid = null;

  socket.on("join", (msg = {}) => {
    const rid = String(msg.room || "chung").toLowerCase().replace(/[^a-z0-9-]/g, "").slice(0, 24) || "chung";
    pid = String(msg.pid || "").replace(/[^a-zA-Z0-9]/g, "").slice(0, 32) || socket.id;
    const name = String(msg.name || "").trim().slice(0, 24) || "Người chơi";
    if (room) { room.sockets.delete(socket.id); socket.leave(room.id); }
    room = getRoom(rid); room.emptySince = null;
    room.people.set(pid, { name });
    room.sockets.set(socket.id, pid);
    socket.join(rid);
    broadcast(room);
  });

  socket.on("rename", (name) => {
    if (!room) return;
    room.people.set(pid, { name: String(name || "").trim().slice(0, 24) || "Người chơi" });
    broadcast(room);
  });

  socket.on("start", () => {
    if (!room || room.phase === "picking" || room.phase === "result") return;
    room.roundNo = 0; room.history = [];
    startRound(room, null);
  });

  socket.on("pick", (choice) => {
    if (!room || room.phase !== "picking" || !CHOICES.includes(choice)) return;
    if (Date.now() > room.endsAt) return;
    if (room.players && !room.players.includes(pid)) return;
    room.picks[pid] = choice;
    broadcast(room);
  });

  socket.on("disconnect", () => {
    if (!room) return;
    room.sockets.delete(socket.id);
    if (!room.sockets.size) room.emptySince = Date.now();
    broadcast(room);
  });
});

// Dọn phòng trống sau 30 phút
setInterval(() => {
  const now = Date.now();
  rooms.forEach((r, id) => { if (r.emptySince && now - r.emptySince > 30 * 60 * 1000) { clearTimeout(r.timer); rooms.delete(id); } });
}, 60 * 1000);

server.listen(PORT, () => console.log("Oẳn Tù Tì đang chạy tại http://localhost:" + PORT));
module.exports = { judge };
