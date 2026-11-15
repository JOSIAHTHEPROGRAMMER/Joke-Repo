import fs from "fs";
import "dotenv/config";
import { GoogleGenAI } from "@google/genai";
import { Groq } from "groq-sdk";

const today = new Date();
const dateStr = today.toISOString().split("T")[0];
const dayOfYear = Math.floor(
  (Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()) -
    Date.UTC(today.getUTCFullYear(), 0, 0)) / 864e5
);
// cron runs every 2 days, so step by 2 to alternate properly
const runIndex = Math.floor(dayOfYear / 2);

const CATEGORIES = ["business", "entertainment", "general", "health", "science", "sports", "technology"];
const category = CATEGORIES[runIndex % CATEGORIES.length];
const useGNews = runIndex % 2 === 0;

const COLORS = {
  business: "#ff9f1a", entertainment: "#ff3f7f", general: "#58a6ff",
  health: "#1dd3b0", science: "#9b5de5", sports: "#ff6b6b", technology: "#f5c518",
};

const GROQ_MODEL = process.env.GROQ_MODEL || "llama-3.1-8b-instant";
const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash";

// ---------- helpers ----------
const escapeXml = (s) =>
  String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&apos;");

function wrapText(text, maxChars = 90) {
  const lines = [];
  let line = "";
  for (let word of text.split(/\s+/)) {
    while (word.length > maxChars) {            // break overlong words
      if (line) { lines.push(line); line = ""; }
      lines.push(word.slice(0, maxChars));
      word = word.slice(maxChars);
    }
    if ((line + " " + word).trim().length > maxChars) {
      lines.push(line);
      line = word;
    } else {
      line = (line + " " + word).trim();
    }
  }
  if (line) lines.push(line);
  return lines;
}

function getLastLine(file) {
  if (!fs.existsSync(file)) return "";
  return fs.readFileSync(file, "utf8").trim().split("\n").pop() || "";
}

function writeSvg(filename, title, content, accent, link = null) {
  const lines = wrapText(content);
  const height = 70 + lines.length * 22;
  const text = lines
    .map((l, i) => `<text x="20" y="${60 + i * 22}" class="text">${escapeXml(l)}</text>`)
    .join("\n");
  const open = link ? `<a href="${escapeXml(link)}" target="_blank" rel="noopener noreferrer">` : "";
  const close = link ? "</a>" : "";

  fs.writeFileSync(filename, `<svg xmlns="http://www.w3.org/2000/svg" width="900" height="${height}">
  <style>
    .bg { fill: #0d1117; }
    .title { font: 700 16px monospace; fill: ${accent}; }
    .text { font: 14px monospace; fill: #c9d1d9; }
    .date { font: 12px monospace; fill: #8b949e; }
  </style>
  ${open}
  <rect width="100%" height="100%" rx="8" class="bg"/>
  <text x="20" y="28" class="title">${escapeXml(title)}</text>
  <text x="880" y="28" text-anchor="end" class="date">${dateStr}</text>
  ${text}
  ${close}
</svg>`);
}

async function fetchJson(url) {
  const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
  if (!res.ok) throw new Error(`HTTP ${res.status} from ${new URL(url).hostname}`);
  return res.json();
}

// ---------- AI ----------
const SYSTEM =
  "You write one-line sarcastic reactions to news headlines, from the point of view of a tired software developer. " +
  "Rules: one sentence, under 140 characters, lowercase is fine, no quotes, no hashtags, no emojis. " +
  "Output ONLY the reaction.";

