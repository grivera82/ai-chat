"use client";

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { 
  Send, Plus, Settings, Trash2, Copy, RefreshCw, X, Search, ChevronDown, 
  MessageSquare, Clock, Sun, Moon 
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { toast } from 'sonner';
import type { Message, Chat, OpenRouterModel } from '@/lib/types';
import { useTheme } from '@/components/ThemeProvider';

// Generate unique IDs
const generateId = () => crypto.randomUUID?.() || Date.now().toString(36) + Math.random().toString(36).slice(2);

// Default welcome chat
const createNewChat = (model: string = 'google/gemini-2.0-flash-exp:free'): Chat => ({
  id: generateId(),
  title: 'New Chat',
  messages: [],
  model,
  createdAt: Date.now(),
  updatedAt: Date.now(),
});

// Nice code block with header + copy
function CodeBlock({ inline, className, children, ...props }: React.HTMLAttributes<HTMLElement> & { inline?: boolean }) {
  const [copied, setCopied] = useState(false);
  const match = /language-(\w+)/.exec(className || '');
  const lang = match ? match[1] : 'text';
  const code = String(children).replace(/\n$/, '');

  if (inline) {
    return <code className="bg-zinc-200 px-1.5 py-0.5 rounded text-sm font-medium border border-zinc-300 dark:bg-zinc-950 dark:border-zinc-800" {...props}>{children}</code>;
  }

  const handleCopy = async () => {
    await navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
    toast.success('Code copied');
  };

  return (
    <div className="code-block">
      <div className="code-header">
        <span className="code-lang">{lang}</span>
        <button 
          onClick={handleCopy}
          className="text-xs px-2 py-0.5 rounded bg-zinc-300 hover:bg-zinc-400 text-zinc-600 hover:text-zinc-900 dark:bg-zinc-800 dark:hover:bg-zinc-700 dark:text-zinc-400 dark:hover:text-white transition-colors flex items-center gap-1"
        >
          <Copy size={12} /> {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      <pre className="!m-0 !rounded-none !border-0 !bg-transparent p-4 overflow-x-auto text-sm">
        <code className={className} {...props}>{children}</code>
      </pre>
    </div>
  );
}

const markdownComponents = {
  code: CodeBlock,
  pre: ({ children }: { children?: React.ReactNode }) => children, // handled by CodeBlock
};

export default function OpenRouterChat() {
  const { theme, toggleTheme } = useTheme();

  // Core state
  const [apiKey, setApiKey] = useState('');
  const [chats, setChats] = useState<Chat[]>([]);
  const [currentChatId, setCurrentChatId] = useState<string>('');
  const [models, setModels] = useState<OpenRouterModel[]>([]);
  const [selectedModel, setSelectedModel] = useState('google/gemini-2.0-flash-exp:free');
  const [isLoadingModels, setIsLoadingModels] = useState(false);

  // UI state
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isModelPickerOpen, setIsModelPickerOpen] = useState(false);
  const [modelSearch, setModelSearch] = useState('');
  const [input, setInput] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingMessageId, setStreamingMessageId] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);

  // Refs
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Current chat
  const currentChat = chats.find(c => c.id === currentChatId) || null;
  const messages = currentChat?.messages || [];

  // Filtered models for picker
  const filteredModels = React.useMemo(() => {
    if (!modelSearch.trim()) return models.slice(0, 60);
    const q = modelSearch.toLowerCase();
    return models
      .filter(m => 
        m.id.toLowerCase().includes(q) || 
        m.name.toLowerCase().includes(q)
      )
      .slice(0, 40);
  }, [models, modelSearch]);

  // Load from localStorage on mount (single hydration effect)
  useEffect(() => {
    const savedKey = localStorage.getItem('openrouter_key') || '';
    const savedChatsRaw = localStorage.getItem('chats');
    const savedCurrentId = localStorage.getItem('currentChatId');
    const savedModel = localStorage.getItem('selectedModel') || 'openai/gpt-4o-mini';

    // eslint-disable-next-line react-hooks/set-state-in-effect
    setApiKey(savedKey);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSelectedModel(savedModel);

    let initialChats: Chat[] = [];
    let initialId = '';

    if (savedChatsRaw) {
      try {
        const parsed = JSON.parse(savedChatsRaw) as Chat[];
        if (parsed.length > 0) {
          initialChats = parsed;
          initialId = savedCurrentId && parsed.some(c => c.id === savedCurrentId)
            ? savedCurrentId
            : parsed[0].id;
        }
      } catch {
        // ignore corrupted storage
      }
    }

    if (initialChats.length === 0) {
      const newChat = createNewChat(savedModel);
      initialChats = [newChat];
      initialId = newChat.id;
    }

    // eslint-disable-next-line react-hooks/set-state-in-effect
    setChats(initialChats);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setCurrentChatId(initialId);
  }, []);

  // Persist chats + current
  useEffect(() => {
    if (chats.length > 0) {
      localStorage.setItem('chats', JSON.stringify(chats));
    }
    if (currentChatId) {
      localStorage.setItem('currentChatId', currentChatId);
    }
  }, [chats, currentChatId]);

  // Persist selected model
  useEffect(() => {
    localStorage.setItem('selectedModel', selectedModel);
  }, [selectedModel]);

  // Auto-scroll to bottom
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    if (!isStreaming) scrollToBottom();
  }, [messages.length, isStreaming]);

  // Auto-resize textarea
  useEffect(() => {
    const ta = textareaRef.current;
    if (ta) {
      ta.style.height = 'auto';
      ta.style.height = Math.min(ta.scrollHeight, 180) + 'px';
    }
  }, [input]);

  // Fetch models when we have a key (memoized)
  const fetchModels = useCallback(async (key: string) => {
    if (!key) return;
    
    setIsLoadingModels(true);
    try {
      const res = await fetch('/api/models', {
        headers: { 'x-openrouter-key': key },
      });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      setModels(data.models || []);
      toast.success(`Loaded ${data.models?.length || 0} models`);
    } catch (err: unknown) {
      console.error(err);
      toast.error('Failed to load models. Check your key?');
    } finally {
      setIsLoadingModels(false);
    }
  }, []);

  // Save API key
  const saveApiKey = (key: string) => {
    const trimmed = key.trim();
    localStorage.setItem('openrouter_key', trimmed);
    setApiKey(trimmed);
    setIsSettingsOpen(false);
    
    if (trimmed) {
      toast.success('API key saved');
      fetchModels(trimmed);
    } else {
      toast.info('API key removed');
      setModels([]);
    }
  };

  // Create a brand new chat
  const handleNewChat = () => {
    const newChat = createNewChat(selectedModel);
    setChats(prev => [newChat, ...prev]);
    setCurrentChatId(newChat.id);
    setInput('');
    setIsModelPickerOpen(false);
    // Focus input after render
    setTimeout(() => textareaRef.current?.focus(), 50);
  };

  // Switch chats
  const switchToChat = (chatId: string) => {
    setCurrentChatId(chatId);
    setInput('');
    // Close sidebar on mobile-ish
    if (window.innerWidth < 768) setSidebarOpen(false);
  };

  // Delete a chat
  const deleteChat = (chatId: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    const remaining = chats.filter(c => c.id !== chatId);
    
    if (remaining.length === 0) {
      const fresh = createNewChat(selectedModel);
      setChats([fresh]);
      setCurrentChatId(fresh.id);
    } else {
      setChats(remaining);
      if (currentChatId === chatId) {
        setCurrentChatId(remaining[0].id);
      }
    }
    toast.success('Chat deleted');
  };

  // Update chat helper (immutable)
  const updateChat = (chatId: string, updater: (chat: Chat) => Chat) => {
    setChats(prev => prev.map(c => c.id === chatId ? updater(c) : c));
  };

  // Send a message + stream response
  const sendMessage = async () => {
    const trimmed = input.trim();
    if (!trimmed || !currentChatId || !apiKey) return;

    if (!currentChat) return;

    // Optimistically add user message
    const userMessage: Message = {
      id: generateId(),
      role: 'user',
      content: trimmed,
    };

    const isFirstMessage = currentChat.messages.length === 0;
    const updatedMessages = [...currentChat.messages, userMessage];

    // Update title on first message
    const newTitle = isFirstMessage 
      ? trimmed.slice(0, 48) + (trimmed.length > 48 ? '...' : '')
      : currentChat.title;

    updateChat(currentChatId, chat => ({
      ...chat,
      title: newTitle,
      messages: updatedMessages,
      model: selectedModel,
      updatedAt: Date.now(),
    }));

    setInput('');
    setIsStreaming(true);

    // Abort controller for stop (shared across retries)
    const controller = new AbortController();
    abortControllerRef.current = controller;

    // We keep a mutable reference to the current assistant placeholder id
    let currentAssistantId = '';

    const attemptSend = async (attempt = 0): Promise<void> => {
      // Create (or replace) the assistant placeholder for this attempt
      currentAssistantId = generateId();
      const placeholder: Message = {
        id: currentAssistantId,
        role: 'assistant',
        content: '',
      };

      updateChat(currentChatId, chat => ({
        ...chat,
        messages: [...updatedMessages, placeholder],
        updatedAt: Date.now(),
      }));
      setStreamingMessageId(currentAssistantId);

      try {
        const res = await fetch('/api/chat', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-openrouter-key': apiKey,
          },
          body: JSON.stringify({
            messages: updatedMessages,
            model: selectedModel,
            temperature: 0.7,
          }),
          signal: controller.signal,
        });

        if (!res.ok || !res.body) {
          let errorInfo: Record<string, unknown> = {};
          try {
            errorInfo = await res.json();
          } catch {
            const text = await res.text().catch(() => '');
            errorInfo = { error: text || `Request failed (${res.status})` };
          }

          const message = (errorInfo?.error || errorInfo?.message || `Request failed (${res.status})`) as string;
          const code = (errorInfo?.code || res.status) as number;
          const retryAfterRaw = errorInfo?.retryAfter as number | string | undefined;
          const retryAfter = retryAfterRaw ? Number(retryAfterRaw) : undefined;

          // Special handling for rate limits (429) — auto-retry up to 2 times
          if (code === 429 && retryAfter && attempt < 2) {
            const seconds = Math.max(1, Math.ceil(retryAfter));
            toast(`Rate limited on this model. Auto-retrying in ${seconds}s...`, {
              duration: seconds * 1000 + 800,
            });

            // Remove the current placeholder before waiting
            updateChat(currentChatId, chat => ({
              ...chat,
              messages: chat.messages.filter(m => m.id !== currentAssistantId),
            }));

            // Wait the suggested time
            await new Promise(resolve => setTimeout(resolve, seconds * 1000));

            // Recursively retry with the same user messages
            return attemptSend(attempt + 1);
          }

          // Final error (or gave up on retries)
          throw new Error(message);
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let accumulated = '';

        while (true) {
          const { value, done } = await reader.read();
          if (done) break;

          accumulated += decoder.decode(value, { stream: true });

          // Live update using the *current* assistant id for this attempt
          updateChat(currentChatId, chat => ({
            ...chat,
            messages: chat.messages.map(m =>
              m.id === currentAssistantId ? { ...m, content: accumulated } : m
            ),
            updatedAt: Date.now(),
          }));
        }

        // Finalize
        const finalContent = accumulated.trim();
        if (finalContent) {
          updateChat(currentChatId, chat => ({
            ...chat,
            messages: chat.messages.map(m =>
              m.id === currentAssistantId ? { ...m, content: finalContent } : m
            ),
          }));
        }

        toast.success('Response complete');
      } catch (err: unknown) {
        const error = err as { name?: string; message?: string };
        if (error.name === 'AbortError') {
          toast.info('Generation stopped');
        } else {
          console.error(err);
          toast.error(error.message || 'Failed to get response');

          // Clean up whatever placeholder exists for this attempt
          updateChat(currentChatId, chat => ({
            ...chat,
            messages: chat.messages.filter(m => m.id !== currentAssistantId),
          }));
        }
      }
    };

    try {
      await attemptSend(0);
    } finally {
      setIsStreaming(false);
      setStreamingMessageId(null);
      abortControllerRef.current = null;
      setTimeout(() => textareaRef.current?.focus(), 10);
    }
  };

  // Stop streaming
  const stopStreaming = () => {
    abortControllerRef.current?.abort();
  };

  // Regenerate last assistant response (remove it + resend)
  const regenerate = async () => {
    if (!currentChat || messages.length < 2 || isStreaming) return;

    const lastUserIndex = [...messages].reverse().findIndex(m => m.role === 'user');
    if (lastUserIndex === -1) return;

    const lastUserMsg = messages[messages.length - 1 - lastUserIndex];
    
    // Remove the last assistant message(s) after that user message
    const newMessages = messages.slice(0, messages.length - lastUserIndex);

    updateChat(currentChatId, chat => ({
      ...chat,
      messages: newMessages,
      updatedAt: Date.now(),
    }));

    // Resend from that point (the sendMessage logic will append new assistant)
    // We need to temporarily set input? No, better to call internal send with the last user content.
    // For simplicity: put last user content back into input and send (or directly trigger)
    setInput(lastUserMsg.content);
    
    // Auto-send after state update
    setTimeout(() => {
      sendMessage();
    }, 30);
  };

  // Copy any message
  const copyMessage = async (content: string) => {
    await navigator.clipboard.writeText(content);
    toast.success('Message copied');
  };

  // Handle keydown in textarea
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
    if (e.key === 'Escape' && isStreaming) {
      stopStreaming();
    }
  };

  // Change model (also update current chat's model)
  const changeModel = (modelId: string) => {
    setSelectedModel(modelId);
    if (currentChatId) {
      updateChat(currentChatId, chat => ({ ...chat, model: modelId }));
    }
    setIsModelPickerOpen(false);
    setModelSearch('');
    toast.success(`Switched to ${modelId.split('/').pop()}`);
  };

  // Open settings and load models if needed
  const openSettings = () => {
    setIsSettingsOpen(true);
    if (apiKey && models.length === 0) {
      fetchModels(apiKey);
    }
  };

  // Initial key check on load
  useEffect(() => {
    if (apiKey) {
      // Defer slightly so UI paints first
      const t = setTimeout(() => fetchModels(apiKey), 300);
      return () => clearTimeout(t);
    }
  }, [apiKey, fetchModels]);

  // Focus input when switching chats
  useEffect(() => {
    if (currentChatId && !isStreaming) {
      setTimeout(() => textareaRef.current?.focus(), 80);
    }
  }, [currentChatId, isStreaming]);

  // (initial chat id is always set during hydration above)

  const hasKey = !!apiKey;
  const canSend = hasKey && input.trim().length > 0 && !isStreaming;

  return (
    <div className="flex h-screen overflow-hidden bg-white text-zinc-900 dark:bg-zinc-950 dark:text-zinc-200">
      {/* SIDEBAR */}
      <AnimatePresence>
        {sidebarOpen && (
          <motion.aside 
            initial={{ x: -280, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: -280, opacity: 0 }}
            transition={{ type: 'spring', bounce: 0.05, duration: 0.25 }}
            className="w-72 border-r border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 flex flex-col z-40"
          >
            {/* Sidebar header */}
            <div className="px-4 py-3 flex items-center justify-between border-b border-zinc-200 dark:border-zinc-800">
              <div className="flex items-center">
                <img 
                  src="/ai-chat-logo.jpg" 
                  alt="AI Chat" 
                  className="h-14 w-auto object-contain" 
                />
              </div>
              <button 
                onClick={() => setSidebarOpen(false)} 
                className="md:hidden text-zinc-400 hover:text-white p-1"
              >
                <X size={18} />
              </button>
            </div>

            {/* New chat */}
            <div className="p-3">
              <button
                onClick={handleNewChat}
                className="btn-primary w-full text-sm"
              >
                <Plus size={16} /> New Chat
              </button>
            </div>

            {/* Chat list */}
            <div className="flex-1 overflow-y-auto px-2 pb-3 space-y-0.5 custom-scroll">
              {chats.length === 0 && (
                <div className="px-3 py-8 text-center text-sm text-zinc-500">No chats yet</div>
              )}
              {chats
                .sort((a, b) => b.updatedAt - a.updatedAt)
                .map(chat => (
                  <div
                    key={chat.id}
                    onClick={() => switchToChat(chat.id)}
                    className={`sidebar-chat-item group ${currentChatId === chat.id ? 'active' : ''}`}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-sm truncate pr-1 leading-snug">
                        {chat.title}
                      </div>
                      <div className="flex items-center gap-1.5 text-[11px] text-zinc-500 mt-0.5">
                        <Clock size={11} />
                        {new Date(chat.updatedAt).toLocaleDateString([], { month: 'short', day: 'numeric' })}
                        <span className="text-zinc-600">·</span>
                        <span className="font-mono text-[10px] truncate max-w-[110px]">
                          {chat.model.split('/').pop()}
                        </span>
                      </div>
                    </div>
                    <button
                      onClick={(e) => deleteChat(chat.id, e)}
                      className="opacity-0 group-hover:opacity-100 text-zinc-500 hover:text-red-400 p-1 -mr-1 transition-all"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))}
            </div>

            {/* Sidebar footer */}
            <div className="p-3 border-t border-zinc-200 dark:border-zinc-800 space-y-1.5">
              <button
                onClick={openSettings}
                className="btn-secondary w-full text-sm justify-start gap-2.5"
              >
                <Settings size={16} /> Settings {hasKey ? '· Key saved' : ''}
              </button>
              <div className="text-[10px] text-center text-zinc-500 dark:text-zinc-600 pt-1">
                Powered by OpenRouter
              </div>
            </div>
          </motion.aside>
        )}
      </AnimatePresence>

      {/* MAIN AREA */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* TOP BAR */}
        <div className="h-14 border-b border-zinc-200 dark:border-zinc-800 flex items-center px-4 gap-3 shrink-0 bg-white/80 dark:bg-zinc-950/80 backdrop-blur supports-[backdrop-filter]:bg-white/70 dark:supports-[backdrop-filter]:bg-zinc-950/70 z-30">
          {!sidebarOpen && (
            <button onClick={() => setSidebarOpen(true)} className="btn-ghost text-sm px-2">
              <MessageSquare size={17} />
            </button>
          )}

          {/* Model picker trigger */}
          <button
            onClick={() => hasKey && setIsModelPickerOpen(true)}
            disabled={!hasKey}
            className="flex items-center gap-2 px-4 h-9 rounded-2xl bg-zinc-100 hover:bg-zinc-200 border border-zinc-300 dark:bg-zinc-900 dark:hover:bg-zinc-800 dark:border-zinc-800 disabled:opacity-60 text-sm font-medium transition-colors"
          >
            <span className="font-mono text-xs text-emerald-400/70">MODEL</span>
            <span>{selectedModel.split('/').pop()}</span>
            <ChevronDown size={15} className="text-zinc-500" />
          </button>

          <div className="flex-1" />

          {/* Right actions */}
          <div className="flex items-center gap-1.5">
            {currentChat && messages.length > 0 && (
              <button onClick={regenerate} disabled={isStreaming || messages.length < 2} className="btn-ghost text-sm" title="Regenerate last response">
                <RefreshCw size={15} className={isStreaming ? 'animate-spin' : ''} />
                <span className="hidden sm:inline ml-1.5">Regenerate</span>
              </button>
            )}
            <button 
              onClick={toggleTheme} 
              className="btn-ghost" 
              title={theme === 'light' ? 'Switch to dark mode' : 'Switch to day mode'}
            >
              {theme === 'light' ? <Moon size={17} /> : <Sun size={17} />}
            </button>
            <button onClick={openSettings} className="btn-ghost">
              <Settings size={17} />
            </button>
          </div>
        </div>

        {/* CHAT CONTENT */}
        <div className="flex-1 overflow-hidden flex flex-col">
          {!hasKey ? (
            /* WELCOME / NO KEY STATE */
            <div className="flex-1 flex items-center justify-center p-6">
              <div className="welcome-card space-y-6">
                <div className="mx-auto w-16 h-16 rounded-3xl overflow-hidden bg-zinc-100 dark:bg-zinc-900 flex items-center justify-center ring-1 ring-zinc-200 dark:ring-zinc-800">
                  <img src="/ai-chat-icon.jpg" alt="AI Chat" className="w-16 h-16 object-cover" />
                </div>
                <div>
                  <h1 className="text-4xl font-semibold tracking-tighter">Welcome to AI Chat</h1>
                  <p className="mt-3 text-zinc-600 dark:text-zinc-400 text-lg">Enter your OpenRouter API key to start chatting with 100+ models.</p>
                </div>
                <button onClick={openSettings} className="btn-primary mx-auto text-base px-8 h-12">
                  Enter API Key
                </button>
                <p className="text-xs text-zinc-500 dark:text-zinc-500">
                  Get your free key at{' '}
                  <a href="https://openrouter.ai/keys" target="_blank" className="underline hover:text-zinc-700 dark:hover:text-zinc-300">openrouter.ai/keys</a>
                </p>
              </div>
            </div>
          ) : messages.length === 0 ? (
            /* EMPTY CHAT STATE */
            <div className="flex-1 flex items-center justify-center p-6">
              <div className="text-center max-w-sm">
                <div className="mx-auto mb-4 w-12 h-12 rounded-2xl bg-zinc-100 dark:bg-zinc-900 flex items-center justify-center">
                  <MessageSquare size={24} className="text-zinc-500 dark:text-zinc-400" />
                </div>
                <div className="text-2xl font-semibold tracking-tight mb-2">Start a new conversation</div>
                <p className="text-zinc-600 dark:text-zinc-400 mb-6">Ask anything. Switch models anytime from the top bar.</p>
                <div className="flex flex-wrap justify-center gap-2 text-xs">
                  {['What can you do?', 'Explain quantum computing', 'Write a haiku about code'].map((s, i) => (
                    <button 
                      key={i}
                      onClick={() => { setInput(s); textareaRef.current?.focus(); }}
                      className="px-3 py-1.5 rounded-2xl bg-white hover:bg-zinc-100 border border-zinc-200 dark:bg-zinc-900 dark:hover:bg-zinc-800 dark:border-zinc-800 transition-colors"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            /* MESSAGES */
            <div className="flex-1 overflow-y-auto px-4 pt-8 pb-4" id="messages">
              <div className="max-w-3xl mx-auto space-y-7">
                {messages.map((msg, idx) => {
                  const isUser = msg.role === 'user';
                  const isStreamingThis = msg.id === streamingMessageId;
                  return (
                    <div key={msg.id} className={`group flex ${isUser ? 'justify-end' : 'justify-start'}`}>
                      <div className={`relative max-w-[82%] ${isUser ? 'ml-8' : 'mr-8'}`}>
                        {!isUser && (
                          <div className="flex items-center gap-2 mb-1.5 pl-1 text-xs text-zinc-500 dark:text-zinc-400 font-medium tracking-wider">
                            {currentChat?.model.split('/').pop()?.toUpperCase() || 'ASSISTANT'}
                          </div>
                        )}

                        <div className={`message-bubble ${isUser ? 'user-bubble' : 'assistant-bubble'}`}>
                          {isUser ? (
                            <div className="whitespace-pre-wrap">{msg.content}</div>
                          ) : (
                            <div className="markdown">
                              {msg.content ? (
                                <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
                                  {msg.content}
                                </ReactMarkdown>
                              ) : (
                                isStreamingThis && <span className="streaming-cursor" />
                              )}
                              {isStreamingThis && msg.content && <span className="streaming-cursor" />}
                            </div>
                          )}
                        </div>

                        {/* Message actions */}
                        {msg.content && !isStreamingThis && (
                          <div className={`message-actions mt-1 ${isUser ? 'justify-end' : ''}`}>
                            <button 
                              onClick={() => copyMessage(msg.content)}
                              className="btn-ghost text-xs h-7 px-2 text-zinc-400"
                            >
                              <Copy size={13} />
                            </button>
                            {isUser && idx === messages.length - 1 && (
                              <button 
                                onClick={regenerate} 
                                disabled={isStreaming}
                                className="btn-ghost text-xs h-7 px-2 text-zinc-400"
                              >
                                <RefreshCw size={13} />
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
                <div ref={messagesEndRef} />
              </div>
            </div>
          )}
        </div>

        {/* INPUT BAR (only when key exists) */}
        {hasKey && (
          <div className="border-t border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 p-4">
            <div className="max-w-3xl mx-auto">
              <div className="relative flex items-end gap-2 rounded-3xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-5 py-3.5 focus-within:border-zinc-400 dark:focus-within:border-zinc-700 transition-colors">
                <textarea
                  ref={textareaRef}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Message AI Chat..."
                  rows={1}
                  className="chat-input flex-1 py-1 placeholder:text-zinc-400 dark:placeholder:text-zinc-500"
                  disabled={isStreaming}
                />

                {isStreaming ? (
                  <button 
                    onClick={stopStreaming}
                    className="btn-secondary h-10 px-5 shrink-0 gap-2 text-red-600 dark:text-red-400 border-red-300 dark:border-red-900/60 hover:bg-red-100 dark:hover:bg-red-950/50"
                  >
                    <X size={16} /> Stop
                  </button>
                ) : (
                  <button
                    onClick={sendMessage}
                    disabled={!canSend}
                    className="btn-primary h-10 px-5 shrink-0 disabled:bg-zinc-200 disabled:text-zinc-400 dark:disabled:bg-zinc-800 dark:disabled:text-zinc-400"
                  >
                    <Send size={17} />
                  </button>
                )}
              </div>
              <div className="text-[10px] text-center text-zinc-500 dark:text-zinc-600 mt-2 tracking-widest">
                {selectedModel} · Press Enter to send • Shift+Enter for newline
              </div>
            </div>
          </div>
        )}
      </div>

      {/* MODEL PICKER MODAL */}
      <AnimatePresence>
        {isModelPickerOpen && (
          <div className="fixed inset-0 z-[60] flex items-start justify-center pt-16 bg-black/60 dark:bg-black/70" onClick={() => setIsModelPickerOpen(false)}>
            <motion.div
              initial={{ opacity: 0, y: 8, scale: 0.985 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 6, scale: 0.985 }}
              transition={{ duration: 0.1 }}
              onClick={e => e.stopPropagation()}
              className="w-full max-w-xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-3xl overflow-hidden shadow-2xl"
            >
              <div className="p-4 border-b border-zinc-200 dark:border-zinc-800 flex items-center gap-3">
                <div className="flex-1 relative">
                  <Search className="absolute left-4 top-3.5 text-zinc-500" size={16} />
                  <input
                    autoFocus
                    value={modelSearch}
                    onChange={(e) => setModelSearch(e.target.value)}
                    placeholder="Search models (claude, gemini, llama, free...)"
                    className="input pl-10 py-2.5 text-sm"
                  />
                </div>
                <button onClick={() => { setIsModelPickerOpen(false); setModelSearch(''); }} className="btn-ghost h-10 w-10">
                  <X size={18} />
                </button>
              </div>

              <div className="max-h-[60vh] overflow-y-auto p-2">
                {isLoadingModels ? (
                  <div className="p-8 text-center text-sm text-zinc-500 dark:text-zinc-500">Loading models...</div>
                ) : filteredModels.length === 0 ? (
                  <div className="p-8 text-center text-sm text-zinc-500 dark:text-zinc-500">No models match your search.</div>
                ) : (
                  filteredModels.map(model => {
                    const isSelected = model.id === selectedModel;

                    return (
                      <div
                        key={model.id}
                        onClick={() => changeModel(model.id)}
                        className={`model-item ${isSelected ? 'selected' : ''}`}
                      >
                        <div className="min-w-0 pr-3">
                          <div className="font-mono text-sm font-medium truncate">{model.id}</div>
                          <div className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
                            {model.context_length.toLocaleString()} context
                          </div>
                        </div>
                        <div className="text-right shrink-0 text-xs">
                          <span className="px-2.5 py-px rounded-full bg-emerald-100 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 font-medium">FREE</span>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>

              <div className="p-3 text-[11px] border-t border-zinc-200 dark:border-zinc-800 text-zinc-500 text-center bg-zinc-50 dark:bg-zinc-950">
                Free models from OpenRouter • {models.length} available
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* SETTINGS MODAL */}
      <AnimatePresence>
        {isSettingsOpen && (
          <div className="modal" onClick={() => setIsSettingsOpen(false)}>
            <motion.div
              initial={{ opacity: 0, scale: 0.96, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: 6 }}
              onClick={e => e.stopPropagation()}
              className="modal-content"
            >
              <div className="p-6">
                <div className="flex items-center justify-between mb-5">
                  <div className="font-semibold text-lg tracking-tight">Settings</div>
                  <button onClick={() => setIsSettingsOpen(false)} className="text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"><X size={20} /></button>
                </div>

                <div className="space-y-5">
                  <div>
                    <label className="block text-xs uppercase tracking-[1px] mb-1.5 text-zinc-500 dark:text-zinc-400">OpenRouter API Key</label>
                    <input
                      type="password"
                      value={apiKey}
                      onChange={(e) => setApiKey(e.target.value)}
                      placeholder="sk-or-..."
                      className="input font-mono text-sm"
                      autoComplete="off"
                    />
                    <p className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-1.5">
                      Your key is stored only in your browser&apos;s localStorage. Never sent to any server except OpenRouter.
                    </p>
                  </div>

                  <div className="flex gap-2 pt-1">
                    <button 
                      onClick={() => saveApiKey(apiKey)} 
                      className="btn-primary flex-1"
                    >
                      Save Key
                    </button>
                    <button 
                      onClick={() => {
                        saveApiKey('');
                        setModels([]);
                      }} 
                      className="btn-secondary"
                    >
                      Clear
                    </button>
                  </div>

                  {models.length > 0 && (
                    <div className="pt-3 border-t border-zinc-200 dark:border-zinc-800 text-xs text-emerald-600 dark:text-emerald-400/80">
                      ✓ {models.length} models loaded and ready
                    </div>
                  )}
                </div>
              </div>

              <div className="bg-zinc-50 dark:bg-zinc-950 px-6 py-4 text-[11px] text-zinc-500 dark:text-zinc-400 border-t border-zinc-200 dark:border-zinc-800">
                Need a key? <a href="https://openrouter.ai/keys" target="_blank" rel="noopener noreferrer" className="underline hover:text-zinc-900 dark:hover:text-white">Create one for free</a>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
