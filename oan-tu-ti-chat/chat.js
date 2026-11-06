// Khung chat nổi dùng chung cho mọi trò: GameChat(socket, myPid)
(function () {
  var css = "#gc-btn{position:fixed;right:max(16px,env(safe-area-inset-right,0px));bottom:calc(16px + env(safe-area-inset-bottom,0px));z-index:70;width:56px;height:56px;border-radius:50%;border:3px solid var(--ink,#1E1638);background:var(--accent,#6C47FF);color:#fff;font-size:24px;cursor:pointer;box-shadow:3px 3px 0 var(--ink,#1E1638);display:grid;place-items:center}" +
    "#gc-btn b{position:absolute;top:-6px;right:-6px;min-width:22px;height:22px;padding:0 6px;border-radius:99px;background:var(--lose,#E5383B);color:#fff;font:700 12px/22px var(--f-body,system-ui);border:2px solid var(--ink,#1E1638)}" +
    "#gc-peek{position:fixed;right:84px;bottom:calc(22px + env(safe-area-inset-bottom,0px));z-index:70;max-width:min(300px,calc(100vw - 110px));background:var(--card,#fff);color:var(--ink,#1E1638);border:2.5px solid var(--ink,#1E1638);border-radius:14px 14px 4px 14px;padding:7px 11px;font:500 14px/1.35 var(--f-body,system-ui);box-shadow:2px 2px 0 var(--ink,#1E1638);cursor:pointer;overflow-wrap:anywhere}" +
    "#gc-panel{position:fixed;right:max(16px,env(safe-area-inset-right,0px));bottom:calc(84px + env(safe-area-inset-bottom,0px));z-index:70;width:min(340px,calc(100vw - 32px));height:min(440px,60vh);display:flex;flex-direction:column;background:var(--card,#fff);color:var(--ink,#1E1638);border:3px solid var(--ink,#1E1638);border-radius:18px;box-shadow:4px 4px 0 var(--ink,#1E1638);font-family:var(--f-body,system-ui);overflow:hidden}" +
    "#gc-panel .hd{display:flex;align-items:center;justify-content:space-between;padding:10px 14px;border-bottom:2px dashed var(--grid,#D9D1EE);font:800 17px var(--f-display,system-ui)}" +
    "#gc-panel .hd button{border:0;background:none;color:inherit;font-size:20px;cursor:pointer;line-height:1}" +
    "#gc-list{flex:1;overflow:auto;padding:10px 12px;display:flex;flex-direction:column;gap:6px}" +
    "#gc-list .m{max-width:85%;align-self:flex-start;background:var(--soft,#EEE8FB);border-radius:12px 12px 12px 4px;padding:5px 10px;font-size:14px;line-height:1.35;overflow-wrap:anywhere}" +
    "#gc-list .m.me{align-self:flex-end;background:var(--accent,#6C47FF);color:#fff;border-radius:12px 12px 4px 12px}" +
    "#gc-list .m small{display:block;font-size:11.5px;font-weight:700;opacity:.75}" +
    "#gc-list .empty{margin:auto;color:var(--muted,#6B6488);font-size:14px;text-align:center}" +
    "#gc-quick{display:flex;gap:6px;padding:6px 10px 0;overflow-x:auto;flex:none}" +
    "#gc-quick button{flex:none;border:2px solid var(--ink,#1E1638);background:var(--bg,#F6F1FF);color:inherit;border-radius:99px;padding:3px 10px;font:600 13px var(--f-body,system-ui);cursor:pointer}" +
    "#gc-form{display:flex;gap:8px;padding:10px;flex:none}" +
    "#gc-form input{flex:1;min-width:0;font:500 15px var(--f-body,system-ui);padding:8px 12px;border:2.5px solid var(--ink,#1E1638);border-radius:12px;background:var(--bg,#F6F1FF);color:var(--ink,#1E1638)}" +
    "#gc-form button{border:2.5px solid var(--ink,#1E1638);background:var(--accent,#6C47FF);color:#fff;border-radius:12px;padding:0 14px;font:800 15px var(--f-display,system-ui);cursor:pointer}" +
    "@media (max-width:600px){#gc-btn{width:50px;height:50px;font-size:21px}#gc-panel{bottom:calc(76px + env(safe-area-inset-bottom,0px));height:55vh}#gc-peek{right:76px}}" +
    "[hidden]{display:none!important}";
  var QUICK = ["Nhanh lên!", "Đen quá 😭", "Hay đấy!", "Ván nữa nào", "GG"];

  window.GameChat = function (socket, myPid) {
    var st = document.createElement("style"); st.textContent = css; document.head.appendChild(st);
    var btn = document.createElement("button"); btn.id = "gc-btn"; btn.type = "button"; btn.title = "Chat trong phòng"; btn.setAttribute("aria-label", "Mở chat");
    btn.textContent = "💬"; var badge = document.createElement("b"); badge.hidden = true; btn.appendChild(badge);
    var peek = document.createElement("div"); peek.id = "gc-peek"; peek.hidden = true;
    var panel = document.createElement("div"); panel.id = "gc-panel"; panel.hidden = true;
    panel.innerHTML = '<div class="hd"><span>Chat trong phòng</span><button type="button" aria-label="Đóng chat">×</button></div><div id="gc-list"><div class="empty">Chưa có tin nhắn.<br>Gõ gì đó cho vui nhé!</div></div><div id="gc-quick"></div><form id="gc-form" autocomplete="off"><input maxlength="200" placeholder="Nhắn cả phòng…" enterkeyhint="send"><button type="submit">Gửi</button></form>';
    document.body.append(peek, panel, btn);
    var list = panel.querySelector("#gc-list"), input = panel.querySelector("input"), unread = 0, open = false, loaded = false, peekT;
    QUICK.forEach(function (q) { var b = document.createElement("button"); b.type = "button"; b.textContent = q; b.onclick = function () { socket.emit("chat", q) }; panel.querySelector("#gc-quick").appendChild(b) });
    function setOpen(v) { open = v; panel.hidden = !v; peek.hidden = true; if (v) { unread = 0; badge.hidden = true; list.scrollTop = list.scrollHeight; if (matchMedia("(pointer:fine)").matches) input.focus() } }
    btn.onclick = function () { setOpen(!open) }; peek.onclick = function () { setOpen(true) };
    panel.querySelector(".hd button").onclick = function () { setOpen(false) };
    panel.querySelector("form").onsubmit = function (e) { e.preventDefault(); var v = input.value.trim(); if (!v) return; socket.emit("chat", v); input.value = "" };
    function add(m, quiet) {
      var em = list.querySelector(".empty"); if (em) em.remove();
      var d = document.createElement("div"); d.className = "m" + (m.pid === myPid ? " me" : "");
      if (m.pid !== myPid) { var n = document.createElement("small"); n.textContent = m.name; d.appendChild(n) }
      d.appendChild(document.createTextNode(m.text)); list.appendChild(d);
      while (list.children.length > 60) list.removeChild(list.firstChild);
      var near = list.scrollHeight - list.scrollTop - list.clientHeight < 80; if (near || m.pid === myPid) list.scrollTop = list.scrollHeight;
      if (quiet || open || m.pid === myPid) return;
      unread++; badge.textContent = unread > 9 ? "9+" : String(unread); badge.hidden = false;
      peek.textContent = m.name + ": " + m.text; peek.hidden = false; clearTimeout(peekT); peekT = setTimeout(function () { peek.hidden = true }, 4000);
      try { if (window.SFX) SFX.play("click") } catch (e) {}
    }
    socket.on("chat", function (m) { add(m) });
    socket.on("chatHistory", function (arr) { if (loaded) return; loaded = true; list.querySelectorAll(".m").forEach(function (x) { x.remove() }); (arr || []).forEach(function (m) { add(m, true) }) });
    socket.on("state", function () { if (!loaded) socket.emit("chatHistory") });
    socket.on("connect", function () { loaded = false });
    document.addEventListener("keydown", function (e) { if (e.key === "Escape" && open) setOpen(false) });
  };
})();
