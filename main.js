import fs from "fs";
import "dotenv/config";
import { GoogleGenAI } from "@google/genai";
import fetch from "node-fetch";

// Check API keys
if (!process.env.GEMINI_API_KEY && !process.env.GROQ_API_KEY) {
  console.error("Missing GEMINI_API_KEY and GROQ_API_KEY");
  process.exit(1);
}

// Dates
const today = new Date();
const dateStr = today.toISOString().split("T")[0];

const yesterday = new Date(today);
yesterday.setDate(today.getDate() - 1);
const yesterdayStr = yesterday.toISOString().split("T")[0];

/* -------------------- helpers -------------------- */

function getLastLine(file) {
  if (!fs.existsSync(file)) return "";
  const lines = fs.readFileSync(file, "utf8").trim().split("\n");
  return lines[lines.length - 1] || "";
}

function escapeSvg(text) {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function wrapText(text, maxChars = 90) {
  const words = text.split(" ");
  const lines = [];
  let line = "";
  for (const word of words) {
    if ((line + word).length > maxChars) {
      lines.push(line.trim());
      line = word + " ";
    } else {
      line += word + " ";
    }
  }
  if (line.trim()) lines.push(line.trim());
  return lines;
}

function writeSvg(filename, title, content, accent) {
  const lines = wrapText(content);
  const height = 60 + lines.length * 22;

  const textLines = lines
    .map((l, i) => `<text x="20" y="${60 + i * 22}" class="text">${escapeSvg(l)}</text>`)
    .join("\n");

  const svg = `
<svg xmlns="http://www.w3.org/2000/svg" width="900" height="${height}">
  <style>
    .bg { fill: #0d1117; }
    .title { font: 700 16px monospace; fill: ${accent}; }
    .text { font: 14px monospace; fill: #c9d1d9; }
    .date { font: 12px monospace; fill: #8b949e; }
  </style>
  <rect width="100%" height="100%" class="bg"/>
  <text x="20" y="28" class="title">${title}</text>
  <text x="880" y="28" text-anchor="end" class="date">${dateStr}</text>
  ${textLines}
</svg>
`.trim();

  fs.writeFileSync(filename, svg);
}

/* -------------------- AI Providers -------------------- */

const geminiAI = process.env.GEMINI_API_KEY
  ? new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY })
  : null;

async function generateGemini(prompt) {
  if (!geminiAI) throw new Error("No GEMINI key");
  const res = await geminiAI.models.generateContent({
    model: "gemini-2.0-flash",
    contents: prompt,
  });
  const text = res.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
  if (!text) throw new Error("Empty Gemini response");
  return text.replace(/\n/g, " ");
}

async function generateGroq(prompt) {
  if (!process.env.GROQ_API_KEY) throw new Error("No GROQ key");
  const res = await fetch("https://api.groq.ai/v1/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: process.env.GROQ_MODEL || "llama-3.1-8b-instant",
      prompt,
      max_output_tokens: 128,
    }),
  });
  const data = await res.json();
  const text = data?.output_text?.trim();
  if (!text) throw new Error("Empty Groq response");
  return text.replace(/\n/g, " ");
}

async function generateWithFallback(prompt, localFallback) {
  try {
    return await generateGemini(prompt);
  } catch (e1) {
    console.warn("⚠️ Gemini failed:", e1.message);
    try {
      return await generateGroq(prompt);
    } catch (e2) {
      console.warn("⚠️ Groq failed:", e2.message);
      const fallback = localFallback[Math.floor(Math.random() * localFallback.length)];
      console.warn("Using local fallback:", fallback);
      return fallback;
    }
  }
}

/* -------------------- Main -------------------- */

async function main() {
  const jokeFallbacks = [
    "Why do programmers prefer dark mode? Because light attracts bugs.",
    "A programmer walks into a bar and orders 1.000000119 beers.",
    "There are only two hard things in computer science: cache invalidation and naming things.",
  ];

  const newsFallbacks = [
    "Tech company announces AI breakthrough, quietly ships more bugs.",
    "Major platform promises performance improvements, users remain skeptical.",
    "Developers celebrate new framework, rewrite everything again.",
  ];

  const jokePrompt = "Tell me a short programming joke. One sentence.";
  const newsPrompt = `Summarize the biggest technology news from ${yesterdayStr} in one sentence. Neutral tone. No emojis.`;

  const joke = await generateWithFallback(jokePrompt, jokeFallbacks);
  const news = await generateWithFallback(newsPrompt, newsFallbacks);

  fs.appendFileSync("jokes.txt", `[${dateStr}] ${joke}\n`);
  fs.appendFileSync("news.txt", `[${dateStr}] ${news}\n`);

  writeSvg("joke.svg", "Daily Joke", getLastLine("jokes.txt"), "#3fb950");
  writeSvg("news.svg", "Daily Tech News", getLastLine("news.txt"), "#58a6ff");

  console.log(`Joke: ${joke} | News: ${news}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
