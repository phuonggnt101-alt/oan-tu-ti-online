// Game bài online: Sâm lốc, Phỏm (tá lả), Ba cây — Socket.IO namespace "/bai"
// Lá bài: id 0..51, R = id >> 2 (0=A, 1=2, ..., 9=10, 10=J, 11=Q, 12=K), S = id & 3 (0 ♠, 1 ♣, 2 ♦, 3 ♥)
// Tiền chỉ là sổ ghi điểm trong phòng, không có thanh toán thật.

const R = (c) => c >> 2, S = (c) => c & 3;
const RN = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"];
const SN = ["♠", "♣", "♦", "♥"];
const cardName = (c) => RN[R(c)] + SN[S(c)];
function shuffled() { const d = [...Array(52).keys()]; for (let i = 51; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [d[i], d[j]] = [d[j], d[i]]; } return d; }

// ================= SÂM =================
// Thứ tự: 3 < 4 < ... < K < A < 2, không xét chất
const sv = (c) => (R(c) + 11) % 13; // 3→0 ... K→10, A→11, 2→12
function samCombo(cards) {
  const n = cards.length; if (!n) return null;
  const v = cards.map(sv).sort((a, b) => a - b);
  const same = v.every((x) => x === v[0]);
  if (n === 1) return { type: "single", len: 1, top: v[0] };
  if (same && n === 2) return { type: "pair", len: 2, top: v[0] };
  if (same && n === 3) return { type: "triple", len: 3, top: v[0] };
  if (same && n === 4) return { type: "four", len: 4, top: v[0] };
  if (n >= 3 && v[n - 1] < 12 && v.every((x, i) => i === 0 || x === v[i - 1] + 1)) return { type: "straight", len: n, top: v[n - 1] };
  return null;
}
function samBeats(a, lead) {
  if (!lead) return true;
  if (lead.type === "single" && lead.top === 12 && a.type === "four") return true; // tứ quý chặt heo
  return a.type === lead.type && a.len === lead.len && a.top > lead.top;
}

// ================= PHỎM =================
const pp = (c) => R(c) + 1; // điểm: A=1 ... K=13
function meldCandidates(hand) {
  const out = [], byR = {}, byS = [[], [], [], []];
  for (const c of hand) { (byR[R(c)] = byR[R(c)] || []).push(c); byS[S(c)].push(c); }
  for (const k in byR) {
    const g = byR[k];
    if (g.length === 3) out.push(g.slice());
    if (g.length === 4) { out.push(g.slice()); for (let i = 0; i < 4; i++) out.push(g.filter((_, j) => j !== i)); }
  }
  for (const g of byS) {
    g.sort((a, b) => R(a) - R(b));
    for (let i = 0; i < g.length; i++) {
      let j = i;
      while (j + 1 < g.length && R(g[j + 1]) === R(g[j]) + 1) j++;
      for (let a = i; a <= j; a++) for (let b = a + 2; b <= j; b++) out.push(g.slice(a, b + 1));
      i = j;
    }
  }
  return out;
}
/** Xếp phỏm tốt nhất: ít điểm rác nhất; mọi lá đã ăn phải nằm trong phỏm, mỗi phỏm tối đa 1 lá ăn. */
function bestArrangement(hand, eaten = []) {
  const cands = meldCandidates(hand).filter((m) => m.filter((c) => eaten.includes(c)).length <= 1);
  let best = null;
  const used = new Set();
  function rec(start, melds) {
    const left = hand.filter((c) => !used.has(c));
    if (eaten.every((c) => used.has(c))) {
      const pts = left.reduce((s, c) => s + pp(c), 0);
      if (!best || pts < best.pts || (pts === best.pts && left.length < best.left.length)) best = { melds: melds.map((m) => m.slice()), left, pts };
    }
    for (let i = start; i < cands.length; i++) {
      const m = cands[i];
      if (m.some((c) => used.has(c))) continue;
      m.forEach((c) => used.add(c)); melds.push(m);
      rec(i + 1, melds);
      melds.pop(); m.forEach((c) => used.delete(c));
    }
  }
  rec(0, []);
  return best; // null = không thể xếp đủ lá đã ăn
}
function canFitMeld(meld, c) {
  const rs = meld.map(R);
  if (rs.every((x) => x === rs[0])) return R(c) === rs[0] && meld.length < 4;
  if (!meld.every((x) => S(x) === S(c))) return false;
  const lo = Math.min(...rs), hi = Math.max(...rs);
  return R(c) === lo - 1 || R(c) === hi + 1;
}

