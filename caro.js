// Cờ caro online — 2 người (X, O), người xem, đếm giờ mỗi nước, hết giờ máy tự đánh.
// Luật thắng: "tudo" = đủ 5 con liền là thắng; "chan2" = 5 con liền nhưng bị quân đối thủ chặn cả 2 đầu thì không tính.
const admin = require("./admin");

const DEFAULT_RULES = { win: "chan2", size: 19, turnSec: 20 };
const SIZES = [15, 19, 25];
function sanitizeRules(r = {}) {
  return {
    win: r.win === "tudo" ? "tudo" : "chan2",
    size: SIZES.includes(Number(r.size)) ? Number(r.size) : DEFAULT_RULES.size,
    turnSec: [10, 20, 30, 60, 0].includes(Number(r.turnSec)) ? Number(r.turnSec) : DEFAULT_RULES.turnSec,
  };
}
const DIRS = [[0, 1], [1, 0], [1, 1], [1, -1]];

// board: mảng size*size, 0 = trống, 1 = X, 2 = O
function lineAt(board, n, r, c, dr, dc, v) {
  const at = (rr, cc) => (rr < 0 || cc < 0 || rr >= n || cc >= n ? -1 : board[rr * n + cc]);
  let a = 0, b = 0;
  while (at(r + (a + 1) * dr, c + (a + 1) * dc) === v) a++;
  while (at(r - (b + 1) * dr, c - (b + 1) * dc) === v) b++;
  const endA = at(r + (a + 1) * dr, c + (a + 1) * dc), endB = at(r - (b + 1) * dr, c - (b + 1) * dc);
  const cells = []; for (let k = -b; k <= a; k++) cells.push((r + k * dr) * n + (c + k * dc));
  return { len: a + b + 1, endA, endB, cells };
}
// Trả về danh sách ô của đường thắng, hoặc null. Mép bàn cờ không tính là bị chặn.
function winLine(board, n, idx, rule) {
  const v = board[idx], r = Math.floor(idx / n), c = idx % n, opp = 3 - v;
  for (const [dr, dc] of DIRS) {
    const L = lineAt(board, n, r, c, dr, dc, v);
    if (L.len < 5) continue;
    if (rule === "chan2" && L.endA === opp && L.endB === opp) continue;
    return L.cells;
  }
  return null;
}

// Máy đánh: chấm điểm tấn công + phòng thủ cho các ô gần quân đã có.
function shapeScore(len, open) {
  if (len >= 5) return 1e7;
  if (open === 0) return 0;
  if (len === 4) return open === 2 ? 2e5 : 2e4;
  if (len === 3) return open === 2 ? 1.5e4 : 800;
  if (len === 2) return open === 2 ? 500 : 60;
  return open === 2 ? 20 : 4;
}
function cellScore(board, n, idx, v, rule) {
  const r = Math.floor(idx / n), c = idx % n; let s = 0;
  board[idx] = v;
  for (const [dr, dc] of DIRS) {
    const L = lineAt(board, n, r, c, dr, dc, v), opp = 3 - v;
    if (L.len >= 5) { s += rule === "chan2" && L.endA === opp && L.endB === opp ? 0 : 1e7; continue; }
    const open = (L.endA === 0 ? 1 : 0) + (L.endB === 0 ? 1 : 0);
    s += shapeScore(L.len, open);
  }
  board[idx] = 0;
  return s;
}
function botPick(board, n, v, rule) {
  const cand = [];
  let any = false;
  for (let i = 0; i < n * n; i++) {
    if (board[i]) { any = true; continue; }
    const r = Math.floor(i / n), c = i % n; let near = false;
    for (let dr = -2; dr <= 2 && !near; dr++) for (let dc = -2; dc <= 2 && !near; dc++) {
      const rr = r + dr, cc = c + dc;
      if (rr >= 0 && cc >= 0 && rr < n && cc < n && board[rr * n + cc]) near = true;
    }
    if (near) cand.push(i);
  }
  if (!any) return Math.floor(n / 2) * n + Math.floor(n / 2);
  if (!cand.length) { const e = board.findIndex((x) => !x); return e; }
  let best = cand[0], bestS = -1;
  for (const i of cand) {
    const s = cellScore(board, n, i, v, rule) * 1.1 + cellScore(board, n, i, 3 - v, rule) + Math.random();
    if (s > bestS) { bestS = s; best = i; }
  }
  return best;
}

