// Cờ Cá Ngựa Online — logic luật + phòng chơi (Socket.IO namespace "/ca-ngua")
//
// Bàn 15x15: đường đi 52 ô, mỗi màu có 6 bậc chuồng đánh số 1–6.
// Mã vị trí ngựa: -1 = trong chuồng xuất phát, 0..50 = số ô đã đi kể từ ô xuất quân
// (50 = ô cửa chuồng, ngay trước bậc 1), 51..56 = bậc chuồng 1..6.

const TRACK = 52;
const START = [14, 27, 40, 1]; // chỉ số ô xuất quân của 4 màu trên vòng 52 ô
const GATE = 50;
const COLORS = ["Đỏ", "Xanh dương", "Vàng", "Xanh lá"];

const DEFAULT_RULES = {
  exit: "6",         // "6": chỉ gieo 6 mới xuất quân · "16": gieo 1 hoặc 6
  bonus: "6",        // "6" | "16": gieo được số này thì được gieo thêm
  threeSix: true,    // gieo thưởng 3 lần liên tiếp thì mất lượt
  noJump: true,      // cấm nhảy qua đầu ngựa khác (cản đường)
  safeStart: true,   // ngựa đứng trên ô xuất quân của chính mình thì không bị đá
  kickBonus: false,  // đá được ngựa thì được gieo thêm
  home: "nhay-vao",  // "nhay-vao" | "tung-bac" | "nhay-bac" | "dem-o" — cách lên chuồng
  win: "top4",       // "top4": 4 ngựa ở bậc 3–6 · "all4": 4 ngựa vào chuồng là thắng
  rankAll: true,     // chơi tiếp để xếp hạng nhì, ba
  turnSec: 20,       // giây cho mỗi lượt (0 = không giới hạn)
};

function sanitizeRules(r = {}) {
  const d = DEFAULT_RULES, out = { ...d };
  if (["6", "16"].includes(r.exit)) out.exit = r.exit;
  if (["6", "16"].includes(r.bonus)) out.bonus = r.bonus;
  for (const k of ["threeSix", "noJump", "safeStart", "kickBonus", "rankAll"]) if (typeof r[k] === "boolean") out[k] = r[k];
  if (["nhay-vao", "tung-bac", "nhay-bac", "dem-o"].includes(r.home)) out.home = r.home;
  if (["top4", "all4"].includes(r.win)) out.win = r.win;
  if ([0, 10, 15, 20, 30, 45].includes(Number(r.turnSec))) out.turnSec = Number(r.turnSec);
  return out;
}

const absOf = (seat, p) => (START[seat] + p) % TRACK;
const isBonusRoll = (rules, d) => d === 6 || (rules.bonus === "16" && d === 1);
const canExit = (rules, d) => d === 6 || (rules.exit === "16" && d === 1);

// ---------- pure rules ----------
function occupantAt(horses, abs) {
  for (let s = 0; s < 4; s++) {
    if (!horses[s]) continue;
    for (let h = 0; h < 4; h++) {
      const p = horses[s][h];
      if (p >= 0 && p <= GATE && absOf(s, p) === abs) return { seat: s, h };
    }
  }
  return null;
}
// Ngựa cản đường: ngựa đang được bảo vệ trên ô xuất quân của nó không bị đá nhưng cũng không chắn đường
const blocks = (horses, rules, abs) => {
  const o = occupantAt(horses, abs);
  return !!o && !(rules.safeStart && horses[o.seat][o.h] === 0);
};
const homeTaken = (horses, seat, step) => horses[seat].some((p) => p === GATE + step);

