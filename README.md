# Oẳn Tù Tì Online

Trò oẳn tù tì nhiều người chơi theo thời gian thực, chạy bằng Node.js + Socket.IO.

## Chạy trên máy

Cần Node.js 18 trở lên. Chạy "npm install" rồi "npm start", sau đó mở http://localhost:3000

## Phòng riêng

Thêm ?phong=tenphong vào cuối link, ví dụ /?phong=team-sale

## Biến môi trường

- PORT: cổng chạy server (mặc định 3000)
- ROUND_MS: thời gian chọn mỗi lượt, tính bằng ms (mặc định 20000)
- REVEAL_MS: thời gian xem kết quả trước lượt sau (mặc định 7000)

Trạng thái phòng chỉ nằm trong bộ nhớ server: khởi động lại server thì ván đang chơi sẽ mất.
