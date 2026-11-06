// Tài xỉu online: không nhà cái. Mỗi phiên 30 giây đặt cửa, lắc 3 xúc xắc.
// Tổng 11–17 là Tài, 4–10 là Xỉu. Quỹ cửa thua chia cho cửa thắng theo tỉ lệ tiền đặt.
// Ra bão (3 con giống nhau) hoặc chỉ một cửa có người đặt: hoàn tiền tất cả.
const BET_MS = Number(process.env.TX_BET_MS || 30000), ROLL_MS = 3500, SHOW_MS = 6000;
const MAX_BET = 10000000;

function settle(bets, dice) {
  // "Cân cửa": chỉ phần tiền khớp được giữa hai cửa mới tính. Cửa đông tiền hơn được hoàn lại phần lệch
  // theo tỉ lệ. Nhờ vậy ai thắng cũng chỉ ăn đúng bằng số tiền thực sự đưa vào, thắng thua 1 ăn 1.
  const total = dice[0] + dice[1] + dice[2], bao = dice[0] === dice[1] && dice[1] === dice[2];
  const side = total >= 11 ? "tai" : "xiu", net = {}, live = {};
  const ps = Object.keys(bets), by = { tai: ps.filter((p) => bets[p].side === "tai"), xiu: ps.filter((p) => bets[p].side === "xiu") };
  const sum = (arr) => arr.reduce((a, p) => a + bets[p].amt, 0), T = sum(by.tai), X = sum(by.xiu), M = Math.min(T, X);
  ps.forEach((p) => { net[p] = 0; live[p] = 0; });
  if (bao || !M) return { side, total, bao, refund: true, net, live };
  for (const k of ["tai", "xiu"]) { // tiền thực sự được tính của từng người
    const S = k === "tai" ? T : X; let given = 0;
    by[k].forEach((p) => { live[p] = Math.floor((bets[p].amt * M) / S); given += live[p]; });
    const top = by[k].slice().sort((a, b) => bets[b].amt - bets[a].amt)[0]; live[top] += M - given;
  }
  ps.forEach((p) => { net[p] = bets[p].side === side ? live[p] : -live[p]; });
  return { side, total, bao, refund: false, net, live };
}