/** Trả về {to, kick} nếu ngựa (seat,h) đi được với số d, ngược lại null. */
function legalMove(horses, rules, seat, h, d) {
  const p = horses[seat][h];
  // 1. Xuất quân
  if (p === -1) {
    if (!canExit(rules, d)) return null;
    const occ = occupantAt(horses, START[seat]);
    if (occ && occ.seat === seat) return null;
    if (occ && rules.safeStart && horses[occ.seat][occ.h] === 0) return null;
    return { to: 0, kick: occ };
  }
  // 2. Trong chuồng đích (bậc 1–6)
  if (p > GATE) {
    const step = p - GATE;
    let target;
    if (rules.home === "tung-bac" || rules.home === "nhay-vao") target = d === step + 1 ? step + 1 : null;
    else if (rules.home === "nhay-bac") target = d > step ? d : null;
    else target = step + d;
    if (!target || target > 6) return null;
    for (let s = step + 1; s < target; s++) if (rules.noJump && homeTaken(horses, seat, s)) return null;
    if (homeTaken(horses, seat, target)) return null;
    return { to: GATE + target, kick: null };
  }
  // 3. Đứng ở cửa chuồng → lên bậc
  if (p === GATE && rules.home !== "dem-o") {
    const target = rules.home === "tung-bac" ? (d === 1 ? 1 : null) : d;
    if (!target) return null;
    for (let s = 1; s < target; s++) if (rules.noJump && homeTaken(horses, seat, s)) return null;
    if (homeTaken(horses, seat, target)) return null;
    return { to: GATE + target, kick: null };
  }
  // 4. Đi trên đường
  const t = p + d;
  if (t > GATE) {
    if (rules.home !== "dem-o") return null; // phải dừng đúng cửa chuồng
    const step = t - GATE;
    if (step > 6) return null;
    if (rules.noJump) {
      for (let q = p + 1; q <= GATE; q++) if (blocks(horses, rules, absOf(seat, q))) return null;
      for (let s = 1; s < step; s++) if (homeTaken(horses, seat, s)) return null;
    }
    if (homeTaken(horses, seat, step)) return null;
    return { to: t, kick: null };
  }
  if (rules.noJump) for (let q = p + 1; q < t; q++) if (blocks(horses, rules, absOf(seat, q))) return null;
  const occ = occupantAt(horses, absOf(seat, t));
  if (occ && occ.seat === seat) return null;
  if (occ && rules.safeStart && horses[occ.seat][occ.h] === 0) return null;
  return { to: t, kick: occ };
}

function hasWon(horses, rules, seat) {
  return horses[seat].every((p) => (rules.win === "top4" ? p >= GATE + 3 : p > GATE));
}

// Bot: chấm điểm từng nước đi
function botPick(horses, rules, seat, d, legal) {
  let best = legal[0], bestScore = -1e9;
  for (const h of legal) {
    const mv = legalMove(horses, rules, seat, h, d);
    const p = horses[seat][h];
    let s = Math.random() * 3;
    if (mv.kick) s += 100;
    if (mv.to > GATE) s += 70 + (mv.to - GATE) * 2;
    if (p === -1) s += 55;
    if (mv.to <= GATE && mv.to >= 0) {
      s += mv.to * 0.5;
      if (p >= 0 && danger(horses, seat, p)) s += 30;
      if (danger(horses, seat, mv.to, h)) s -= 25;
      if (mv.to === GATE) s += 20;
    }
    if (s > bestScore) { bestScore = s; best = h; }
  }
  return best;
}
// Có ngựa đối thủ đứng 1–6 ô phía sau vị trí p (trên đường) không?
function danger(horses, seat, p) {
  if (p < 0 || p > GATE) return false;
  const abs = absOf(seat, p);
  for (let s = 0; s < 4; s++) {
    if (s === seat || !horses[s]) continue;
    for (const q of horses[s]) {
      if (q < 0 || q >= GATE) continue;
      const qa = absOf(s, q);
      const dist = (abs - qa + TRACK) % TRACK;
      // đối thủ chỉ đi tới được nếu chưa quá cửa chuồng của họ
      if (dist >= 1 && dist <= 6 && q + dist <= GATE) return true;
    }
  }
  return false;
}

// ---------- rooms ----------
const admin = require("./admin");

