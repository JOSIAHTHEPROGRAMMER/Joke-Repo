import fs from "fs";
import "dotenv/config";
import fetch from "node-fetch";
import { GoogleGenAI } from "@google/genai";
import { Groq } from "groq-sdk";

const today = new Date();
const dateStr = today.toISOString().split("T")[0];

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

function writeSvg(filename, title, content, accent, link = null) {
  const lines = wrapText(content);
  const height = 70 + lines.length * 22;

  const textLines = lines
    .map(
      (l, i) =>
        `<text x="20" y="${60 + i * 22}" class="text">${escapeSvg(l)}</text>`
    )
    .join("\n");

  const clickableStart = link
    ? `<a href="${link}" target="_blank" rel="noopener noreferrer">`
    : "";
  const clickableEnd = link ? `</a>` : "";

  const svg = `
<svg xmlns="http://www.w3.org/2000/svg" width="900" height="${height}">
  <style>
    .bg { fill: #0d1117; }
    .title { font: 700 16px monospace; fill: ${accent}; }
    .text { font: 14px monospace; fill: #c9d1d9; }
    .date { font: 12px monospace; fill: #8b949e; }
  </style>

  ${clickableStart}
  <rect width="100%" height="100%" class="bg"/>
  <text x="20" y="28" class="title">${escapeSvg(title)}</text>
  <text x="880" y="28" text-anchor="end" class="date">${dateStr}</text>
  ${textLines}
  ${clickableEnd}
</svg>
`.trim();

  fs.writeFileSync(filename, svg);
}

const groq = process.env.GROQ_API_KEY
  ? new Groq({ apiKey: process.env.GROQ_API_KEY })
  : null;

const geminiAI = process.env.GEMINI_API_KEY
  ? new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY })
  : null;

async function generateGroq(prompt) {
  if (!groq) throw new Error("no groq");
  const res = await groq.chat.completions.create({
    messages: [{ role: "user", content: prompt }],
    model: "llama-3.1-8b-instant",
    temperature: 0.9,
    max_completion_tokens: 60,
  });
  const text = res.choices?.[0]?.message?.content?.trim();
  if (!text) throw new Error("empty groq");
  return text.replace(/\n/g, " ");
}

async function generateGemini(prompt) {
  if (!geminiAI) throw new Error("no gemini");
  const res = await geminiAI.models.generateContent({
    model: "gemini-2.0-flash",
    contents: prompt,
  });
  const text = res.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
  if (!text) throw new Error("empty gemini");
  return text.replace(/\n/g, " ");
}

async function generateWithFallback(prompt) {
  try {
    return await generateGroq(prompt);
  } catch (e1) {
    try {
      if (geminiAI) {
        return await generateGemini(prompt);
      }
    } catch (e2) {}
    const fallback = [
      "yeah… that checks out.",
      "cool. cool. totally normal.",
      "this is why we can’t have nice things.",
      "i should’ve stayed in bed.",
    ];
    return fallback[Math.floor(Math.random() * fallback.length)];
  }
}

async function fetchNewsAPI(category) {
  if (!process.env.NEWS_API_KEY) throw new Error("no newsapi");
  const url = `https://newsapi.org/v2/top-headlines?category=${category}&language=en&pageSize=1&apiKey=${process.env.NEWS_API_KEY}`;
  const res = await fetch(url);
  const data = await res.json();
  const article = data?.articles?.[0];
  if (!article) throw new Error("no article");
  return { title: article.title, url: article.url };
}

async function fetchGNews(category) {
  if (!process.env.NEWS_API_KEY_2) throw new Error("no gnews");
  const url = `https://gnews.io/api/v4/top-headlines?category=${category}&lang=en&max=1&apikey=${process.env.NEWS_API_KEY_2}`;
  const res = await fetch(url);
  const data = await res.json();
  const article = data?.articles?.[0];
  if (!article) throw new Error("no article");
  return { title: article.title, url: article.url };
}

async function fetchNewsSafe() {
  try {
    return useGNews
      ? await fetchGNews(category)
      : await fetchNewsAPI(category);
  } catch (e1) {
    try {
      return useGNews
        ? await fetchNewsAPI(category)
        : await fetchGNews(category);
    } catch (e2) {
      return {
        title: "Breaking: nothing happened today",
        url: "https://github.com",
      };
    }
  }
}

async function getJoke() {
  try {
    const res = await fetch("https://v2.jokeapi.dev/joke/Programming");
    const data = await res.json();
    if (data.error) throw new Error();
    if (data.type === "single") {
      return `[${data.category}] ${data.joke}`;
    }
    if (data.type === "twopart") {
      return `[${data.category}] ${data.setup} ... ${data.delivery}`;
    }
  } catch (e) {}
  return "[Joke] something broke but pretend this was funny";
}

async function main() {
  const article = await fetchNewsSafe();
  const headline = article.title;
  const articleUrl = article.url;

  const reactionPrompt = `one sarcastic developer reaction to: "${headline}"`;

  const joke = await getJoke();
  const reaction = await generateWithFallback(reactionPrompt);

  fs.appendFileSync("jokes.txt", `[${dateStr}] ${joke}\n`);
  fs.appendFileSync(
    "news.txt",
    `[${dateStr}] [${category.toUpperCase()}] ${headline}\n`
  );
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
  writeSvg(
    "news.svg",
    "Daily News",
    headline,
    categoryColors[category] || "#58a6ff",
    articleUrl
  );

  console.log("Joke:", joke);
  console.log("Headline:", headline);
  console.log("Reaction:", reaction);
}

main().catch(() => {});
