// Âm thanh dùng chung (tạo bằng Web Audio, không cần file). Gắn nút bật/tắt vào thanh đầu trang.
(function () {
  var store = { get: function (k) { try { return localStorage.getItem(k); } catch (e) { return null; } }, set: function (k, v) { try { localStorage.setItem(k, v); } catch (e) {} } };
  var muted = store.get("ott_mute") === "1", actx = null;
  function unlock() { try { if (!actx) { var AC = window.AudioContext || window.webkitAudioContext; if (AC) actx = new AC(); } if (actx && actx.state === "suspended") actx.resume(); } catch (e) {} }
  document.addEventListener("pointerdown", unlock); document.addEventListener("keydown", unlock);
  function tone(f, dur, type, vol, delay, f2) {
    if (muted || !actx) return; var t = actx.currentTime + (delay || 0);
    var o = actx.createOscillator(), g = actx.createGain(); o.type = type || "sine"; o.frequency.setValueAtTime(f, t); if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol || 0.2, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(actx.destination); o.start(t); o.stop(t + dur + 0.02);
  }
  function noise(dur, freq, vol, delay) {
    if (muted || !actx) return; var t = actx.currentTime + (delay || 0);
    var n = Math.floor(actx.sampleRate * dur), buf = actx.createBuffer(1, n, actx.sampleRate), d = buf.getChannelData(0);
    for (var i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, 3);
    var src = actx.createBufferSource(), bp = actx.createBiquadFilter(), g = actx.createGain(); src.buffer = buf; bp.type = "bandpass"; bp.frequency.value = freq; bp.Q.value = 0.9; g.gain.value = vol;
    src.connect(bp); bp.connect(g); g.connect(actx.destination); src.start(t);
  }
  var S = {
    click: function () { noise(0.04, 3200, 0.45); tone(620, 0.06, "triangle", 0.1); },
    go: function () { tone(523, 0.12, "square", 0.08); tone(659, 0.12, "square", 0.08, 0.12); tone(784, 0.22, "square", 0.1, 0.24); },
    tick: function () { tone(1400, 0.04, "square", 0.05); },
    turn: function () { tone(784, 0.16, "sine", 0.22); tone(1175, 0.24, "sine", 0.2, 0.13); },
    reveal: function () { for (var i = 0; i < 8; i++) noise(0.05, 300 + i * 40, 0.5, i * 0.045); tone(784, 0.3, "triangle", 0.18, 0.4); tone(1047, 0.35, "triangle", 0.15, 0.4); },
    boing: function () { tone(220, 0.35, "triangle", 0.22, 0, 520); tone(520, 0.3, "triangle", 0.15, 0.3, 260); },
    uhoh: function () { tone(440, 0.18, "triangle", 0.2); tone(330, 0.3, "triangle", 0.2, 0.18); },
    win: function () { [523, 659, 784, 1047].forEach(function (f, i) { tone(f, 0.22, "triangle", 0.22, i * 0.11); }); tone(1319, 0.45, "sine", 0.15, 0.44); },
    lose: function () { [392, 330, 262].forEach(function (f, i) { tone(f, 0.28, "triangle", 0.18, i * 0.16); }); tone(196, 0.5, "sawtooth", 0.06, 0.48); },
    end: function () { tone(660, 0.2, "sine", 0.15); tone(880, 0.3, "sine", 0.12, 0.15); },
    dice: function () { for (var i = 0; i < 7; i++) noise(0.035, 1600 + Math.random() * 1800, 0.4, i * 0.055); noise(0.06, 900, 0.6, 0.42); },
    hop: function () { tone(420, 0.09, "sine", 0.16, 0, 840); tone(560, 0.08, "sine", 0.1, 0.1, 1000); },
    boom: function () { tone(120, 0.4, "sawtooth", 0.25, 0, 40); noise(0.3, 500, 0.8); },
    home: function () { [880, 1175, 1568].forEach(function (f, i) { tone(f, 0.18, "sine", 0.16, i * 0.08); }); }
  };
  window.SFX = { play: function (n) { if (!muted && actx && S[n]) S[n](); } };
  var meta = document.querySelector("header .meta");
  if (meta) {
    var b = document.createElement("button"); b.className = "pill"; b.type = "button"; b.title = "Bật/tắt âm thanh";
    var paint = function () { b.textContent = muted ? "🔇 Tắt tiếng" : "🔊 Âm thanh"; };
    paint(); b.addEventListener("click", function () { muted = !muted; store.set("ott_mute", muted ? "1" : "0"); paint(); unlock(); if (!muted) S.turn(); });
    meta.appendChild(b);
  }
})();
