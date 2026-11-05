// Tài khoản chủ phòng cố định. Tài khoản và mật khẩu đặt trong biến môi trường
// ADMIN_USER và ADMIN_PASS trên Render (không ghi trong code vì kho mã công khai).
const crypto = require("crypto");
const U = process.env.ADMIN_USER || "";
const P = process.env.ADMIN_PASS || "";
const enabled = () => !!(U && P);
const tokenFor = () => crypto.createHmac("sha256", P).update("host:" + U).digest("hex");
function safeEq(a, b) {
  const x = Buffer.from(String(a)), y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}
const tries = new Map(); // chống dò mật khẩu: tối đa 5 lần / phút cho mỗi kết nối
function login(key, user, pass) {
  if (!enabled()) return { ok: false, err: "Máy chủ chưa cài tài khoản chủ phòng." };
  const now = Date.now(), t = (tries.get(key) || []).filter((x) => now - x < 60000);
  if (t.length >= 5) return { ok: false, err: "Thử sai nhiều quá, đợi 1 phút rồi thử lại." };
  if (safeEq(user, U) && safeEq(pass, P)) { tries.delete(key); return { ok: true, token: tokenFor() }; }
  t.push(now); tries.set(key, t);
  return { ok: false, err: "Sai tài khoản hoặc mật khẩu." };
}
const isAdmin = (token) => enabled() && typeof token === "string" && token.length > 0 && safeEq(token, tokenFor());
module.exports = { login, isAdmin, enabled };
