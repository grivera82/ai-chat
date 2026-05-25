# AI Chat

A beautiful, modern, and minimalist chat interface for **free AI models**.

Built with Next.js and designed for a delightful experience — no clutter, just great conversations with powerful free models from OpenRouter.

**[Live Demo](https://ai-chat-liart-pi.vercel.app)**

![AI Chat Interface](https://github.com/user-attachments/assets/placeholder)  
<!-- Add a real screenshot here for maximum impact -->

## ✨ Features

- **Only Free Models** — Automatically shows the best free models from OpenRouter (no paid models cluttering the list)
- **Stunning UI** — Clean, modern design with full **light + dark mode** support
- **Real-time Streaming** — Responses appear token-by-token with a stop button
- **Beautiful Markdown** — Full GitHub-flavored markdown with syntax-highlighted code blocks and one-click copy
- **Multiple Conversations** — Sidebar with persistent chat history
- **Smart Model Picker** — Easily switch between high-quality free models
- **Thoughtful Details** — Auto-generated chat titles, message regeneration, keyboard shortcuts, and smooth animations
- **Secure by Design** — Your OpenRouter API key is stored only in your browser (never sent to any server except OpenRouter)

## 🚀 Getting Started

### 1. Get a Free OpenRouter API Key

Visit [https://openrouter.ai/keys](https://openrouter.ai/keys) and create a free account. Many excellent models are available at no cost.

### 2. Run Locally

```bash
git clone https://github.com/grivera82/ai-chat.git
cd ai-chat
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

### 3. Add Your API Key

1. Click the **gear icon** (Settings) in the top right
2. Paste your `sk-or-...` key
3. Click **Save Key**

You're ready to chat!

## 🛠 Tech Stack

- **Next.js 16** (App Router + Turbopack)
- **TypeScript**
- **Tailwind CSS v4**
- **Framer Motion** — smooth animations
- **React Markdown** + remark-gfm
- **Sonner** — elegant toast notifications
- **Vercel** — Edge Functions for streaming

## 📁 Project Structure

```
app/
├── api/
│   ├── chat/route.ts          # Streaming proxy to OpenRouter
│   └── models/route.ts        # Fetches only free models
├── layout.tsx
├── page.tsx                   # Main chat interface
├── globals.css
components/
└── ThemeProvider.tsx
```

## 💡 Tips

- All models shown in the picker are **completely free**
- Popular free models include Gemini 2.0 Flash, Llama 3.3 70B, Qwen 2.5, and more
- Your chats and settings are saved in localStorage
- Works great locally — just don’t deploy publicly with a real key without adding auth

## 🚀 Deployment

This project is optimized for Vercel:

```bash
vercel
vercel --prod
```

## 🛣️ Future Improvements

- [ ] Vision / image upload support
- [ ] Message editing & branching
- [ ] Export chats (Markdown / JSON)
- [ ] System prompt presets
- [ ] Usage tracking per model

## 📄 License

MIT License

---

**Made with care** for people who want a clean, beautiful way to talk to great AI models — for free. 

If you like this project, consider starring it on GitHub!
