import { openai } from "@/lib/openai";
import { NextResponse } from "next/server";

export async function POST(req: Request) {
  const formData = await req.formData();
  const file = formData.get("audio") as File;

  if (!file) {
    return NextResponse.json({ error: "No file uploaded" }, { status: 400 });
  }

  const response = await openai.audio.transcriptions.create({
    model: "whisper-1",
    file,
    response_format: "json"
  });

  return NextResponse.json({
    text: response.text,
    language: detectLanguageFromText(response.text),
  });
}

function detectLanguageFromText(text: string): string {
  if (/[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9faf]/.test(text)) return "ja-JP";
  if (/[а-яА-ЯёЁ]/.test(text)) return "ru-RU";
  if (/\b(merci|bonjour|français)\b/i.test(text)) return "fr-FR";
  if (/\b(gracias|hola|español)\b/i.test(text)) return "es-ES";
  if (/\b(obrigado|português)\b/i.test(text)) return "pt-PT";
  if (/\b(ciao|grazie|italiano)\b/i.test(text)) return "it-IT";
  if (/\b(thank|hello|english)\b/i.test(text)) return "en-US";
  return "es-Es";
}