const cleanReaction = (t) =>
  t.replace(/\s+/g, " ").replace(/^["'“”‘’]+|["'“”‘’]+$/g, "").trim();

const providers = [
  {
    name: "groq",
    enabled: !!process.env.GROQ_API_KEY,
    async run(headline) {
      const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
      const res = await groq.chat.completions.create({
        model: GROQ_MODEL,
        temperature: 0.9,
        max_completion_tokens: 80,
        messages: [
          { role: "system", content: SYSTEM },
          { role: "user", content: `Headline: ${headline}` },
        ],
      });
      return res.choices?.[0]?.message?.content;
    },
  },
  {
    name: "gemini",
    enabled: !!process.env.GEMINI_API_KEY,
    async run(headline) {
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
      const res = await ai.models.generateContent({
        model: GEMINI_MODEL,
        contents: `Headline: ${headline}`,
        config: {
          systemInstruction: SYSTEM,
          temperature: 0.9,
          maxOutputTokens: 100,
          thinkingConfig: { thinkingBudget: 0 }, // don't burn tokens on thinking
        },
      });
      return res.text;
    },
  },
];

const FALLBACKS = [
  "yeah… that checks out.",
  "cool. cool. totally normal.",
  "this is why we can’t have nice things.",
  "i should’ve stayed in bed.",
];

async function generateReaction(headline) {
  for (const p of providers) {
    if (!p.enabled) {
      console.warn(`[${p.name}] skipped: API key not set`);
      continue;
    }
    try {
      const text = cleanReaction((await p.run(headline)) || "");
      if (text.length < 5 || text.length > 250) throw new Error(`bad output length (${text.length})`);
      console.log(`[${p.name}] ok`);
      return { text, source: p.name };
    } catch (e) {
      console.warn(`[${p.name}] failed: ${e.message}`);
    }
  }
  return { text: FALLBACKS[Math.floor(Math.random() * FALLBACKS.length)], source: "fallback" };
}

// ---------- news ----------
const stripSource = (t) => t.replace(/\s+[-–|]\s+[^-–|]{2,40}$/, "").trim();

async function fetchNewsAPI() {
  const key = process.env.NEWS_API_KEY;
  if (!key) throw new Error("NEWS_API_KEY not set");
  const data = await fetchJson(
    `https://newsapi.org/v2/top-headlines?category=${category}&language=en&country=us&pageSize=5&apiKey=${key}`
  );
  const a = data.articles?.find((x) => x.title && x.title !== "[Removed]");
  if (!a) throw new Error("no article");
  return { title: stripSource(a.title), url: a.url };
}

async function fetchGNews() {
  const key = process.env.NEWS_API_KEY_2;
  if (!key) throw new Error("NEWS_API_KEY_2 not set");
  const data = await fetchJson(
    `https://gnews.io/api/v4/top-headlines?category=${category}&lang=en&max=1&apikey=${key}`
  );
  const a = data.articles?.[0];
  if (!a) throw new Error("no article");
  return { title: stripSource(a.title), url: a.url };
}

async function fetchNews() {
  const order = useGNews
    ? [["gnews", fetchGNews], ["newsapi", fetchNewsAPI]]
    : [["newsapi", fetchNewsAPI], ["gnews", fetchGNews]];
  for (const [name, fn] of order) {
    try {
      const r = await fn();
      console.log(`[news:${name}] ok`);
      return r;
    } catch (e) {
      console.warn(`[news:${name}] failed: ${e.message}`);
    }
  }
  return { title: "Breaking: nothing happened today", url: "https://github.com" };
}

// ---------- joke ----------
async function getJoke() {
  try {
    const d = await fetchJson(
      "https://v2.jokeapi.dev/joke/Programming?blacklistFlags=nsfw,religious,political,racist,sexist,explicit"
    );
    if (d.error) throw new Error(d.message);
    return d.type === "single"
      ? `[${d.category}] ${d.joke.replace(/\s+/g, " ")}`
      : `[${d.category}] ${d.setup} ... ${d.delivery}`;
  } catch (e) {
    console.warn(`[joke] failed: ${e.message}`);
    return "[Joke] something broke but pretend this was funny";
  }
}

// ---------- main ----------
async function main() {
  const article = await fetchNews();
  const [joke, reaction] = await Promise.all([getJoke(), generateReaction(article.title)]);

  fs.appendFileSync("jokes.txt", `[${dateStr}] ${joke}\n`);
  fs.appendFileSync("news.txt", `[${dateStr}] [${category.toUpperCase()}] ${article.title}\n`);
  fs.writeFileSync("reaction.txt", reaction.text);

  writeSvg("joke.svg", "Daily Joke", getLastLine("jokes.txt"), "#3fb950");
  writeSvg("news.svg", "Daily News", article.title, COLORS[category], article.url);
  writeSvg("reaction.svg", "Dev Reaction", reaction.text, "#f778ba");

  console.log({ category, joke, headline: article.title, reaction });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});