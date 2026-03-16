# Hướng dẫn sử dụng Claude Reporter

Claude Reporter là hệ thống theo dõi hoạt động Claude Code của toàn bộ team theo thời gian thực. Hook script chạy ngầm trên máy mỗi thành viên, tự động gửi dữ liệu lên server — không cần làm gì thêm sau khi cài đặt.

**Dashboard:** https://vibe-reporter.onebot-training.meobeo.ai

---

## Mục lục

1. [Thiết lập nhanh (khuyến nghị)](#1-thiết-lập-nhanh-khuyến-nghị)
2. [Đăng nhập lại / truy cập dashboard](#2-đăng-nhập-lại--truy-cập-dashboard)
3. [Xem báo cáo](#3-xem-báo-cáo)
4. [Trang Profile & UUID](#4-trang-profile--uuid)
5. [Các thao tác thường dùng](#5-các-thao-tác-thường-dùng)
6. [Cài thủ công (không có Node.js)](#6-cài-thủ-công-không-có-nodejs)
7. [Câu hỏi thường gặp](#7-câu-hỏi-thường-gặp)

---

## 1. Thiết lập nhanh (khuyến nghị)

> Yêu cầu: **Node.js ≥ 16** (kiểm tra: `node -v`). Không cần cài thêm gì khác.

Chạy **1 lệnh duy nhất** trong Terminal (macOS/Linux) hoặc PowerShell (Windows):

```bash
npx claude-reporter-setup
```

Tool sẽ tự động thực hiện toàn bộ 4 bước:

```
[1/4] Tải hook script về máy
[2/4] Gắn hook vào Claude Code settings
[3/4] Đăng ký / Đăng nhập tài khoản
[4/4] Lưu UUID vào máy
```

### Luồng đăng ký / đăng nhập trong terminal

Ở bước 3, tool hỏi:

```
  Chọn một tùy chọn:
    1  Đăng nhập      (đã có tài khoản)
    2  Đăng ký        (lần đầu sử dụng)
    3  Mở trình duyệt & nhập UUID thủ công
```

- **Lần đầu** → chọn `2`, nhập email + mật khẩu (≥ 6 ký tự) → UUID tự động được lưu
- **Lần sau / máy mới** → chọn `1`, nhập email + mật khẩu → xong
- **Chọn `3`**: mở trình duyệt vào trang login, sau đó vào Profile copy UUID dán vào terminal

### Sau khi setup

```
  🎉 Thiết lập hoàn tất!

  › Khởi động lại Claude Code — session sẽ tự động được ghi lại.
  › Dashboard:  https://vibe-reporter.onebot-training.meobeo.ai
  › Profile:    https://vibe-reporter.onebot-training.meobeo.ai/profile
```

**Khởi động lại Claude Code** để hook có hiệu lực. Dữ liệu xuất hiện trong dashboard sau ~90 giây đầu tiên sử dụng.

---

## 2. Đăng nhập lại / truy cập dashboard

Truy cập: **https://vibe-reporter.onebot-training.meobeo.ai/login**

| Tab | Dùng khi |
|-----|----------|
| **Đăng nhập** | Đã có tài khoản, vào dashboard xem báo cáo |
| **Đăng ký** | Lần đầu dùng web (nếu chưa setup qua npx) |

> Phiên đăng nhập giữ **7 ngày** (httpOnly cookie), không cần đăng nhập lại thường xuyên.

---

## 3. Xem báo cáo

### Báo cáo cá nhân — `/report`

- Tổng token đã dùng (input / output / cache)
- Ước tính chi phí theo ngày / tuần / tháng
- Chất lượng prompt (điểm hiệu quả, phát hiện prompt mơ hồ)
- Lịch sử session theo thời gian

### Báo cáo phòng ban — `/dept` *(chỉ Trưởng phòng)*

- Tổng hợp toàn bộ thành viên trong phòng
- Bảng xếp hạng token usage
- Phân tích xu hướng theo tuần

### Danh sách session — `/sessions`

- Xem tất cả session Claude Code của bản thân
- Lọc theo ngày, project
- Click vào session để xem chi tiết từng sự kiện

---

## 4. Trang Profile & UUID

Truy cập: click vào **email** góc trên phải, hoặc vào `/profile` trực tiếp.

### UUID là gì?

UUID là mã định danh duy nhất liên kết máy tính với tài khoản. Hook script đọc UUID này để gắn tag mọi sự kiện với đúng người dùng.

> UUID mặc định bị ẩn dạng `xxxxxxxx-••••-••••-••••-••••••••••••` để bảo mật.

### Cách xem UUID (khi cần)

1. Vào trang **Profile**
2. Bấm **"👁 Hiển thị"** để hiện UUID đầy đủ
3. Bấm **"Copy"** để sao chép

UUID dùng khi cài trên máy mới (xem [mục 7](#7-cài-thủ-công-không-có-nodejs)) hoặc khi chọn tùy chọn `3` trong `npx claude-reporter-setup`.

---

## 5. Các thao tác thường dùng

### Đổi mật khẩu

Hiện tại chưa có tính năng tự đổi mật khẩu. Liên hệ admin nếu cần reset.

### Đăng xuất

Vào trang **Profile** → bấm **"Đăng xuất"** ở góc dưới phải. Phiên làm việc sẽ bị xoá, cần đăng nhập lại lần sau.

### Cập nhật hook lên phiên bản mới

Chạy lại lệnh setup — tool sẽ tải script mới nhất và giữ nguyên tài khoản:

```bash
npx claude-reporter-setup
```

Chọn `1` Đăng nhập → nhập email + mật khẩu → hook được cập nhật, UUID giữ nguyên.

### Kiểm tra hook đang hoạt động

Sau khi cài, dùng Claude Code bình thường, rồi vào **Dashboard → Sessions** — nếu thấy session mới xuất hiện sau ~90 giây là hook đang hoạt động tốt.

Nếu không thấy dữ liệu sau vài phút:
1. Kiểm tra file UUID: `cat ~/.claude-reporter-uuid` — phải có nội dung
2. Kiểm tra hook script: `ls ~/.claude/hooks/claude-reporter.sh`
3. Khởi động lại Claude Code và thử lại

---

## 6. Cài thủ công (không có Node.js)

Nếu máy không có Node.js, dùng cách thủ công tương đương.

### macOS / Linux / Ubuntu

```bash
# Bước 1: lấy UUID từ trang Profile, lưu vào máy
echo 'YOUR_UUID' > ~/.claude-reporter-uuid

# Bước 2: tải và chạy installer
curl -s https://vibe-reporter.onebot-training.meobeo.ai/api/install | bash
```

> **Ubuntu**: installer tự động cài `curl` và `python3` nếu thiếu (cần `sudo`).

### Windows (PowerShell)

```powershell
# Bước 1: lưu UUID
echo 'YOUR_UUID' | Out-File "$HOME\.claude-reporter-uuid" -Encoding UTF8 -NoNewline

# Bước 2: chạy installer
iex (irm 'https://vibe-reporter.onebot-training.meobeo.ai/api/install/windows')
```

### Replay lịch sử session cũ (macOS/Linux)

```bash
curl -s https://vibe-reporter.onebot-training.meobeo.ai/hooks/reporter-replay.sh > /tmp/replay.sh
bash /tmp/replay.sh             # toàn bộ lịch sử
bash /tmp/replay.sh --days 30   # 30 ngày gần nhất
bash /tmp/replay.sh --dry-run   # xem trước, không gửi dữ liệu
```

---

## 7. Câu hỏi thường gặp

**Q: Hook có làm chậm Claude Code không?**
Không. Script chạy bất đồng bộ, gom sự kiện vào hàng đợi local và flush mỗi **90 giây**. Nếu mất mạng, tự retry với exponential backoff (tối đa 5 phút).

**Q: Dữ liệu nào được thu thập?**
Loại sự kiện (tool use, prompt, response), thời gian, session ID, token usage và nội dung để hiển thị trên dashboard.

**Q: Máy offline thì sao?**
Sự kiện lưu vào file hàng đợi local (`~/.claude-reporter-queue.jsonl`), tự gửi khi có mạng. Hàng đợi giới hạn 5.000 sự kiện mới nhất.

**Q: Quên mật khẩu?**
Liên hệ Admin để xoá và tạo lại tài khoản, sau đó chạy lại `npx claude-reporter-setup`.

**Q: Đổi máy tính thì sao?**
Chạy `npx claude-reporter-setup` trên máy mới → chọn `1` Đăng nhập với email + mật khẩu cũ → UUID cũ được tự động lưu.

**Q: Cài trên nhiều máy cùng 1 tài khoản được không?**
Được. Cùng UUID trên nhiều máy hoàn toàn hợp lệ — session từ tất cả máy sẽ gộp vào cùng tài khoản.

---

*Phiên bản: 2026-03 · Tool: `npx claude-reporter-setup` · Server: https://vibe-reporter.onebot-training.meobeo.ai*
