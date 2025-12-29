import fs from "fs";
import "dotenv/config";
import fetch from "node-fetch";
import { GoogleGenAI } from "@google/genai";
import { Groq } from "groq-sdk";

// Check API keys
if (
  !process.env.GROQ_API_KEY &&
  !process.env.GEMINI_API_KEY &&
  !process.env.NEWS_API_KEY &&
  !process.env.NEWS_API_KEY_2
) {
  console.error(" Missing API keys");
  process.exit(1);
}

// Dates
const today = new Date();
const dateStr = today.toISOString().split("T")[0];

/* ===================== CATEGORY ROTATION ===================== */
const CATEGORY_ROTATION = [
  "business",
  "entertainment",
  "general",
  "health",
  "science",
  "sports",
  "technology",
];
const category = CATEGORY_ROTATION[today.getDay()];
const useGNews = today.getDate() % 2 === 0;
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
  const height = 70 + lines.length * 22;
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
const groq = process.env.GROQ_API_KEY ? new Groq({ apiKey: process.env.GROQ_API_KEY }) : null;
const geminiAI = process.env.GEMINI_API_KEY 
? new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY }) 
: null;

async function generateGroq(prompt) {
  if (!groq) throw new Error("No GROQ key");

  const chatCompletion = await groq.chat.completions.create({
    messages: [{ role: "user", content: prompt }],
    model: "openai/gpt-oss-120b",
    temperature: 1,
    max_completion_tokens: 8192,
    top_p: 1,
    stream: true,
    reasoning_effort: "medium",
  });

  let result = "";
  for await (const chunk of chatCompletion) {
    result += chunk.choices[0]?.delta?.content || "";
  }

  if (!result) throw new Error("Empty Groq response");
  return result.replace(/\n/g, " ");
}

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

async function generateWithFallback(prompt) {
  try {
    return await generateGroq(prompt);
  } catch (e) {
    console.warn(" Groq failed:", e.message);
    if (geminiAI) return await generateGemini(prompt);
    throw e;
  }
}

/* ===================== NEWS FETCHERS ===================== */
async function fetchNewsAPI(category) {
  if (!process.env.NEWS_API_KEY) throw new Error("No NewsAPI");
  const url = `https://newsapi.org/v2/top-headlines?category=${category}&language=en&pageSize=1&apiKey=${process.env.NEWS_API_KEY}`;
  const res = await fetch(url);
  const data = await res.json();
  return data?.articles?.[0]?.title;
}

async function fetchGNews(category) {
  if (!process.env.NEWS_API_KEY_2) throw new Error("No GNews");
  const url = `https://gnews.io/api/v4/top-headlines?category=${category}&lang=en&max=1&apikey=${process.env.NEWS_API_KEY_2}`;
  const res = await fetch(url);
  const data = await res.json();
  return data?.articles?.[0]?.title;
}

/* -------------------- Main -------------------- */
async function main() {
  const jokePrompt = "Tell me a short random joke. One sentence.";

  let headline;
  try {
    headline = useGNews ? await fetchGNews(category) : await fetchNewsAPI(category);
  } catch (e) {
    console.error("News fetch error:", e);
    process.exit(1);
  }

  const reactionPrompt = `
React to this headline like a mildly tired but witty developer.
One sentence. Slight sarcasm. No emojis.

"${headline}"
`;

  const joke = await generateWithFallback(jokePrompt);
  const reaction = await generateWithFallback(reactionPrompt);

  fs.appendFileSync("jokes.txt", `[${dateStr}] ${joke}\n`);
  fs.appendFileSync("news.txt", `[${dateStr}] [${category.toUpperCase()}] ${headline}\n`);
  fs.writeFileSync("reaction.txt", reaction);

  const categoryColors = {
    business: "#ff9f1a",
    entertainment: "#ff3f7f",
    general: "#58a6ff",
    health: "#1dd3b0",
    science: "#9b5de5",
    sports: "#ff6b6b",
    technology: "#f5c518",
  };

  writeSvg("joke.svg", "Daily Joke", getLastLine("jokes.txt"), "#3fb950");
  writeSvg("news.svg", "Daily News", headline, categoryColors[category] || "#58a6ff");

  console.log("Joke:", joke);
  console.log("Headline:", headline);
  console.log("Reaction:", reaction);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});