function attach(io) {
  const nsp = io.of("/ca-ngua");
  const rooms = new Map();

  function getRoom(id) {
    let r = rooms.get(id);
    if (!r) {
      r = {
        id, people: new Map(), sockets: new Map(), seats: [null, null, null, null], host: null, admins: new Set(),
        rules: { ...DEFAULT_RULES }, phase: "lobby", turn: 0, horses: [null, null, null, null],
        dice: null, rolled: false, legal: [], streak: 0, deadline: 0, ranking: [], log: [],
        last: null, timer: null, emptySince: null, gameNo: 0,
      };
      rooms.set(id, r);
    }
    return r;
  }
  const onlinePids = (room) => new Set(room.sockets.values());
  const seatName = (room, i) => { const s = room.seats[i]; if (!s) return COLORS[i]; return s.bot ? s.name : (room.people.get(s.pid)?.name || "Người chơi"); };
  function addLog(room, text, seat = null) { room.log.push({ t: Date.now(), text, seat }); if (room.log.length > 60) room.log.shift(); }

  function publicState(room, pid) {
    const online = onlinePids(room);
    return {
      room: room.id, now: Date.now(), me: pid, host: room.host, rules: room.rules, phase: room.phase,
      isAdmin: room.admins.has(pid), hostLocked: [...room.admins].some((p) => online.has(p)), hostOnline: online.has(room.host), hostSeated: room.seats.some((s) => s && s.pid === room.host),
      seats: room.seats.map((s, i) => s && { pid: s.pid || null, bot: !!s.bot, name: seatName(room, i), online: s.bot || online.has(s.pid) }),
      spectators: [...room.people.entries()].filter(([k]) => online.has(k) && !room.seats.some((s) => s && s.pid === k)).map(([k, v]) => ({ pid: k, name: v.name })),
      turn: room.turn, horses: room.horses, dice: room.dice, rolled: room.rolled, legal: room.legal, streak: room.streak,
      deadline: room.deadline, ranking: room.ranking, log: room.log.slice(-30), last: room.last, gameNo: room.gameNo,
    };
  }
  function broadcast(room) {
    room.sockets.forEach((pid, sid) => { const s = nsp.sockets.get(sid); if (s) s.emit("state", publicState(room, pid)); });
  }
  function fixHost(room) {
    const online = onlinePids(room), adms = [...room.admins].filter((p) => online.has(p));
    const sat = (p) => room.seats.some((s) => s && !s.bot && s.pid === p);
    if (adms.length) { // tài khoản chủ phòng luôn làm chủ; nhiều máy cùng đăng nhập thì ưu tiên máy đang ngồi chơi
      const seated = adms.filter(sat);
      if (adms.includes(room.host) && (sat(room.host) || !seated.length)) return;
      room.host = (seated.length ? seated : adms).pop(); return;
    }
    if (room.host && online.has(room.host)) return;
    room.host = [...online][0] || room.host;
  }


  // ---- turn engine ----
  const activeSeats = (room) => room.seats.map((s, i) => i).filter((i) => room.seats[i] && !room.ranking.includes(i));
  function schedule(room, ms, fn) { clearTimeout(room.timer); room.timer = setTimeout(fn, ms); }

  function beginTurn(room, seat, keepStreak) {
    room.turn = seat; room.dice = null; room.rolled = false; room.legal = [];
    if (!keepStreak) room.streak = 0;
    const s = room.seats[seat];
    if (s.bot) { room.deadline = 0; schedule(room, 900, () => doRoll(room)); }
    else if (room.rules.turnSec) { room.deadline = Date.now() + room.rules.turnSec * 1000; schedule(room, room.rules.turnSec * 1000, () => doRoll(room, true)); }
    else { room.deadline = 0; clearTimeout(room.timer); }
    broadcast(room);
  }
  function nextSeat(room, from) {
    const act = activeSeats(room);
    for (let k = 1; k <= 4; k++) { const i = (from + k) % 4; if (act.includes(i)) return i; }
    return from;
  }
  function endTurn(room, bonus) {
    if (room.phase !== "playing") return;
    if (bonus) beginTurn(room, room.turn, true);
    else beginTurn(room, nextSeat(room, room.turn), false);
  }

  function doRoll(room, auto) {
    if (room.phase !== "playing" || room.rolled) return;
    const seat = room.turn, d = 1 + Math.floor(Math.random() * 6);
    room.dice = d; room.rolled = true;
    const bonus = isBonusRoll(room.rules, d);
    if (bonus) room.streak += 1;
    const who = seatName(room, seat);
    if (bonus && room.rules.threeSix && room.streak >= 3) {
      addLog(room, who + " gieo " + d + " lần thưởng thứ 3 liên tiếp, mất lượt.", seat);
      room.legal = []; room.last = null; room.deadline = 0; broadcast(room);
      return schedule(room, 1500, () => endTurn(room, false));
    }
    room.legal = [0, 1, 2, 3].filter((h) => legalMove(room.horses, room.rules, seat, h, d));
    if (!room.legal.length) {
      addLog(room, who + (auto ? " (hết giờ, tự gieo)" : "") + " gieo " + d + ", không có nước đi" + (bonus ? ", được gieo thêm." : "."), seat);
      room.deadline = 0; broadcast(room);
      return schedule(room, 1400, () => endTurn(room, bonus));
    }
    const s = room.seats[seat];
    if (s.bot) {
      room.deadline = 0; broadcast(room);
      const h = s.bot ? botPick(room.horses, room.rules, seat, d, room.legal) : room.legal[0];
      return schedule(room, s.bot ? 900 : 1100, () => doMove(room, h));
    }
    if (room.rules.turnSec) {
      room.deadline = Date.now() + room.rules.turnSec * 1000;
      schedule(room, room.rules.turnSec * 1000, () => doMove(room, botPick(room.horses, room.rules, seat, d, room.legal), true));
    } else room.deadline = 0;
    broadcast(room);
  }

  function doMove(room, h, auto) {
    if (room.phase !== "playing" || !room.rolled || !room.legal.includes(h)) return;
    const seat = room.turn, d = room.dice;
    const mv = legalMove(room.horses, room.rules, seat, h, d);
    if (!mv) return;
    clearTimeout(room.timer);
    const from = room.horses[seat][h];
    room.horses[seat][h] = mv.to;
    const who = seatName(room, seat);
    let text = who + (auto ? " (hết giờ, tự đi)" : "") + " gieo " + d + ": ";
    if (from === -1) text += "xuất quân ngựa " + (h + 1);
    else if (mv.to > GATE) text += "ngựa " + (h + 1) + " lên bậc " + (mv.to - GATE);
    else if (mv.to === GATE) text += "ngựa " + (h + 1) + " tới cửa chuồng";
    else text += "ngựa " + (h + 1) + " đi " + d + " ô";
    if (mv.kick) { room.horses[mv.kick.seat][mv.kick.h] = -1; text += ", đá ngựa của " + seatName(room, mv.kick.seat) + " về chuồng!"; }
    else text += ".";
    addLog(room, text, seat);
    room.last = { seat, h, from, to: mv.to, kick: mv.kick, n: (room.last?.n || 0) + 1 };
    room.legal = []; room.deadline = 0;

    if (hasWon(room.horses, room.rules, seat)) {
      room.ranking.push(seat);
      addLog(room, "🏆 " + who + " về đích hạng " + room.ranking.length + "!", seat);
      const left = activeSeats(room);
      if (!room.rules.rankAll || left.length < 2) {
        if (room.rules.rankAll && left.length === 1) room.ranking.push(left[0]);
        room.phase = "over"; clearTimeout(room.timer); broadcast(room); return;
      }
      broadcast(room);
      return schedule(room, 1200, () => beginTurn(room, nextSeat(room, seat), false));
    }
    const bonus = isBonusRoll(room.rules, d) || (room.rules.kickBonus && !!mv.kick);
    broadcast(room);
    schedule(room, 700, () => endTurn(room, bonus));
  }

  function startGame(room) {
    const filled = room.seats.filter(Boolean).length;
    if (filled < 2) return;
    room.phase = "playing"; room.gameNo += 1; room.ranking = []; room.log = []; room.last = null;
    room.horses = room.seats.map((s) => (s ? [-1, -1, -1, -1] : null));
    addLog(room, "Ván mới bắt đầu!");
    const first = room.seats.findIndex(Boolean);
    beginTurn(room, first, false);
  }

  nsp.on("connection", (socket) => {
    let room = null, pid = null;
    const isHost = () => room && room.host === pid;
    const mySeat = () => (room ? room.seats.findIndex((s) => s && !s.bot && s.pid === pid) : -1);

    require("./chatsrv").attachChat(nsp, socket, () => room && { room, pid, name: room.people.get(pid)?.name || "Người chơi" });
    socket.on("join", (msg = {}) => {
      const rid = String(msg.room || "chung").toLowerCase().replace(/[^a-z0-9-]/g, "").slice(0, 24) || "chung";
      pid = String(msg.pid || "").replace(/[^a-zA-Z0-9]/g, "").slice(0, 32) || socket.id;
      const name = String(msg.name || "").trim().slice(0, 24) || "Người chơi";
      if (room) { room.sockets.delete(socket.id); socket.leave(room.id); }
      room = getRoom(rid); room.emptySince = null;
      if (admin.isAdmin(msg.token)) { room.admins.delete(pid); room.admins.add(pid); } else room.admins.delete(pid);
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
      if (!room || room.host === pid) return;
      if (room.admins.has(pid)) { room.host = pid; broadcast(room); return; }
      if (mySeat() < 0) return;
      const on = onlinePids(room);
      if ([...room.admins].some((p) => on.has(p))) return;
      if (on.has(room.host) && room.seats.some((s) => s && s.pid === room.host)) return;
      room.host = pid; broadcast(room);
    });
    socket.on("sit", (i) => {
      if (!room || room.phase !== "lobby" || ![0, 1, 2, 3].includes(i) || room.seats[i]) return;
      const cur = mySeat(); if (cur >= 0) room.seats[cur] = null;
      room.seats[i] = { pid }; fixHost(room); broadcast(room);
    });
    socket.on("stand", () => { if (!room || room.phase !== "lobby") return; const cur = mySeat(); if (cur >= 0) { room.seats[cur] = null; fixHost(room); broadcast(room); } });
    socket.on("addBot", (i) => {
      if (!isHost() || ![0, 1, 2, 3].includes(i)) return;
      const s = room.seats[i];
      if (room.phase === "lobby" && !s) room.seats[i] = { bot: true, name: "Máy " + COLORS[i] };
      else if (room.phase === "playing" && s && !s.bot) { // thay người vắng bằng máy
        room.seats[i] = { bot: true, name: "Máy (thay " + seatName(room, i) + ")" };
        if (room.turn === i) { clearTimeout(room.timer); if (!room.rolled) schedule(room, 600, () => doRoll(room)); else schedule(room, 600, () => doMove(room, botPick(room.horses, room.rules, i, room.dice, room.legal))); }
      } else return;
      broadcast(room);
    });
    socket.on("kick", (i) => { if (!isHost() || room.phase !== "lobby" || ![0, 1, 2, 3].includes(i)) return; room.seats[i] = null; broadcast(room); });
    socket.on("rules", (r) => { if (!isHost() || room.phase !== "lobby") return; room.rules = sanitizeRules(r); broadcast(room); });
    socket.on("start", () => { if (!isHost() || room.phase !== "lobby") return; startGame(room); });
    socket.on("restart", () => { if (!isHost() || room.phase === "lobby") return; clearTimeout(room.timer); startGame(room); });
    socket.on("lobby", () => { if (!isHost() || room.phase === "lobby") return; clearTimeout(room.timer); room.phase = "lobby"; room.dice = null; room.legal = []; broadcast(room); });

    socket.on("roll", () => { if (!room || room.phase !== "playing" || mySeat() !== room.turn) return; doRoll(room); });
    socket.on("skip", () => { // gieo xong nhưng chọn không đi
      if (!room || room.phase !== "playing" || mySeat() !== room.turn || !room.rolled || !room.legal.length) return;
      clearTimeout(room.timer); const d = room.dice;
      addLog(room, seatName(room, room.turn) + " gieo " + d + " nhưng chọn không đi" + (isBonusRoll(room.rules, d) ? ", được gieo thêm." : "."), room.turn);
      room.legal = []; room.last = null; room.deadline = 0; broadcast(room);
      schedule(room, 700, () => endTurn(room, isBonusRoll(room.rules, d)));
    });
    socket.on("move", (h) => { if (!room || room.phase !== "playing" || mySeat() !== room.turn) return; doMove(room, Number(h)); });

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

module.exports = { attach, legalMove, hasWon, botPick, DEFAULT_RULES, START, GATE };