// ================= BA CÂY =================
const bp = (c) => (R(c) < 9 ? R(c) + 1 : 0);
const SUIT_RANK = [1, 0, 3, 2]; // Rô > Cơ > Bích > Tép
const bestCardKey = (cards) => Math.max(...cards.map((c) => SUIT_RANK[S(c)] * 13 + ((R(c) + 12) % 13)));
function bacayScore(cards) {
  const baTay = cards.every((c) => R(c) >= 10);
  const pts = cards.reduce((s, c) => s + bp(c), 0) % 10;
  return { baTay, pts, key: (baTay ? 10 : pts) * 1000 + bestCardKey(cards) };
}

// ================= PHÒNG =================
const GAMES = {
  sam: { name: "Sâm lốc", min: 2, max: 5, unit: "lá", stake: 1000, turnMs: 20000 },
  phom: { name: "Phỏm", min: 2, max: 4, unit: "ván", stake: 5000, turnMs: 20000 },
  bacay: { name: "Ba cây", min: 2, max: 8, unit: "ván", stake: 10000, turnMs: 20000 },
};

const admin = require("./admin");

function attach(io) {
  const nsp = io.of("/bai");
  const rooms = new Map();

  function getRoom(game, id) {
    const key = game + ":" + id;
    let r = rooms.get(key);
    if (!r) {
      const G = GAMES[game];
      r = { key, game, id, people: new Map(), sockets: new Map(), seats: Array(G.max).fill(null), host: null,
        stake: G.stake, admins: new Set(), queue: [], phase: "lobby", st: null, timer: null, deadline: 0, bxh: new Map(), log: [], result: null, lastWinner: null, emptySince: null, roundNo: 0 };
      rooms.set(key, r);
    }
    return r;
  }
  const online = (room) => new Set(room.sockets.values());
  const nameOf = (room, pid) => room.people.get(pid)?.name || "Người chơi";
  function log(room, text) { room.log.push(text); if (room.log.length > 40) room.log.shift(); }
  function fixHost(room) {
    const on = online(room), adm = [...room.admins].find((p) => on.has(p));
    if (adm) { room.host = adm; return; } // tài khoản chủ phòng luôn làm chủ
    if (!room.host || !on.has(room.host)) room.host = [...on][0] || room.host;
  }
  function schedule(room, ms, fn) { clearTimeout(room.timer); room.deadline = ms ? Date.now() + ms : 0; if (ms) room.timer = setTimeout(fn, ms); }
  function pay(room, deltas, from, to, amount) { deltas[from] = (deltas[from] || 0) - amount; deltas[to] = (deltas[to] || 0) + amount; }
  function applyDeltas(room, deltas) {
    for (const pid in deltas) room.bxh.set(pid, (room.bxh.get(pid) || 0) + deltas[pid]);
  }

  // ---------- view per viewer ----------
  function view(room, pid) {
    const st = room.st, mySeat = room.seats.indexOf(pid);
    const on = online(room);
    const base = {
      game: room.game, gameName: GAMES[room.game].name, unit: GAMES[room.game].unit, room: room.id, me: pid, host: room.host,
      isAdmin: room.admins.has(pid), hostLocked: [...room.admins].some((p) => on.has(p)),
      hostName: nameOf(room, room.host), hostSeated: room.seats.includes(room.host), hostOnline: on.has(room.host),
      phase: room.phase, stake: room.stake, now: Date.now(), deadline: room.deadline, mySeat, roundNo: room.roundNo,
      seats: room.seats.map((p) => p && { pid: p, name: nameOf(room, p), online: on.has(p) }),
      bxh: [...room.bxh.entries()].map(([p, v]) => ({ pid: p, name: nameOf(room, p), total: v })).sort((a, b) => b.total - a.total),
      spectators: [...room.people.keys()].filter((p) => on.has(p) && !room.seats.includes(p)).map((p) => nameOf(room, p)),
      log: room.log.slice(-25), result: room.result,
      queue: room.queue.map((p) => nameOf(room, p)), queuePos: room.queue.indexOf(pid),
    };
    if (!st) return base;
    const show = room.phase === "result";
    const counts = {}; for (const s of st.order) counts[s] = st.hands[s].length;
    base.t = { order: st.order, turn: st.turn, counts, myHand: mySeat >= 0 && st.hands[mySeat] ? st.hands[mySeat] : null };
    if (room.game === "sam") Object.assign(base.t, { lead: st.lead, passed: [...st.passed], baoSam: st.baoSam, step: st.step, baoVotes: st.baoVotes, playedAny: st.playedAny });
    if (room.game === "phom") Object.assign(base.t, { step: st.step, discards: st.discards, eaten: st.eaten, deck: st.deck.length, last: st.last, discCount: st.discCount,
      canEat: mySeat === st.turn && st.step === "take" && canEat(st, mySeat) });
    if (room.game === "bacay") Object.assign(base.t, { shown: st.shown, hands: show ? st.hands : Object.fromEntries(st.order.map((s) => [s, st.shown[s] || s === mySeat ? st.hands[s] : null])) });
    if (show && room.game !== "bacay") base.t.hands = st.hands;
    if (show && room.game === "phom") base.t.laid = st.laid;
    return base;
  }
  function broadcast(room) { room.sockets.forEach((pid, sid) => { const s = nsp.sockets.get(sid); if (s) s.emit("state", view(room, pid)); }); }
  const seatPid = (room, s) => room.seats[s];
  const nextIn = (order, s) => order[(order.indexOf(s) + 1) % order.length];

  // Người trong hàng chờ được ngồi vào ghế trống khi ván kết thúc / ván mới bắt đầu
  function seatQueue(room) {
    const on = online(room);
    room.queue = room.queue.filter((p) => on.has(p) && !room.seats.includes(p));
    while (room.queue.length) {
      const i = room.seats.indexOf(null); if (i < 0) break;
      const p = room.queue.shift(); room.seats[i] = p;
      log(room, nameOf(room, p) + " từ hàng chờ vào ghế " + (i + 1) + ".");
    }
  }

  // ---------- START ----------
  function start(room) {
    seatQueue(room);
    const order = room.seats.map((p, i) => (p ? i : -1)).filter((i) => i >= 0);
    const G = GAMES[room.game];
    if (order.length < G.min) return;
    room.roundNo++; room.result = null; room.phase = "playing";
    const deck = shuffled(), hands = {};
    if (room.game === "sam") {
      for (const s of order) hands[s] = deck.splice(0, 10).sort((a, b) => sv(a) - sv(b) || a - b);
      room.st = { order, hands, turn: null, lead: null, passed: new Set(), baoSam: null, baoVotes: {}, playedAny: {}, chops: [], step: "bao" };
      log(room, "Ván " + room.roundNo + ": chia bài. Ai báo Sâm thì bấm trong 10 giây.");
      schedule(room, 10000, () => samBeginPlay(room));
    } else if (room.game === "phom") {
      const first = order.includes(room.lastWinnerSeat) ? room.lastWinnerSeat : order[0];
      for (const s of order) hands[s] = deck.splice(0, s === first ? 10 : 9).sort((a, b) => a - b);
      room.st = { order, hands, deck, turn: first, step: "discard", discards: {}, eaten: {}, discCount: {}, last: null, chot: [] };
      for (const s of order) { room.st.discards[s] = []; room.st.eaten[s] = []; room.st.discCount[s] = 0; }
      log(room, "Ván " + room.roundNo + ": " + nameOf(room, seatPid(room, first)) + " có 10 lá, đánh trước.");
      if (phomCheckU(room, first)) return;
      phomArm(room);
    } else {
      for (const s of order) hands[s] = deck.splice(0, 3);
      room.st = { order, hands, shown: {}, turn: null };
      const deltas = {};
      for (const s of order) deltas[seatPid(room, s)] = -room.stake;
      applyDeltas(room, deltas);
      room.st.paid = deltas;
      log(room, "Ván " + room.roundNo + ": mỗi người góp " + room.stake + ". Bấm Lật bài khi sẵn sàng.");
      schedule(room, GAMES.bacay.turnMs, () => bacayFinish(room));
    }
    broadcast(room);
  }

  // ---------- SÂM ----------
  function samBeginPlay(room) {
    const st = room.st; if (room.phase !== "playing" || st.step !== "bao") return;
    st.step = "play";
    if (st.baoSam != null) st.turn = st.baoSam;
    else if (st.order.includes(room.lastWinnerSeat)) st.turn = room.lastWinnerSeat;
    else { let best = null; for (const s of st.order) { const m = Math.min(...st.hands[s].map(sv)); if (best == null || m < best.m) best = { s, m }; } st.turn = best.s; }
    log(room, nameOf(room, seatPid(room, st.turn)) + " đi trước.");
    samArm(room); broadcast(room);
  }
  function samArm(room) {
    schedule(room, GAMES.sam.turnMs, () => {
      const st = room.st, s = st.turn;
      if (!st.lead) { const c = st.hands[s].slice().sort((a, b) => sv(a) - sv(b))[0]; samPlay(room, s, [c], true); }
      else samPass(room, s, true);
    });
  }
  function samAdvance(room) {
    const st = room.st; let s = st.turn;
    for (let k = 0; k < st.order.length; k++) {
      s = nextIn(st.order, s);
      if (st.lead && s === st.lead.by) { st.lead = null; st.passed.clear(); st.turn = s; log(room, nameOf(room, seatPid(room, s)) + " được đi vòng mới."); return; }
      if (!st.passed.has(s)) { st.turn = s; return; }
    }
  }
  function samPlay(room, s, cards, auto) {
    const st = room.st;
    if (st.step !== "play" || st.turn !== s) return "Chưa tới lượt bạn.";
    if (!cards.length || new Set(cards).size !== cards.length || !cards.every((c) => st.hands[s].includes(c))) return "Lá bài không hợp lệ.";
    const combo = samCombo(cards);
    if (!combo) return "Bộ bài không hợp lệ (đơn, đôi, sám, tứ quý hoặc sảnh từ 3 lá, sảnh không có 2).";
    if (!samBeats(combo, st.lead)) return "Bộ này không chặn được bài trên bàn.";
    const prev = st.lead;
    st.hands[s] = st.hands[s].filter((c) => !cards.includes(c));
    st.playedAny[s] = true;
    const who = nameOf(room, seatPid(room, s));
    if (prev && prev.type === "single" && prev.top === 12 && combo.type === "four") { st.chops.push({ from: prev.by, to: s }); log(room, "💥 " + who + " chặt heo của " + nameOf(room, seatPid(room, prev.by)) + "!"); }
    st.lead = { ...combo, cards, by: s };
    log(room, who + (auto ? " (hết giờ)" : "") + " đánh " + cards.map(cardName).join(" "));
    if (st.baoSam != null && s !== st.baoSam) return samFinish(room, null, "Chặn Sâm"), null;
    if (!st.hands[s].length) return samFinish(room, s), null;
    samAdvance(room); samArm(room); broadcast(room); return null;
  }
  function samPass(room, s, auto) {
    const st = room.st;
    if (st.step !== "play" || st.turn !== s) return "Chưa tới lượt bạn.";
    if (!st.lead) return "Bạn đang cầm cái, phải đánh.";
    st.passed.add(s);
    log(room, nameOf(room, seatPid(room, s)) + (auto ? " hết giờ, bỏ lượt." : " bỏ lượt."));
    samAdvance(room); samArm(room); broadcast(room); return null;
  }
  function samFinish(room, winner, reason) {
    const st = room.st, X = room.stake, deltas = {}, rows = [];
    const P = (s) => seatPid(room, s);
    if (reason === "Chặn Sâm") {
      const d = st.baoSam;
      for (const s of st.order) if (s !== d) pay(room, deltas, P(d), P(s), 20 * X);
      rows.push(nameOf(room, P(d)) + " báo Sâm bị chặn, đền mỗi người 20 lá.");
      winner = st.lead.by;
    } else if (st.baoSam != null && winner === st.baoSam) {
      for (const s of st.order) if (s !== winner) pay(room, deltas, P(s), P(winner), 20 * X);
      rows.push(nameOf(room, P(winner)) + " báo Sâm thành công, mỗi người trả 20 lá.");
    } else {
      for (const s of st.order) {
        if (s === winner) continue;
        const h = st.hands[s], heo = h.filter((c) => R(c) === 1).length;
        let la, note;
        if (!st.playedAny[s]) { la = 20; note = "cóng"; }
        else { la = h.length + 5 * heo; note = h.length + " lá" + (heo ? " + thối " + heo + " heo" : ""); }
        pay(room, deltas, P(s), P(winner), la * X);
        rows.push(nameOf(room, P(s)) + ": " + note + " = " + la + " lá");
      }
    }
    for (const ch of st.chops) { pay(room, deltas, P(ch.from), P(ch.to), 10 * X); rows.push(nameOf(room, P(ch.from)) + " bị chặt heo, trả " + nameOf(room, P(ch.to)) + " 10 lá"); }
    endRound(room, winner, deltas, rows);
  }

  // ---------- PHỎM ----------
  function canEat(st, s) {
    const L = st.last; if (!L || L.by === s || nextIn(st.order, L.by) !== s || L.eaten) return false;
    return !!bestArrangement(st.hands[s].concat(L.card), st.eaten[s].concat(L.card));
  }
  function phomArm(room) {
    schedule(room, GAMES.phom.turnMs, () => {
      const st = room.st, s = st.turn;
      if (st.step === "take") phomTake(room, s, "draw", true);
      else phomDiscard(room, s, phomAutoDiscard(st, s), true);
    });
  }
  function discardOk(st, s, c) {
    if (!st.hands[s].includes(c) || st.eaten[s].includes(c)) return false;
    return !!bestArrangement(st.hands[s].filter((x) => x !== c), st.eaten[s]);
  }
  function phomAutoDiscard(st, s) {
    const b = bestArrangement(st.hands[s], st.eaten[s]);
    const pool = (b ? b.left : st.hands[s]).filter((c) => discardOk(st, s, c)).sort((a, b2) => pp(b2) - pp(a));
    return pool[0] ?? st.hands[s].find((c) => discardOk(st, s, c));
  }
  function phomCheckU(room, s) {
    const st = room.st, b = bestArrangement(st.hands[s], st.eaten[s]);
    if (b && b.left.length <= 1 && st.hands[s].length >= 9) { phomFinish(room, s); return true; }
    return false;
  }
  function phomTake(room, s, how, auto) {
    const st = room.st;
    if (st.turn !== s || st.step !== "take") return "Chưa tới lượt bạn.";
    const who = nameOf(room, seatPid(room, s));
    if (how === "eat") {
      if (!canEat(st, s)) return "Không ăn được lá này (phải tạo được phỏm).";
      const L = st.last, c = L.card;
      st.discards[L.by] = st.discards[L.by].filter((x) => x !== c);
      st.hands[s].push(c); st.hands[s].sort((a, b) => a - b); st.eaten[s].push(c); L.eaten = true;
      const chot = st.discCount[L.by] >= 4;
      if (chot) st.chot.push({ from: L.by, to: s });
      log(room, who + " ăn " + cardName(c) + (chot ? " (cây chốt!)" : "") + ".");
    } else {
      if (!st.deck.length) return "Hết bài để bốc.";
      const c = st.deck.pop(); st.hands[s].push(c); st.hands[s].sort((a, b) => a - b);
      log(room, who + (auto ? " (hết giờ)" : "") + " bốc bài.");
    }
    st.step = "discard";
    if (phomCheckU(room, s)) return null;
    phomArm(room); broadcast(room); return null;
  }
  function phomDiscard(room, s, c, auto) {
    const st = room.st;
    if (st.turn !== s || st.step !== "discard") return "Chưa tới lượt đánh.";
    if (!discardOk(st, s, c)) return st.eaten[s].includes(c) ? "Không được đánh lá đã ăn." : "Đánh lá này sẽ phá phỏm có lá đã ăn.";
    st.hands[s] = st.hands[s].filter((x) => x !== c);
    st.discards[s].push(c); st.discCount[s]++;
    st.last = { card: c, by: s };
    log(room, nameOf(room, seatPid(room, s)) + (auto ? " (hết giờ)" : "") + " đánh " + cardName(c) + ".");
    if (st.order.every((x) => st.discCount[x] >= 4)) return phomFinish(room, null), null;
    st.turn = nextIn(st.order, s); st.step = "take";
    phomArm(room); broadcast(room); return null;
  }
  function phomFinish(room, uSeat) {
    const st = room.st, X = room.stake, deltas = {}, rows = [], P = (s) => seatPid(room, s);
    st.laid = {};
    if (uSeat != null) {
      st.laid[uSeat] = bestArrangement(st.hands[uSeat], st.eaten[uSeat]);
      for (const s of st.order) if (s !== uSeat) pay(room, deltas, P(s), P(uSeat), 5 * X);
      rows.push("🎉 " + nameOf(room, P(uSeat)) + " Ù! Mỗi người trả 5 ván.");
      for (const ch of st.chot) { pay(room, deltas, P(ch.from), P(ch.to), 4 * X); rows.push(nameOf(room, P(ch.from)) + " bị ăn cây chốt, trả thêm 4 ván."); }
      return endRound(room, uSeat, deltas, rows);
    }
    // hạ phỏm theo thứ tự, sau đó gửi bài
    const start = st.order.indexOf(nextIn(st.order, st.last.by));
    const seq = st.order.slice(start).concat(st.order.slice(0, start));
    for (const s of st.order) st.laid[s] = bestArrangement(st.hands[s], st.eaten[s]) || { melds: [], left: st.hands[s].slice(), pts: 0 };
    for (const s of seq) {
      const me = st.laid[s]; if (!me.melds.length) continue;
      let moved = true;
      while (moved) {
        moved = false;
        for (const c of me.left.slice()) {
          for (const o of st.order) {
            if (o === s) continue;
            const m = st.laid[o].melds.find((mm) => canFitMeld(mm, c));
            if (m) { m.push(c); me.left = me.left.filter((x) => x !== c); rows.push(nameOf(room, P(s)) + " gửi " + cardName(c) + " cho " + nameOf(room, P(o)) + "."); moved = true; break; }
          }
        }
      }
    }
    const score = (s) => st.laid[s].left.reduce((a, c) => a + pp(c), 0);
    const rank = st.order.slice().sort((a, b) => {
      const ma = !st.laid[a].melds.length, mb = !st.laid[b].melds.length;
      if (ma !== mb) return ma ? 1 : -1;
      return score(a) - score(b) || seq.indexOf(a) - seq.indexOf(b);
    });
    const winner = rank[0];
    rank.forEach((s, i) => {
      const mom = !st.laid[s].melds.length;
      const label = i === 0 ? "Nhất" : mom ? "Móm" : i === rank.length - 1 && rank.length > 2 ? "Bét" : ["", "Nhì", "Ba"][i];
      const mult = i === 0 ? 0 : mom ? 4 : i;
      if (mult) pay(room, deltas, P(s), P(winner), mult * X);
      rows.push(label + ": " + nameOf(room, P(s)) + " · " + (mom ? "không có phỏm" : score(s) + " điểm") + (mult ? " · trả " + mult + " ván" : ""));
    });
    for (const ch of st.chot) { pay(room, deltas, P(ch.from), P(ch.to), 4 * X); rows.push(nameOf(room, P(ch.from)) + " bị ăn cây chốt, trả " + nameOf(room, P(ch.to)) + " 4 ván."); }
    endRound(room, winner, deltas, rows);
  }

  // ---------- BA CÂY ----------
  function bacayFinish(room) {
    const st = room.st; if (room.phase !== "playing") return;
    const P = (s) => seatPid(room, s), n = st.order.length, pot = n * room.stake;
    const sc = {}; for (const s of st.order) sc[s] = bacayScore(st.hands[s]);
    const rank = st.order.slice().sort((a, b) => sc[b].key - sc[a].key);
    const shares = [0.5, 0.3, 0.2].slice(0, Math.min(3, n)), tot = shares.reduce((a, b) => a + b, 0);
    const prize = shares.map((x) => Math.floor((pot * x) / tot));
    prize[0] += pot - prize.reduce((a, b) => a + b, 0);
    const deltas = {}, rows = [];
    rank.forEach((s, i) => {
      const p = P(s); const win = prize[i] || 0;
      deltas[p] = (deltas[p] || 0) + win;
      rows.push((i < 3 ? ["Nhất", "Nhì", "Ba"][i] : "Hạng " + (i + 1)) + ": " + nameOf(room, p) + " · " + (sc[s].baTay ? "Ba tây" : sc[s].pts + " nút") + (win ? " · nhận " + win : ""));
    });
    applyDeltas(room, deltas);
    const net = {}; for (const s of st.order) { const p = P(s); net[p] = (st.paid[p] || 0) + (deltas[p] || 0); }
    room.phase = "result"; clearTimeout(room.timer); room.deadline = 0;
    room.lastWinnerSeat = rank[0];
    room.result = { winner: P(rank[0]), rows, net };
    seatQueue(room);
    log(room, "🏆 " + nameOf(room, P(rank[0])) + " nhất ván " + room.roundNo + ".");
    broadcast(room);
  }

  function endRound(room, winnerSeat, deltas, rows) {
    applyDeltas(room, deltas);
    room.phase = "result"; clearTimeout(room.timer); room.deadline = 0;
    room.lastWinnerSeat = winnerSeat;
    const w = seatPid(room, winnerSeat);
    room.result = { winner: w, rows, net: deltas };
    seatQueue(room);
    log(room, "🏆 " + nameOf(room, w) + " thắng ván " + room.roundNo + ".");
    broadcast(room);
  }

  // ---------- sockets ----------
  nsp.on("connection", (socket) => {
    let room = null, pid = null;
    const isHost = () => room && room.host === pid;
    const mySeat = () => (room ? room.seats.indexOf(pid) : -1);
    const reply = (err) => { if (err) socket.emit("oops", err); };

    socket.on("join", (m = {}) => {
      const game = GAMES[m.game] ? m.game : "sam";
      const rid = String(m.room || "chung").toLowerCase().replace(/[^a-z0-9-]/g, "").slice(0, 24) || "chung";
      pid = String(m.pid || "").replace(/[^a-zA-Z0-9]/g, "").slice(0, 32) || socket.id;
      if (room) { room.sockets.delete(socket.id); }
      room = getRoom(game, rid); room.emptySince = null;
      if (admin.isAdmin(m.token)) room.admins.add(pid); else room.admins.delete(pid);
      room.people.set(pid, { name: String(m.name || "").trim().slice(0, 24) || "Người chơi" });
      room.sockets.set(socket.id, pid);
      fixHost(room); broadcast(room);
    });
    socket.on("rename", (n) => { if (!room) return; room.people.set(pid, { name: String(n || "").trim().slice(0, 24) || "Người chơi" }); broadcast(room); });
    socket.on("sit", (i) => { if (!room || room.phase === "playing" || !Number.isInteger(i) || i < 0 || i >= room.seats.length || room.seats[i]) return; const c = mySeat(); if (c >= 0) room.seats[c] = null; room.seats[i] = pid; broadcast(room); });
    socket.on("queue", (on) => {
      if (!room || room.phase === "lobby" || mySeat() >= 0) return;
      room.queue = room.queue.filter((p) => p !== pid);
      if (on) { room.queue.push(pid); if (room.phase === "result") seatQueue(room); }
      broadcast(room);
    });
    socket.on("stand", () => { if (!room || room.phase === "playing") return; const c = mySeat(); if (c >= 0) { room.seats[c] = null; broadcast(room); } });
    socket.on("adminLogin", (m = {}) => {
      const r = admin.login(socket.handshake.address + "|" + socket.id, String(m.user || ""), String(m.pass || ""));
      socket.emit("adminResult", r);
      if (r.ok && room) { room.admins.add(pid); log(room, nameOf(room, pid) + " đăng nhập tài khoản chủ phòng."); fixHost(room); broadcast(room); }
    });
    socket.on("adminLogout", () => { if (!room) return; room.admins.delete(pid); fixHost(room); broadcast(room); });
    socket.on("giveHost", (p) => { if (!isHost() || p === pid || !online(room).has(p) || room.admins.has(pid)) return; room.host = p; log(room, nameOf(room, pid) + " nhường chủ phòng cho " + nameOf(room, p) + "."); broadcast(room); });
    socket.on("claimHost", () => { if (!room || room.host === pid || !room.seats.includes(pid)) return; if (online(room).has(room.host) && room.seats.includes(room.host)) return; if ([...room.admins].some((p) => online(room).has(p))) return; room.host = pid; log(room, nameOf(room, pid) + " nhận làm chủ phòng."); broadcast(room); });
    socket.on("kick", (i) => { if (!isHost() || room.phase === "playing" || !room.seats[i]) return; room.seats[i] = null; broadcast(room); });
    socket.on("stake", (v) => { if (!isHost() || room.phase === "playing") return; const n = Math.round(Number(v)); if (n >= 0 && n <= 1e9) { room.stake = n; broadcast(room); } });
    socket.on("start", () => { if (!isHost() || room.phase === "playing") return; start(room); });
    socket.on("lobby", () => { if (!isHost()) return; if (room.phase === "playing") { clearTimeout(room.timer); log(room, "Chủ phòng huỷ ván " + room.roundNo + ", không tính tiền."); if (room.game === "bacay" && room.st?.paid) { const back = {}; for (const p in room.st.paid) back[p] = -room.st.paid[p]; applyDeltas(room, back); } } room.phase = "lobby"; room.st = null; room.result = null; room.deadline = 0; broadcast(room); });
    socket.on("restart", () => {
      if (!isHost() || room.phase !== "playing") return;
      clearTimeout(room.timer);
      log(room, "Chủ phòng chia lại từ đầu, ván " + room.roundNo + " không tính tiền.");
      if (room.game === "bacay" && room.st?.paid) { const back = {}; for (const p in room.st.paid) back[p] = -room.st.paid[p]; applyDeltas(room, back); }
      room.phase = "lobby"; room.st = null; room.result = null; start(room);
    });
    socket.on("resetBxh", () => { if (!isHost() || room.phase === "playing") return; room.bxh.clear(); log(room, "Chủ phòng đã đặt lại bảng xếp hạng."); broadcast(room); });

    socket.on("act", (a = {}) => {
      if (!room || room.phase !== "playing" || !room.st) return;
      const s = mySeat(); if (s < 0) return;
      const st = room.st;
      if (room.game === "sam") {
        if (a.type === "bao") {
          if (st.step !== "bao" || st.baoVotes[s] != null) return;
          st.baoVotes[s] = !!a.yes;
          if (a.yes && st.baoSam == null) { st.baoSam = s; log(room, "📣 " + nameOf(room, pid) + " báo Sâm!"); }
          if (st.baoSam != null || st.order.every((x) => st.baoVotes[x] != null)) samBeginPlay(room); else broadcast(room);
          return;
        }
        if (a.type === "play") return reply(samPlay(room, s, Array.isArray(a.cards) ? a.cards.map(Number) : []));
        if (a.type === "pass") return reply(samPass(room, s));
      }
      if (room.game === "phom") {
        if (a.type === "draw" || a.type === "eat") return reply(phomTake(room, s, a.type));
        if (a.type === "discard") return reply(phomDiscard(room, s, Number(a.card)));
      }
      if (room.game === "bacay" && a.type === "show") {
        st.shown[s] = true;
        if (st.order.every((x) => st.shown[x])) bacayFinish(room); else broadcast(room);
      }
    });

    socket.on("disconnect", () => {
      if (!room) return;
      room.sockets.delete(socket.id);
      if (!room.sockets.size) room.emptySince = Date.now();
      if (!online(room).has(pid)) room.queue = room.queue.filter((p) => p !== pid);
      if (room.phase !== "playing" && !online(room).has(pid)) { const c = mySeat(); if (c >= 0) room.seats[c] = null; }
      fixHost(room); broadcast(room);
    });
  });

  setInterval(() => { const now = Date.now(); rooms.forEach((r, k) => { if (r.emptySince && now - r.emptySince > 2 * 3600 * 1000) { clearTimeout(r.timer); rooms.delete(k); } }); }, 60000);
}

module.exports = { attach, samCombo, samBeats, bestArrangement, meldCandidates, canFitMeld, bacayScore, cardName, sv };
