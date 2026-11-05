// Tài khoản chủ phòng cố định. Mật khẩu chỉ lưu dạng đã mã hoá (scrypt), không lưu mật khẩu gốc.
// Có thể đổi bằng biến môi trường ADMIN_USER / ADMIN_PASS trên Render (ưu tiên hơn giá trị dưới đây).
const crypto = require("crypto");
const DEF_USER = "phuonnt101";
const DEF_SALT = "36d576eebe124f4ce5f7c31d";
const DEF_HASH = "cce8056003c42c1920702874fc9e5793d67a385b330b23a0f07f93145017544e";
const TOKEN_SALT = "23ecd8a79488523c42bf2947";
const TOKEN_SHA = "02d5e66cdd7db4ee3eb7fa9739950c03d86829616facb8f0bd8975dfcf8636a0";
const U = process.env.ADMIN_USER || DEF_USER;
const ENV_P = process.env.ADMIN_PASS || "";
const enabled = () => true;
function safeEq(a, b) {
  const x = Buffer.from(String(a)), y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}
const sha = (s) => crypto.createHash("sha256").update(String(s)).digest("hex");
function checkPass(pass) {
  if (ENV_P) return safeEq(pass, ENV_P);
  return safeEq(crypto.scryptSync(String(pass), DEF_SALT, 32).toString("hex"), DEF_HASH);
}
// Mã đăng nhập chỉ tạo được khi biết mật khẩu; máy chủ chỉ giữ dấu vân tay (sha256) của nó.
function makeToken(pass) {
  if (ENV_P) return crypto.createHmac("sha256", ENV_P).update("host:" + U).digest("hex");
  return crypto.scryptSync(String(pass), TOKEN_SALT, 32).toString("hex");
}
const tries = new Map(); // chống dò mật khẩu: tối đa 5 lần / phút cho mỗi kết nối
function login(key, user, pass) {
  const now = Date.now(), t = (tries.get(key) || []).filter((x) => now - x < 60000);
  if (t.length >= 5) return { ok: false, err: "Thử sai nhiều quá, đợi 1 phút rồi thử lại." };
  if (safeEq(user, U) && checkPass(pass)) { tries.delete(key); return { ok: true, token: makeToken(pass) }; }
  t.push(now); tries.set(key, t);
  return { ok: false, err: "Sai tài khoản hoặc mật khẩu." };
}
function isAdmin(token) {
  if (typeof token !== "string" || !token) return false;
  if (ENV_P) return safeEq(token, makeToken());
  return safeEq(sha(token), TOKEN_SHA);
}
module.exports = { login, isAdmin, enabled };