function attach(io) {
  const nsp = io.of("/tai-xiu");
  const rooms = new Map();
  function getRoom(id) {
    let r = rooms.get(id);
    if (!r) {
      r = { id, people: new Map(), sockets: new Map(), phase: "idle", phien: 0, deadline: 0, bets: {}, dice: null, result: null, history: [], bxh: new Map(), timer: null, emptySince: null, log: [] };
      rooms.set(id, r);
    }
    return r;
  }
  const online = (room) => new Set(room.sockets.values());
  const nameOf = (room, pid) => room.people.get(pid)?.name || "Người chơi";
  const money = (n) => String(Math.abs(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  function log(room, t) { room.log.push(t); if (room.log.length > 30) room.log.shift(); }

  function view(room, pid) {
    const on = online(room), sum = { tai: { amt: 0, n: 0 }, xiu: { amt: 0, n: 0 } };
    for (const p in room.bets) { const b = room.bets[p]; sum[b.side].amt += b.amt; sum[b.side].n++; }
    return {
      room: room.id, me: pid, now: Date.now(), phase: room.phase, phien: room.phien, deadline: room.deadline,
      sum, myBet: room.bets[pid] || null, stake: room.stake ? { amt: room.stake.amt, by: nameOf(room, room.stake.pid) } : null, dice: room.phase === "betting" ? null : room.dice, result: room.result,
      history: room.history.slice(-24),
      bets: room.phase === "betting" ? null : Object.entries(room.bets).map(([p, b]) => ({ name: nameOf(room, p), side: b.side, amt: b.amt, net: room.result ? room.result.net[p] || 0 : 0, pid: p })),
      bxh: [...room.bxh.entries()].map(([p, v]) => ({ pid: p, name: nameOf(room, p), total: v })).sort((a, b) => b.total - a.total),
      players: [...room.people.keys()].filter((p) => on.has(p)).map((p) => nameOf(room, p)),
      log: room.log.slice(-15),
    };
  }
  function broadcast(room) { room.sockets.forEach((pid, sid) => { const s = nsp.sockets.get(sid); if (s) s.emit("state", view(room, pid)); }); }

  function startBetting(room) {
    clearTimeout(room.timer);
    if (!room.sockets.size) { room.phase = "idle"; return; }
    room.phien++; room.phase = "betting"; room.bets = {}; room.stake = null; room.dice = null; room.result = null; room.deadline = Date.now() + BET_MS;
    room.timer = setTimeout(() => roll(room), BET_MS);
    broadcast(room);
  }
  function roll(room) {
    room.phase = "rolling"; room.dice = [1, 2, 3].map(() => 1 + Math.floor(Math.random() * 6)); room.deadline = Date.now() + ROLL_MS;
    broadcast(room);
    room.timer = setTimeout(() => reveal(room), ROLL_MS);
  }
  function reveal(room) {
    const r = settle(room.bets, room.dice);
    for (const p in r.net) if (r.net[p]) room.bxh.set(p, (room.bxh.get(p) || 0) + r.net[p]);
    room.result = r; room.phase = "result"; room.deadline = Date.now() + SHOW_MS;
    room.history.push({ phien: room.phien, dice: room.dice, total: r.total, side: r.side, bao: r.bao }); if (room.history.length > 60) room.history.shift();
    const lbl = r.bao ? "BÃO " + room.dice[0] : (r.side === "tai" ? "TÀI" : "XỈU");
    const nb = Object.keys(room.bets).length;
    log(room, "Phiên #" + room.phien + ": " + room.dice.join("-") + " = " + r.total + " → " + lbl + (nb ? (r.refund ? " · hoàn tiền" : "") : " · không ai đặt"));
    broadcast(room);
    room.timer = setTimeout(() => startBetting(room), SHOW_MS);
  }

  nsp.on("connection", (socket) => {
    let room = null, pid = null;
    require("./chatsrv").attachChat(nsp, socket, () => room && { room, pid, name: nameOf(room, pid) });
    socket.on("join", (m = {}) => {
      const rid = String(m.room || "chung").toLowerCase().replace(/[^a-z0-9-]/g, "").slice(0, 24) || "chung";
      pid = String(m.pid || "").replace(/[^a-zA-Z0-9]/g, "").slice(0, 32) || socket.id;
      if (room) room.sockets.delete(socket.id);
      room = getRoom(rid); room.emptySince = null;
      room.people.set(pid, { name: String(m.name || "").trim().slice(0, 24) || "Người chơi" });
      room.sockets.set(socket.id, pid);
      if (room.phase === "idle") startBetting(room); else broadcast(room);
    });
    socket.on("rename", (n) => { if (!room) return; room.people.set(pid, { name: String(n || "").trim().slice(0, 24) || "Người chơi" }); broadcast(room); });
    socket.on("bet", (b = {}) => {
      if (!room || room.phase !== "betting" || Date.now() > room.deadline - 300) return socket.emit("oops", "Đã hết giờ đặt cửa.");
      const side = b.side === "tai" ? "tai" : b.side === "xiu" ? "xiu" : null, amt = Math.floor(Number(b.amt));
      if (!side || !(amt > 0)) return;
      // người đặt đầu tiên quyết định mức cược của phiên, người sau đặt đúng mức đó
      if (room.bets[pid]) return socket.emit("oops", "Bạn đã đặt phiên này rồi. Bấm Huỷ cược nếu muốn đổi cửa.");
      if (!room.stake) { if (amt > MAX_BET) return socket.emit("oops", "Tối đa " + money(MAX_BET) + " mỗi phiên."); room.stake = { amt, pid }; log(room, "Phiên #" + room.phien + ": " + nameOf(room, pid) + " mở mức cược " + money(amt) + "."); }
      room.bets[pid] = { side, amt: room.stake.amt }; broadcast(room);
    });
    socket.on("cancelBet", () => { if (!room || room.phase !== "betting" || Date.now() > room.deadline - 300) return; delete room.bets[pid]; if (!Object.keys(room.bets).length) room.stake = null; broadcast(room); });
    socket.on("disconnect", () => {
      if (!room) return;
      room.sockets.delete(socket.id);
      if (!room.sockets.size) room.emptySince = Date.now();
      broadcast(room);
    });
  });
  setInterval(() => {
    const now = Date.now();
    rooms.forEach((r, id) => { if (r.emptySince && now - r.emptySince > 30 * 60 * 1000) { clearTimeout(r.timer); rooms.delete(id); } });
  }, 60 * 1000);
}
module.exports = { attach, settle };
