// Chat trong phòng chơi, dùng chung cho mọi trò. ctx() trả về { room, pid, name } của socket hiện tại.
function attachChat(nsp, socket, ctx) {
  let last = 0;
  socket.on("chat", (txt) => {
    const c = ctx(); if (!c || !c.room) return;
    const now = Date.now(); if (now - last < 600) return; last = now;
    const text = String(txt || "").replace(/\s+/g, " ").trim().slice(0, 200); if (!text) return;
    const room = c.room, m = { pid: c.pid, name: c.name, text, t: now };
    room.chat = room.chat || []; room.chat.push(m); if (room.chat.length > 50) room.chat.shift();
    room.sockets.forEach((p, sid) => { const s = nsp.sockets.get(sid); if (s) s.emit("chat", m); });
  });
  socket.on("chatHistory", () => { const c = ctx(); if (c && c.room) socket.emit("chatHistory", c.room.chat || []); });
}
module.exports = { attachChat };
