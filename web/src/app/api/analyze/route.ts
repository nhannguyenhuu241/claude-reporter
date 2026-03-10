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

  try {
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });
    const result = await model.generateContent(prompt);
    const text = result.response.text();
    return NextResponse.json({ analysis: text });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

function buildPrompt(data: unknown, type: "team" | "project"): string {
  const json = JSON.stringify(data, null, 2);

  if (type === "team") {
    return `Bạn là chuyên gia phân tích năng suất làm việc với Claude Code.
Dưới đây là dữ liệu báo cáo team sử dụng Claude Code AI assistant.

DỮ LIỆU BÁO CÁO TEAM:
${json}

Hãy phân tích và trả lời theo cấu trúc markdown sau:

## 📊 Tổng quan team
(Nhận xét tổng thể về mức độ sử dụng, số prompts, tokens, chi phí)

## 🏆 Thành viên nổi bật
(Top thành viên hiệu quả nhất và lý do — dựa trên promptEfficiency, tokensPerPrompt, sessionDepth)

## ⚠️ Điểm cần cải thiện
(Thành viên hoặc pattern nào cần chú ý — prompts noise cao, efficiency thấp, v.v.)

## 💡 Phân tích pattern làm việc
(Xu hướng sử dụng theo tuần, dự án nào được dùng nhiều, loại công việc nào)

## 🎯 Đề xuất cụ thể
(3-5 đề xuất cải thiện năng suất cho team, dựa trên số liệu thực tế)

## 💰 Hiệu quả chi phí
(Nhận xét về tỷ lệ token/prompt và cost, có hợp lý không)

Hãy phân tích dựa hoàn toàn vào số liệu thực tế, ngắn gọn và actionable.`;
  }

  return `Bạn là chuyên gia phân tích năng suất làm việc với Claude Code.
Dưới đây là dữ liệu báo cáo sử dụng Claude Code theo dự án.

DỮ LIỆU BÁO CÁO DỰ ÁN:
${json}

Hãy phân tích và trả lời theo cấu trúc markdown sau:

## 📊 Tổng quan
(Mức độ sử dụng tổng thể, khoảng thời gian, số sessions và events)

## 🗂️ Dự án nổi bật
(Dự án nào được đầu tư nhiều nhất, chi phí và token breakdown)

## 📈 Xu hướng & Pattern
(Nhận xét về phân phối token: input/output/cache — tỷ lệ cache hit tốt không?)

## 💡 Insights
(Điều gì thú vị hoặc đáng chú ý từ dữ liệu)

## 🎯 Đề xuất
(2-3 đề xuất tối ưu hóa dựa trên số liệu)

Ngắn gọn, dựa trên số liệu thực tế.`;
}