function attach(io) {
  const nsp = io.of("/caro");
  const rooms = new Map();
  const SYM = ["X", "O"];

  function getRoom(id) {
    let r = rooms.get(id);
    if (!r) {
      r = {
        id, people: new Map(), sockets: new Map(), seats: [null, null], host: null, admins: new Set(),
        rules: { ...DEFAULT_RULES }, phase: "lobby", board: [], turn: 0, first: 0, deadline: 0, timer: null,
        last: -1, moves: 0, winner: null, line: null, reason: "", score: {}, gameNo: 0, log: [], emptySince: null,
      };
      rooms.set(id, r);
    }
    return r;
  }
  const onlinePids = (room) => new Set(room.sockets.values());
  const seatName = (room, i) => { const s = room.seats[i]; if (!s) return SYM[i]; return s.bot ? s.name : (room.people.get(s.pid)?.name || "Người chơi"); };
  const seatKey = (room, i) => { const s = room.seats[i]; return s ? (s.bot ? "bot:" + s.name : s.pid) : null; };
  function addLog(room, text, seat = null) { room.log.push({ t: Date.now(), text, seat }); if (room.log.length > 40) room.log.shift(); }

  function publicState(room, pid) {
    const online = onlinePids(room);
    return {
      room: room.id, now: Date.now(), me: pid, host: room.host, rules: room.rules, phase: room.phase,
      isAdmin: room.admins.has(pid), hostLocked: [...room.admins].some((p) => online.has(p)), hostOnline: online.has(room.host), hostSeated: room.seats.some((s) => s && s.pid === room.host),
      seats: room.seats.map((s, i) => s && { pid: s.pid || null, bot: !!s.bot, name: seatName(room, i), online: s.bot || online.has(s.pid), wins: room.score[seatKey(room, i)] || 0 }),
      spectators: [...room.people.entries()].filter(([k]) => online.has(k) && !room.seats.some((s) => s && s.pid === k)).map(([k, v]) => ({ pid: k, name: v.name })),
      board: room.board, turn: room.turn, first: room.first, deadline: room.deadline, last: room.last, moves: room.moves,
      winner: room.winner, line: room.line, reason: room.reason, gameNo: room.gameNo, log: room.log.slice(-20),
    };
  }
  function broadcast(room) {
    room.sockets.forEach((pid, sid) => { const s = nsp.sockets.get(sid); if (s) s.emit("state", publicState(room, pid)); });
  }
  function fixHost(room) {
    const online = onlinePids(room), adm = [...room.admins].find((p) => online.has(p));
    if (adm) { room.host = adm; return; }
    if (room.host && online.has(room.host)) return;
    room.host = [...online][0] || room.host;
  }
  function schedule(room, ms, fn) { clearTimeout(room.timer); room.timer = setTimeout(fn, ms); }

  function beginTurn(room) {
    const s = room.seats[room.turn], n = room.rules.size;
    if (s.bot) { room.deadline = 0; schedule(room, 700, () => place(room, botPick(room.board, n, room.turn + 1, room.rules.win))); }
    else if (room.rules.turnSec) {
      room.deadline = Date.now() + room.rules.turnSec * 1000;
      schedule(room, room.rules.turnSec * 1000, () => place(room, botPick(room.board, n, room.turn + 1, room.rules.win), true));
    } else { room.deadline = 0; clearTimeout(room.timer); }
    broadcast(room);
  }
  function finish(room, winner, reason) {
    clearTimeout(room.timer); room.phase = "over"; room.winner = winner; room.reason = reason; room.deadline = 0;
    if (winner != null) { const k = seatKey(room, winner); room.score[k] = (room.score[k] || 0) + 1; }
    broadcast(room);
  }
  function place(room, idx, auto) {
    const n = room.rules.size;
    if (room.phase !== "playing" || !Number.isInteger(idx) || idx < 0 || idx >= n * n || room.board[idx]) return;
    clearTimeout(room.timer);
    const seat = room.turn;
    room.board[idx] = seat + 1; room.last = idx; room.moves++;
    if (auto) addLog(room, seatName(room, seat) + " hết giờ, máy đánh giúp.", seat);
    const line = winLine(room.board, n, idx, room.rules.win);
    if (line) { room.line = line; addLog(room, "🏆 " + seatName(room, seat) + " (" + SYM[seat] + ") thắng sau " + room.moves + " nước!", seat); return finish(room, seat, "5 con liền"); }
    if (room.moves >= n * n) { addLog(room, "Kín bàn cờ, hoà!"); return finish(room, null, "Hoà"); }
    room.turn = 1 - seat;
    beginTurn(room);
  }
  function startGame(room) {
    if (!room.seats[0] || !room.seats[1]) return;
    const n = room.rules.size;
    room.phase = "playing"; room.gameNo++; room.board = new Array(n * n).fill(0);
    room.first = room.gameNo % 2 === 1 ? 0 : 1; // đổi lượt đi trước mỗi ván
    room.turn = room.first; room.last = -1; room.moves = 0; room.winner = null; room.line = null; room.reason = ""; room.log = [];
    addLog(room, "Ván " + room.gameNo + ": " + seatName(room, room.first) + " (" + SYM[room.first] + ") đi trước.");
    beginTurn(room);
  }

  nsp.on("connection", (socket) => {
    let room = null, pid = null;
    const isHost = () => room && room.host === pid;
    const mySeat = () => (room ? room.seats.findIndex((s) => s && !s.bot && s.pid === pid) : -1);

    socket.on("join", (msg = {}) => {
      const rid = String(msg.room || "chung").toLowerCase().replace(/[^a-z0-9-]/g, "").slice(0, 24) || "chung";
      pid = String(msg.pid || "").replace(/[^a-zA-Z0-9]/g, "").slice(0, 32) || socket.id;
      const name = String(msg.name || "").trim().slice(0, 24) || "Người chơi";
      if (room) { room.sockets.delete(socket.id); socket.leave(room.id); }
      room = getRoom(rid); room.emptySince = null;
      if (admin.isAdmin(msg.token)) room.admins.add(pid); else room.admins.delete(pid);
      room.people.set(pid, { name });
      room.sockets.set(socket.id, pid);
      socket.join(rid);
      fixHost(room); broadcast(room);
    });
    socket.on("rename", (name) => { if (!room) return; room.people.set(pid, { name: String(name || "").trim().slice(0, 24) || "Người chơi" }); broadcast(room); });
    socket.on("adminLogin", (m = {}) => {
      const r = admin.login(socket.handshake.address + "|" + socket.id, String(m.user || ""), String(m.pass || ""));
      socket.emit("adminResult", r);
      if (r.ok && room) { room.admins.add(pid); fixHost(room); broadcast(room); }
    });
    socket.on("adminLogout", () => { if (!room) return; room.admins.delete(pid); fixHost(room); broadcast(room); });
    socket.on("claimHost", () => {
      if (!room || room.host === pid || mySeat() < 0) return;
      const on = onlinePids(room);
      if ([...room.admins].some((p) => on.has(p))) return;
      if (on.has(room.host) && room.seats.some((s) => s && s.pid === room.host)) return;
      room.host = pid; broadcast(room);
    });
    socket.on("sit", (i) => {
      if (!room || room.phase === "playing" || ![0, 1].includes(i) || room.seats[i]) return;
      const cur = mySeat(); if (cur >= 0) room.seats[cur] = null;
      room.seats[i] = { pid }; broadcast(room);
    });
    socket.on("stand", () => { if (!room || room.phase === "playing") return; const cur = mySeat(); if (cur >= 0) { room.seats[cur] = null; broadcast(room); } });
    socket.on("addBot", (i) => {
      if (!isHost() || ![0, 1].includes(i)) return;
      const s = room.seats[i];
      if (room.phase !== "playing" && !s) room.seats[i] = { bot: true, name: "Máy " + SYM[i] };
      else if (room.phase === "playing" && s && !s.bot) {
        room.seats[i] = { bot: true, name: "Máy (thay " + seatName(room, i) + ")" };
        if (room.turn === i) beginTurn(room);
      } else return;
      broadcast(room);
    });
    socket.on("kick", (i) => { if (!isHost() || room.phase === "playing" || ![0, 1].includes(i)) return; room.seats[i] = null; broadcast(room); });
    socket.on("swap", () => { if (!isHost() || room.phase === "playing") return; room.seats.reverse(); broadcast(room); });
    socket.on("rules", (r) => { if (!isHost() || room.phase === "playing") return; room.rules = sanitizeRules(r); broadcast(room); });
    socket.on("resetScore", () => { if (!isHost() || room.phase === "playing") return; room.score = {}; broadcast(room); });
    socket.on("start", () => { if (!isHost() || room.phase === "playing") return; startGame(room); });
    socket.on("restart", () => { if (!isHost() || room.phase === "lobby") return; clearTimeout(room.timer); startGame(room); });
    socket.on("lobby", () => { if (!isHost() || room.phase === "lobby") return; clearTimeout(room.timer); room.phase = "lobby"; room.deadline = 0; broadcast(room); });
    socket.on("resign", () => {
      if (!room || room.phase !== "playing") return; const me = mySeat(); if (me < 0) return;
      addLog(room, seatName(room, me) + " xin thua.", me); finish(room, 1 - me, "Đối thủ xin thua");
    });
    socket.on("place", (idx) => { if (!room || room.phase !== "playing" || mySeat() !== room.turn) return; place(room, Number(idx)); });

    socket.on("disconnect", () => {
      if (!room) return;
      room.sockets.delete(socket.id);
      if (!room.sockets.size) room.emptySince = Date.now();
      if (room.phase === "lobby" && !onlinePids(room).has(pid)) { const cur = mySeat(); if (cur >= 0) room.seats[cur] = null; }
      fixHost(room); broadcast(room);
    });
  });

  setInterval(() => {
    const now = Date.now();
    rooms.forEach((r, id) => { if (r.emptySince && now - r.emptySince > 30 * 60 * 1000) { clearTimeout(r.timer); rooms.delete(id); } });
  }, 60 * 1000);
}

module.exports = { attach, winLine, botPick, sanitizeRules, DEFAULT_RULES };
