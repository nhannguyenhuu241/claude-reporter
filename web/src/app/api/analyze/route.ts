import { NextRequest, NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";

export async function POST(req: NextRequest) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "GEMINI_API_KEY not configured" }, { status: 503 });
  }

  const body = await req.json();
  const { reportData, reportType } = body as {
    reportData: unknown;
    reportType: "team" | "project";
  };

  const prompt = buildPrompt(reportData, reportType);

  const models = ["gemini-2.0-flash", "gemini-1.5-flash"];
  const genAI = new GoogleGenerativeAI(apiKey);

  for (const modelName of models) {
    try {
      const model = genAI.getGenerativeModel({ model: modelName });
      const result = await model.generateContent(prompt);
      const text = result.response.text();
      return NextResponse.json({ analysis: text });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "";
      // Extract retry delay from 429 response
      const retryMatch = msg.match(/Please retry in ([\d.]+)s/);
      const retryAfter = retryMatch ? Math.ceil(parseFloat(retryMatch[1])) : null;
      const is429 = msg.includes("429") || msg.includes("Too Many Requests") || msg.includes("quota");
      if (is429) {
        return NextResponse.json(
          { error: "rate_limit", retryAfter: retryAfter ?? 60 },
          { status: 429 }
        );
      }
      // Other error — try next model
      if (modelName === models[models.length - 1]) {
        return NextResponse.json({ error: msg || "Unknown error" }, { status: 500 });
      }
    }
  }
  return NextResponse.json({ error: "All models failed" }, { status: 500 });
}

function buildPrompt(data: unknown, type: "team" | "project"): string {
  const json = JSON.stringify(data, null, 2);

  if (type === "team") {
    return `Bạn là chuyên gia phân tích năng suất làm việc với Claude Code AI assistant.
Dưới đây là dữ liệu báo cáo team với các metric quan trọng:

**Giải thích metrics:**
- **promptEfficiency** (0-100%): % prompt thực sự có nghĩa / tổng prompt. Cao = ít noise, chất lượng cao.
- **tokensPerPrompt**: Trung bình token mỗi prompt. Cao = context phức tạp, deep work.
- **sessionDepth**: Trung bình prompt/session. Cao = hội thoại sâu, vấn đề phức tạp.
- **cacheHitRate** (0-100%): Tỷ lệ cache token hit. Cao = context được tái sử dụng tốt, tiết kiệm chi phí.
- **activeDays**: Số ngày hoạt động trong kỳ. Đo độ đều đặn.
- **meaningfulPrompts**: Prompt thực chất (loại bỏ system/noise prompts).
- **estimatedCostUsd**: Chi phí ước tính theo model pricing.

**Công thức đánh giá:**
- Prompt Efficiency ≥ 80% → Tốt | 50-79% → Trung bình | < 50% → Cần cải thiện
- Cache Hit Rate ≥ 30% → Tốt (tái sử dụng context hiệu quả)
- Session Depth ≥ 5 → Hội thoại sâu | < 3 → Nhiều session ngắn
- Cost/Prompt = estimatedCostUsd / totalPrompts → hiệu quả chi phí

DỮ LIỆU BÁO CÁO TEAM:
${json}

Hãy phân tích theo cấu trúc markdown sau (ngắn gọn, dựa 100% vào số liệu thực tế):

## 📊 Tổng quan team
(Tổng prompts, sessions, tokens, chi phí, kỳ báo cáo — 2-3 dòng)

## 🏆 Thành viên nổi bật
(Top 2-3 thành viên hiệu quả nhất. Dẫn chứng bằng số: promptEfficiency, tokensPerPrompt, sessionDepth, cacheHitRate)

## ⚠️ Điểm cần cải thiện
(Thành viên hoặc pattern nào có vấn đề: efficiency thấp, cacheHit thấp, ít ngày hoạt động, cost/prompt cao)

## 💡 Pattern làm việc
(Ai làm deep work, ai làm quick queries? Ai dùng cache tốt? Phân phối dự án?)

## 🎯 Đề xuất cụ thể
(3-5 action items cụ thể, có số liệu làm căn cứ)

## 💰 Hiệu quả chi phí
(Cost/prompt từng người, tổng cost, cache hit rate — có đáng đồng tiền không?)`;
  }

  return `Bạn là chuyên gia phân tích năng suất Claude Code.
Dưới đây là dữ liệu báo cáo sử dụng theo dự án.

**Giải thích metrics:**
- **inputTokens**: Token từ user + context gửi vào model
- **outputTokens**: Token Claude sinh ra (đắt hơn input ~3x)
- **cacheCreationTokens**: Token tạo cache lần đầu (tốn 25% thêm)
- **cacheReadTokens**: Token đọc từ cache (rẻ hơn 90% so với input)
- **cacheHitRate** = cacheReadTokens / (inputTokens + cacheReadTokens) × 100
- **estimatedCostUsd**: Chi phí ước tính (Sonnet: $3/$15 per 1M in/out)
- **sessions**: Số phiên làm việc | **events**: Tổng sự kiện hook

**Tín hiệu tốt:**
- Cache hit rate > 30% → Context dài, tái sử dụng tốt
- Output/Input ratio > 0.3 → Claude sinh nhiều code/nội dung
- Cost/session thấp → Hiệu quả

DỮ LIỆU BÁO CÁO DỰ ÁN:
${json}

Phân tích theo cấu trúc markdown (ngắn gọn, số liệu thực tế):

## 📊 Tổng quan
(Sessions, events, tổng token, chi phí, kỳ thời gian — 2-3 dòng)

## 🗂️ Dự án nổi bật
(Top 3 dự án tốn nhiều token/cost nhất. Lý do hợp lý không?)

## 📈 Phân tích token & cache
(inputTokens vs outputTokens vs cacheRead — tỷ lệ cache hit? Có đang tận dụng cache tốt không?)

## 💡 Insights
(Điều thú vị: project nào hiệu quả nhất về cost/session, ai dùng nhiều nhất)

## 🎯 Đề xuất
(2-3 cách tối ưu: tăng cache hit, giảm output token waste, tập trung vào project ROI cao)`;
}
