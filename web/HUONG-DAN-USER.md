# Hướng dẫn sử dụng Claude Reporter

> Hệ thống theo dõi hoạt động Claude Code của bạn theo thời gian thực.
> **Dashboard:** https://vibe-reporter.onebot-training.meobeo.ai

---

## 1. Đăng nhập

Truy cập: https://vibe-reporter.onebot-training.meobeo.ai/login

- Chọn tab **Đăng nhập**
- Nhập **email** và **mật khẩu** được cấp
- Bấm **Đăng nhập** → vào trang chủ

> Nếu chưa có tài khoản → chọn tab **Đăng ký**, nhập email + mật khẩu mới (tối thiểu 6 ký tự)

---

## 2. Trang chủ

Sau khi đăng nhập, bạn thấy 4 khu vực chính:

### Thẻ thống kê (góc trên)

| Thẻ | Ý nghĩa |
|-----|---------|
| **Total Sessions** | Tổng số phiên làm việc với Claude Code |
| **Events (24h)** | Số sự kiện trong 24 giờ qua |
| **Total Tokens** | Tổng token đã dùng (Input + Output) |
| **Est. Cost** | Chi phí ước tính theo giá Claude API |

### Live Feed (trái)
Luồng sự kiện theo thời gian thực — hiện ngay khi bạn đang dùng Claude Code. Bạn thấy từng lượt prompt, tool use, response xuất hiện liên tiếp.

### Token Breakdown (phải)
Biểu đồ phân tích token chi tiết:
- **Input tokens** — token bạn gửi vào (prompt, context)
- **Output tokens** — token Claude trả về
- **Cache Creation** — token lần đầu được cache (giảm chi phí lần sau)
- **Cache Read** — token đọc từ cache (rẻ hơn ~10x so với input thường)

### Danh sách Sessions (bên dưới)
Lịch sử tất cả phiên làm việc, sắp xếp mới nhất trước. Bấm vào session để xem chi tiết từng bước Claude đã làm.

---

## 3. Báo cáo (`/report`)

Click **Report** trên menu → tab **📁 Báo cáo cá nhân**

Chọn khoảng thời gian (7 ngày / 30 ngày / 90 ngày hoặc tùy chọn) rồi xem:

- **Danh sách project** — các thư mục bạn đã làm việc với Claude
- **Số sessions, events, tokens** mỗi project
- **Chi phí ước tính** từng project
- Nút **↓ Tải Project Report HTML** — xuất báo cáo ra file để lưu hoặc chia sẻ

---

## 4. Sessions (`/sessions`)

Danh sách chi tiết tất cả phiên làm việc:

- Lọc theo **ngày**, **project**
- Mỗi session hiển thị: thời gian bắt đầu, project path, tổng token, số events
- Bấm vào session → xem từng sự kiện: prompt, tool call, response, thời gian thực hiện

---

## 5. Profile (`/profile`)

Click vào **email** góc trên phải → trang Profile

- Xem thông tin tài khoản (email, vai trò, phòng ban)
- **UUID** — mã kết nối máy tính với tài khoản (dùng khi cài hook)
  - Bấm **👁 Hiển thị** để xem UUID đầy đủ
  - Bấm **Copy** để sao chép
- **Trang chủ** — quay về dashboard
- **Đăng xuất** — thoát khỏi tài khoản

---

## 6. Cài hook (lần đầu dùng)

Hook là script chạy ngầm trên máy, tự động ghi lại dữ liệu mỗi khi bạn dùng Claude Code.

**Yêu cầu:** Node.js ≥ 16 (`node -v` để kiểm tra)

Chạy lệnh sau trong Terminal (macOS/Linux) hoặc PowerShell (Windows):

```bash
npx claude-reporter-setup
```

Làm theo hướng dẫn trên màn hình — chọn **Đăng nhập**, nhập email + mật khẩu → xong.

Sau đó **khởi động lại Claude Code**. Dữ liệu sẽ xuất hiện trong dashboard sau ~90 giây.

---

## Câu hỏi thường gặp

**Tôi dùng Claude Code nhưng không thấy dữ liệu?**
→ Kiểm tra hook đã cài chưa (`ls ~/.claude/hooks/claude-reporter.sh`), khởi động lại Claude Code, chờ ~90 giây.

**Token hiển thị bao nhiêu là bình thường?**
→ Một session trung bình dùng 50K–500K tokens tùy độ phức tạp. Cache Read tokens càng nhiều = càng tiết kiệm chi phí.

**Quên mật khẩu?**
→ Liên hệ admin để reset.

---

*Server: https://vibe-reporter.onebot-training.meobeo.ai*
