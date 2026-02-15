# Joke Groq Project

![Automation](https://img.shields.io/badge/automation-unhinged-orange?style=for-the-badge)
![Commits](https://img.shields.io/badge/commits-mostly_fake-blueviolet?style=for-the-badge)
![Truth](https://img.shields.io/badge/truth-optional-black?style=for-the-badge)

Automated daily joke and news generator with AI-powered witty reactions. Updates SVG badges with rotating news categories and programming jokes.

## Features

- Daily programming jokes from JokeAPI
- Rotating news categories (business, tech, sports, etc.)
- AI-generated sarcastic reactions via Groq/Gemini
- Auto-generated SVG badges
- Category-specific color coding

## How It Works

1. Fetches daily programming joke
2. Gets top headline from rotating category
3. AI generates witty developer reaction
4. Creates colorful SVG badges
5. Logs everything to text files

## Setup

```bash
npm install
```

Create `.env`:
```env
GROQ_API_KEY=your_groq_key
GEMINI_API_KEY=your_gemini_key
NEWS_API_KEY=your_newsapi_key
NEWS_API_KEY_2=your_gnews_key
```

## Usage

```bash
node index.js
```

Generates:
- `joke.svg` - Daily programming joke
- `news.svg` - Clickable news headline
- `reaction.txt` - AI reaction
- `jokes.txt` - Joke history
- `news.txt` - News history

## Category Rotation

Each day of the week gets a different news category:
- Sunday: Business
- Monday: Entertainment
- Tuesday: General
- Wednesday: Health
- Thursday: Science
- Friday: Sports
- Saturday: Technology

## API Fallbacks

- Primary: Groq AI
- Fallback: Google Gemini
- News alternates between NewsAPI and GNews

## Output Example

**Joke:** `[Programming] Why do programmers prefer dark mode? Because light attracts bugs!`

**Headline:** `Tech Giants Announce New AI Framework`

**Reaction:** `Another framework? Perfect, just what we needed to add to the graveyard of abandoned projects.`
