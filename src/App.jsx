import React, { useEffect, useMemo, useRef, useState } from 'react';
import { openDB } from 'idb';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { MessageSquare, Plus, Search, Settings2, PanelLeftClose, PanelLeftOpen, Paperclip, ArrowUp, Sparkles, BriefcaseBusiness, FileText, Lightbulb, Code2, X, ChevronDown, ChevronUp, ChevronRight, MoreHorizontal, Copy, Check, Trash2, KeyRound, SlidersHorizontal, UserRound, Eye, EyeOff, Upload, SquarePen, GitBranch, RotateCcw, Menu, AlertCircle, LoaderCircle, Command, Globe2, ShieldCheck, Sun, Moon, Download, Image as ImageIcon, File, Mic, AudioLines, Archive, Pin, Maximize2, Play, ExternalLink, Monitor, Tablet, Smartphone, Bookmark, ArrowDown, Compass, ListOrdered } from 'lucide-react';

const DEFAULT_SETTINGS = { name: 'Ari', persona: 'You are Ari, a thoughtful, sharp and encouraging personal assistant. Be warm but never overly agreeable. Give clear, useful answers. If the user shares a resume or other documents, use them as the source of truth. Be honest about what you don’t know.', temperature: 0.7, systemPrompt: '', maxTokens: 2048, unlimitedOutput: false, theme: 'dark' };
const CHAT_KEY = 'forma.chats.v1'; const SET_KEY = 'forma.settings.v1'; const PROVIDER_KEY = 'forma.providers.v1';
const DEFAULT_PROVIDER = { id: 'provider-default', name: 'Qwen 3.8 Max (xkiro)', baseUrl: 'https://api.xkiro.com/v1', model: 'qwen/qwen3.8-max:free', models: [{ id: 'model-default', name: 'qwen/qwen3.8-max:free', enabled: true }], activeModelId: 'model-default', apiKey: 'sk-xt-e55f20a4f3fa8c9c4be36d39de81dd841531acbc599b1b84', extraHeaders: '', enabled: true };
const dbPromise = openDB('forma-local', 2, { upgrade(db) { if (!db.objectStoreNames.contains('chats')) db.createObjectStore('chats', { keyPath: 'id' }); if (!db.objectStoreNames.contains('library')) db.createObjectStore('library', { keyPath: 'id' }); } });
const starterPrompts = [
  { icon: BriefcaseBusiness, title: 'Explore your experience', text: 'What would you like to know about my background?' },
  { icon: FileText, title: 'Make sense of a document', text: 'Can you summarize a document I share with you?' },
  { icon: Lightbulb, title: 'Think something through', text: 'Help me think through a decision I’m making.' },
  { icon: Code2, title: 'Build something together', text: 'What can you help me create today?' },
];
const formatMessageTime = value => value ? new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' }).format(new Date(value)) : '';
const uid = () => crypto.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
const copyText = async text => {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return;
    }
  } catch {}
  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.setAttribute('readonly', '');
  textarea.style.cssText = 'position:fixed;left:-9999px;top:-9999px;opacity:0';
  document.body.appendChild(textarea);
  textarea.select();
  const copied = document.execCommand('copy');
  textarea.remove();
  window.getSelection?.()?.removeAllRanges?.();
  if (!copied) throw new Error('Clipboard access was unavailable');
};
const load = (key, fallback) => { try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback; } catch { return fallback; } };
const readPreferences = () => { const saved = load(SET_KEY, {}); const { baseUrl, model, apiKey, extraHeaders, ...preferences } = saved; return { ...DEFAULT_SETTINGS, ...preferences }; };
const providerLabel = url => url?.includes('xkiro.com') ? 'Qwen (xkiro)' : url?.includes('openrouter.ai') ? 'OpenRouter' : url?.includes('generativelanguage.googleapis.com') ? 'Gemini' : url?.includes('api.openai.com') ? 'OpenAI' : 'My provider';
const readProviderStore = () => {
  const saved = load(PROVIDER_KEY, null);
  const normalize = p => {
    const models = p.models?.length ? p.models.map(m => ({ enabled: true, ...m })) : (p.model ? [{ id: `${p.id}-model`, name: p.model, enabled: true }] : []);
    const selected = models.find(m => m.id === p.activeModelId && m.enabled !== false) || models.find(m => m.name === p.model && m.enabled !== false) || models.find(m => m.enabled !== false);
    const apiKey = p.apiKey || (p.baseUrl === DEFAULT_PROVIDER.baseUrl ? DEFAULT_PROVIDER.apiKey : '');
    return { enabled: true, ...p, apiKey, models, activeModelId: selected?.id || '', model: selected?.name || '' };
  };
  if (saved?.profiles?.length) {
    let profiles = saved.profiles.map(normalize);
    const active = profiles.find(p => p.id === saved.activeId);
    if (!active?.apiKey) {
      const hasWorking = profiles.some(p => p.apiKey && p.baseUrl);
      if (!hasWorking) {
        profiles = [DEFAULT_PROVIDER, ...profiles.filter(p => p.id !== DEFAULT_PROVIDER.id)];
        return { profiles, activeId: DEFAULT_PROVIDER.id };
      }
    }
    return { ...saved, profiles };
  }
  const legacy = load(SET_KEY, {});
  const model = legacy.model || DEFAULT_PROVIDER.model;
  const profile = { ...DEFAULT_PROVIDER, name: legacy.providerName || providerLabel(legacy.baseUrl), baseUrl: legacy.baseUrl || DEFAULT_PROVIDER.baseUrl, model, models: [{ id: `${DEFAULT_PROVIDER.id}-model`, name: model, enabled: true }], activeModelId: `${DEFAULT_PROVIDER.id}-model`, apiKey: legacy.apiKey || DEFAULT_PROVIDER.apiKey, extraHeaders: legacy.extraHeaders || '' };
  return { profiles: [profile], activeId: profile.id };
};
const newChat = () => ({ id: uid(), title: 'New conversation', messages: [], updatedAt: Date.now() });
const fileIcon = (type) => type?.startsWith('image/') ? ImageIcon : FileText;

export default function App() {
  const [chats, setChats] = useState([]); const [chatsLoaded, setChatsLoaded] = useState(false);
  const [library, setLibrary] = useState([]); const [libraryLoaded, setLibraryLoaded] = useState(false); const [libraryOpen, setLibraryOpen] = useState(false);
  const [settings, setSettings] = useState(readPreferences);
  const [providers, setProviders] = useState(() => readProviderStore().profiles);
  const [activeProviderId, setActiveProviderId] = useState(() => { const saved = readProviderStore(); return saved.profiles.some(p => p.id === saved.activeId) ? saved.activeId : (saved.profiles[0]?.id || DEFAULT_PROVIDER.id); });
  const [editingProviderId, setEditingProviderId] = useState(() => { const saved = readProviderStore(); return saved.profiles.some(p => p.id === saved.activeId) ? saved.activeId : (saved.profiles[0]?.id || DEFAULT_PROVIDER.id); });
  const [modelDraft, setModelDraft] = useState(''); const [modelEntryOpen, setModelEntryOpen] = useState(false); const [editingModelId, setEditingModelId] = useState('');
  const [activeId, setActiveId] = useState(null);
  const [chatMenuId, setChatMenuId] = useState(null); const [deleteChatId, setDeleteChatId] = useState(null); const [renamingChatId, setRenamingChatId] = useState(null); const [renameDraft, setRenameDraft] = useState(''); const [showArchived, setShowArchived] = useState(false);
  const [input, setInput] = useState(''); const [files, setFiles] = useState([]); const [busy, setBusy] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true); const [settingsOpen, setSettingsOpen] = useState(false); const [settingsTab, setSettingsTab] = useState('connection');
  const [query, setQuery] = useState(''); const [toast, setToast] = useState(''); const [menuOpen, setMenuOpen] = useState(false); const [keyVisible, setKeyVisible] = useState(false);
  const [moreMenu, setMoreMenu] = useState(false); const [mobileSidebar, setMobileSidebar] = useState(false);
  const [activeMarkerId, setActiveMarkerId] = useState(null);
  const [hoveredMarkerId, setHoveredMarkerId] = useState(null);
  const [showScrollBottom, setShowScrollBottom] = useState(false);
  const [outlineOpen, setOutlineOpen] = useState(false);
  const [outlineFilter, setOutlineFilter] = useState('all');
  const [inChatSearchOpen, setInChatSearchOpen] = useState(false);
  const [inChatSearchQuery, setInChatSearchQuery] = useState('');
  const [inChatSearchIndex, setInChatSearchIndex] = useState(0);
  const [prefersDark, setPrefersDark] = useState(() => window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? true);
  const scrollRef = useRef(null); const textareaRef = useRef(null); const fileRef = useRef(null); const libraryFileRef = useRef(null); const searchRef = useRef(null); const abortRef = useRef(null); const inChatSearchInputRef = useRef(null);
  const activeChat = chats.find(c => c.id === activeId);
  const activeLibrarySources = library.filter(source => activeChat?.librarySourceIds?.includes(source.id));
  const activeProvider = providers.find(p => p.id === activeProviderId) || providers[0] || DEFAULT_PROVIDER;
  const editingProvider = providers.find(p => p.id === editingProviderId) || activeProvider;
  const activeProviderConfigured = Boolean(activeProvider.enabled !== false && activeProvider.apiKey && activeProvider.baseUrl && activeProvider.model);
  const appTheme = settings.theme === 'system' ? (prefersDark ? 'dark' : 'light') : settings.theme;
  const userMessages = activeChat?.messages?.filter(m => m.role === 'user') || [];
  const shortcutLabel = /Mac/i.test(navigator.platform || '') ? '⌘ K' : 'Ctrl K';

  const matchingMessages = useMemo(() => {
    if (!inChatSearchQuery.trim() || !activeChat?.messages?.length) return [];
    const q = inChatSearchQuery.trim().toLowerCase();
    return activeChat.messages.filter(m => (m.content || '').toLowerCase().includes(q) || (m.attachments || []).some(a => (a.name || '').toLowerCase().includes(q)));
  }, [inChatSearchQuery, activeChat?.messages]);

  const jumpToSearchMatch = (direction) => {
    if (!matchingMessages.length) return;
    let nextIndex = inChatSearchIndex + direction;
    if (nextIndex >= matchingMessages.length) nextIndex = 0;
    if (nextIndex < 0) nextIndex = matchingMessages.length - 1;
    setInChatSearchIndex(nextIndex);
    jumpToMessage(matchingMessages[nextIndex].id);
  };

  useEffect(() => { (async () => { try { const db = await dbPromise; let saved = await db.getAll('chats'); if (!saved.length) { const legacy = load(CHAT_KEY, []); if (legacy.length) { const tx = db.transaction('chats', 'readwrite'); await Promise.all([...legacy.map(c => tx.store.put(c)), tx.done]); saved = legacy; } } saved.sort((a,b) => (b.updatedAt || 0) - (a.updatedAt || 0)); setChats(saved); setActiveId(saved.find(c => !c.archived)?.id || null); setLibrary((await db.getAll('library')).sort((a,b) => (b.createdAt || 0) - (a.createdAt || 0))); } catch (e) { console.error('Could not load local chats', e); } setChatsLoaded(true); setLibraryLoaded(true); })(); }, []);
  useEffect(() => { if (!chatsLoaded) return; const timer = window.setTimeout(async () => { try { const db = await dbPromise; const tx = db.transaction('chats', 'readwrite'); await tx.store.clear(); await Promise.all([...chats.map(c => tx.store.put(c)), tx.done]); } catch (e) { console.error('Could not save local chats', e); setToast('Could not save chat. Your browser storage may be full.'); } }, busy ? 350 : 0); return () => window.clearTimeout(timer); }, [chats, chatsLoaded, busy]);
  useEffect(() => { if (!libraryLoaded) return; const timer = window.setTimeout(async () => { try { const db = await dbPromise; const tx = db.transaction('library', 'readwrite'); await tx.store.clear(); await Promise.all([...library.map(source => tx.store.put(source)), tx.done]); } catch (e) { console.error('Could not save library', e); setToast('Could not save knowledge sources. Your browser storage may be full.'); } }, 0); return () => window.clearTimeout(timer); }, [library, libraryLoaded]);
  useEffect(() => localStorage.setItem(SET_KEY, JSON.stringify(settings)), [settings]);
  useEffect(() => localStorage.setItem(PROVIDER_KEY, JSON.stringify({ profiles: providers, activeId: activeProviderId })), [providers, activeProviderId]);
  useEffect(() => { if (scrollRef.current && !showScrollBottom) scrollRef.current.scrollTop = scrollRef.current.scrollHeight; }, [activeChat?.messages, busy]);
  useEffect(() => { setActiveMarkerId(userMessages.at(-1)?.id || null); }, [activeId, userMessages.length]);
  useEffect(() => { const media = window.matchMedia?.('(prefers-color-scheme: dark)'); if (!media) return; const update = e => setPrefersDark(e.matches); media.addEventListener?.('change', update); return () => media.removeEventListener?.('change', update); }, []);
  useEffect(() => { if (toast) { const t = setTimeout(() => setToast(''), 2600); return () => clearTimeout(t); } }, [toast]);
  useEffect(() => {
    const onShortcut = e => {
      const key = e.key.toLowerCase();
      if ((e.metaKey || e.ctrlKey) && key === 'k') {
        e.preventDefault();
        makeChat();
      } else if ((e.metaKey || e.ctrlKey) && key === 'f') {
        e.preventDefault();
        setInChatSearchOpen(v => {
          if (!v) setTimeout(() => inChatSearchInputRef.current?.focus(), 50);
          return !v;
        });
      } else if (key === '/' && !e.metaKey && !e.ctrlKey && !e.altKey && !['INPUT','TEXTAREA'].includes(document.activeElement?.tagName)) {
        e.preventDefault();
        searchRef.current?.focus();
      } else if (key === 'escape') {
        setSettingsOpen(false);
        setLibraryOpen(false);
        setMobileSidebar(false);
        setChatMenuId(null);
        setDeleteChatId(null);
        setInChatSearchOpen(false);
        setOutlineOpen(false);
        if (renamingChatId) setRenamingChatId(null);
      }
    };
    window.addEventListener('keydown', onShortcut);
    return () => window.removeEventListener('keydown', onShortcut);
  }, [renamingChatId]);
  useEffect(() => { if (!chatMenuId) return; const closeMenu = e => { if (!e.target.closest('.chat-row-menu-wrap')) setChatMenuId(null); }; document.addEventListener('pointerdown', closeMenu); return () => document.removeEventListener('pointerdown', closeMenu); }, [chatMenuId]);
  const patchSettings = (patch) => setSettings(s => ({ ...s, ...patch }));
  const patchProvider = (patch) => setProviders(list => list.map(p => p.id === editingProviderId ? { ...p, ...patch } : p));
  const addProvider = () => { const id = uid(); const profile = { id, name: `New provider ${providers.length + 1}`, baseUrl: '', model: '', models: [], activeModelId: '', apiKey: '', extraHeaders: '', enabled: true }; setProviders(list => [...list, profile]); setActiveProviderId(id); setEditingProviderId(id); setModelDraft(''); setModelEntryOpen(false); setEditingModelId(''); };
  const removeEditingProvider = () => { if (providers.length < 2) return; const next = providers.find(p => p.id !== editingProviderId && p.enabled !== false) || providers.find(p => p.id !== editingProviderId); setProviders(list => list.filter(p => p.id !== editingProviderId)); setEditingProviderId(next.id); if (activeProviderId === editingProviderId) setActiveProviderId(next.id); setToast('Provider removed'); };
  const toggleProvider = (id) => { const profile = providers.find(p => p.id === id); if (!profile) return; const enabling = profile.enabled === false; if (!enabling && providers.filter(p => p.enabled !== false).length <= 1) { setToast('Keep at least one provider enabled'); return; } setProviders(list => list.map(p => p.id === id ? { ...p, enabled: enabling } : p)); if (!enabling && activeProviderId === id) setActiveProviderId(providers.find(p => p.id !== id && p.enabled !== false)?.id || id); };
  const addModel = () => { const name = modelDraft.trim(); if (!name) return; const model = { id: uid(), name, enabled: true }; setProviders(list => list.map(p => p.id === editingProviderId ? { ...p, models: [...(p.models || []), model], model: name, activeModelId: model.id } : p)); setModelDraft(''); setModelEntryOpen(false); };
  const saveModelEdit = (modelId) => { const name = modelDraft.trim(); if (!name) return; setProviders(list => list.map(p => p.id === editingProviderId ? { ...p, models: p.models.map(m => m.id === modelId ? { ...m, name } : m), ...(p.activeModelId === modelId ? { model: name } : {}) } : p)); setEditingModelId(''); setModelDraft(''); };
  const selectProviderModel = (model) => { if (!model.enabled) return; setProviders(list => list.map(p => p.id === editingProviderId ? { ...p, model: model.name, activeModelId: model.id } : p)); };
  const toggleModel = (modelId) => { const current = editingProvider.models || []; const item = current.find(m => m.id === modelId); if (!item) return; const enabling = item.enabled === false; if (!enabling && current.filter(m => m.enabled !== false).length <= 1) { setToast('Keep at least one model enabled'); return; } const next = current.find(m => m.id !== modelId && m.enabled !== false); setProviders(list => list.map(p => { if (p.id !== editingProviderId) return p; const models = p.models.map(m => m.id === modelId ? { ...m, enabled: enabling } : m); const selected = p.activeModelId === modelId && !enabling ? next : null; return { ...p, models, ...(selected ? { model: selected.name, activeModelId: selected.id } : {}) }; })); };
  const removeModel = (modelId) => { const current = editingProvider.models || []; if (current.length <= 1) { setToast('Add another model before removing this one'); return; } const next = current.find(m => m.id !== modelId && m.enabled !== false); if (editingProvider.activeModelId === modelId && !next) { setToast('Enable another model before removing the selected one'); return; } setProviders(list => list.map(p => { if (p.id !== editingProviderId) return p; const models = p.models.filter(m => m.id !== modelId); const fallback = p.activeModelId === modelId ? next : null; return { ...p, models, ...(fallback ? { model: fallback.name, activeModelId: fallback.id } : {}) }; })); };
  const applyProviderPreset = (key) => { const presets = { openai: { name: 'OpenAI', baseUrl: 'https://api.openai.com/v1', model: 'gpt-4o-mini' }, openrouter: { name: 'OpenRouter', baseUrl: 'https://openrouter.ai/api/v1', model: 'openai/gpt-4o-mini' }, google: { name: 'Gemini', baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai', model: 'gemini-2.0-flash' } }; const preset = presets[key]; if (!preset) return; const models = editingProvider.models || []; const existing = models.find(m => m.name === preset.model); const model = existing ? { ...existing, enabled: true } : { id: uid(), name: preset.model, enabled: true }; const nextModels = existing ? models.map(m => m.id === existing.id ? model : m) : [...models, model]; setProviders(list => list.map(p => p.id === editingProviderId ? { ...p, name: preset.name, baseUrl: preset.baseUrl, model: preset.model, models: nextModels, activeModelId: model.id } : p)); };
  const makeChat = () => { const c = newChat(); setChats(prev => [c, ...prev]); setActiveId(c.id); setShowArchived(false); setInput(''); setFiles([]); setMobileSidebar(false); textareaRef.current?.focus(); };
  const removeChat = (id, e) => { e?.stopPropagation(); setChats(prev => prev.filter(c => c.id !== id)); if (activeId === id) setActiveId(chats.find(c => c.id !== id && !c.archived)?.id || null); setChatMenuId(null); setDeleteChatId(null); };
  const jumpToMessage = id => {
    setActiveMarkerId(id);
    const node = document.getElementById(`message-${id}`);
    if (node) {
      node.scrollIntoView({ behavior: 'smooth', block: 'center' });
      node.classList.remove('message-jump-highlight');
      void node.offsetWidth;
      node.classList.add('message-jump-highlight');
      setTimeout(() => node.classList.remove('message-jump-highlight'), 2200);
    }
  };
  const syncActiveMarker = () => {
    const pane = scrollRef.current;
    if (!pane) return;
    const distFromBottom = pane.scrollHeight - pane.scrollTop - pane.clientHeight;
    setShowScrollBottom(distFromBottom > 180);
    if (!userMessages.length) return;
    const threshold = pane.getBoundingClientRect().top + pane.clientHeight * 0.34;
    let current = userMessages[0];
    for (const message of userMessages) {
      const node = document.getElementById(`message-${message.id}`);
      if (node && node.getBoundingClientRect().top <= threshold) current = message;
    }
    setActiveMarkerId(current.id);
  };
  const scrollToBottom = () => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  };
  const toggleMessageBookmark = (messageId, e) => {
    e?.stopPropagation();
    updateChat(activeId, chat => ({
      ...chat,
      messages: chat.messages.map(m => m.id === messageId ? { ...m, bookmarked: !m.bookmarked } : m),
      updatedAt: Date.now()
    }));
    const wasBookmarked = activeChat?.messages.find(m => m.id === messageId)?.bookmarked;
    setToast(wasBookmarked ? 'Bookmark removed' : 'Turn bookmarked');
  };
  const updateChat = (id, fn) => setChats(prev => prev.map(c => c.id === id ? fn(c) : c));
  const startRenameChat = chat => { setRenameDraft(chat.title || ''); setRenamingChatId(chat.id); setChatMenuId(null); };
  const saveRenameChat = (id, e) => { e?.preventDefault(); const title = renameDraft.trim(); if (!title) { setToast('Chat title cannot be empty'); return; } updateChat(id, chat => ({ ...chat, title })); setRenamingChatId(null); };
  const toggleChatPin = id => { updateChat(id, chat => ({ ...chat, pinned: !chat.pinned })); setChatMenuId(null); };
  const toggleChatArchive = id => { const chat = chats.find(c => c.id === id); if (!chat) return; const archiving = !chat.archived; updateChat(id, current => ({ ...current, archived: archiving })); setChatMenuId(null); if (archiving && activeId === id) setActiveId(chats.find(c => c.id !== id && !c.archived)?.id || null); };
  const readFiles = async (list) => {
    const picked = Array.from(list || []);
    return Promise.all(picked.map(async f => {
      const image = f.type.startsWith('image/');
      const textType = f.type.startsWith('text/') || /\.(md|json|csv|js|jsx|ts|tsx|py|html|css|xml|yaml|yml|log|txt)$/i.test(f.name);
      let content = ''; let dataUrl = '';
      if (image) dataUrl = await new Promise((resolve, reject) => { const r = new FileReader(); r.onload = () => resolve(r.result); r.onerror = () => reject(r.error || new Error(`Could not read ${f.name}`)); r.onabort = () => reject(new Error(`Reading ${f.name} was interrupted`)); r.readAsDataURL(f); });
      else if (textType && f.size < 2_000_000) content = await f.text();
      else if (/\.pdf$/i.test(f.name) && f.size < 20_000_000) {
        try { const pdfjs = await import('pdfjs-dist'); pdfjs.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).toString(); const pdf = await pdfjs.getDocument({ data: await f.arrayBuffer() }).promise; const pages = []; for (let p = 1; p <= Math.min(pdf.numPages, 80); p++) { const page = await pdf.getPage(p); const text = await page.getTextContent(); pages.push(text.items.map(x => x.str).join(' ')); } content = pages.join('\n\n'); } catch { content = ''; }
      }
      else if (/\.docx$/i.test(f.name) && f.size < 20_000_000) { try { const mammoth = await import('mammoth/mammoth.browser'); const result = await mammoth.extractRawText({ arrayBuffer: await f.arrayBuffer() }); content = result.value || ''; } catch { content = ''; } }
      return { id: uid(), name: f.name, type: f.type || 'application/octet-stream', size: f.size, content, dataUrl, image };
    }));
  };
  const onFiles = async (list) => {
    const picked = Array.from(list || []);
    if (!picked.length) return;
    try {
      const parsed = await readFiles(picked);
      setFiles(prev => [...prev, ...parsed]);
      textareaRef.current?.focus();
    } catch (error) {
      console.error('Could not read attachments', error);
      setToast('Could not read one or more files. Try another file.');
    }
  };
  const onLibraryFiles = async (list) => {
    const picked = Array.from(list || []); if (!picked.length) return;
    try {
      const parsed = await readFiles(picked);
      setLibrary(prev => [...parsed.map(source => ({ ...source, createdAt: Date.now() })), ...prev]);
      setToast(`${parsed.length} source${parsed.length === 1 ? '' : 's'} added to your library`);
    } catch (error) {
      console.error('Could not add knowledge sources', error);
      setToast('Could not read one or more files. Try another file.');
    }
  };
  const toggleLibrarySource = (sourceId) => {
    if (!activeChat) { const chat = { ...newChat(), librarySourceIds: [sourceId] }; setChats(prev => [chat, ...prev]); setActiveId(chat.id); setShowArchived(false); return; }
    updateChat(activeChat.id, chat => { const ids = chat.librarySourceIds || []; return { ...chat, librarySourceIds: ids.includes(sourceId) ? ids.filter(id => id !== sourceId) : [...ids, sourceId] }; });
  };
  const removeLibrarySource = (sourceId) => {
    const source = library.find(item => item.id === sourceId); if (!source || !window.confirm(`Remove “${source.name}” from your Knowledge Library?`)) return;
    setLibrary(prev => prev.filter(item => item.id !== sourceId));
    setChats(prev => prev.map(chat => ({ ...chat, librarySourceIds: (chat.librarySourceIds || []).filter(id => id !== sourceId) })));
    setToast('Source removed from your library');
  };
  const send = async (override, overrideFiles, historyOverride, targetChat) => {
    const outgoingFiles = overrideFiles ?? files;
    const text = (override ?? input).trim(); if ((!text && !outgoingFiles.length) || busy) return;
    let chat = targetChat || activeChat;
    if (!chat) { chat = newChat(); setChats(prev => [chat, ...prev]); setActiveId(chat.id); }
    const attachments = outgoingFiles.map(({ id, name, type, size, content, dataUrl, image }) => ({ id, name, type, size, content, dataUrl, image }));
    const sourceAttachments = (chat.librarySourceIds || []).map(id => library.find(source => source.id === id)).filter(Boolean);
    const userMsg = { id: uid(), role: 'user', content: text, attachments, createdAt: Date.now() };
    const title = chat.messages.length ? chat.title : (text.slice(0, 40) || attachments[0]?.name || 'New conversation');
    updateChat(chat.id, c => ({ ...c, title, messages: [...c.messages, userMsg, { id: uid(), role: 'assistant', content: '', createdAt: Date.now(), streaming: true }], updatedAt: Date.now() }));
    setInput(''); setFiles([]); setBusy(true);
    const controller = new AbortController(); abortRef.current = controller;
    try {
      if (activeProvider?.enabled === false) throw new Error('Enable this provider in Model settings before using it.');
      if (!activeProvider?.baseUrl?.trim() || !activeProvider?.model?.trim()) throw new Error('Add a base URL and enabled model in Model settings for this provider.');
      if (!activeProvider?.apiKey?.trim()) throw new Error('Add an API key in Settings → Models for this provider.');
      const previous = historyOverride ?? chat.messages;
      const libraryInstruction = sourceAttachments.length ? `Use the selected Knowledge Library sources as context when they are relevant. Cite their filename in your answer when you draw on them, and say when the sources do not contain the answer.` : '';
      const system = [settings.persona, settings.systemPrompt, libraryInstruction].filter(Boolean).join('\n\n');
      const messages = [{ role: 'system', content: system }, ...previous.map(m => toApiMessage(m)), {
        role: 'user', content: toApiContent(text, [...sourceAttachments, ...attachments])
      }];
      const endpoint = `${activeProvider.baseUrl.replace(/\/+$/, '').replace(/\/chat\/completions$/, '')}/chat/completions`;
      let extraHeaders = {}; if (activeProvider.extraHeaders?.trim()) { try { extraHeaders = JSON.parse(activeProvider.extraHeaders); if (!extraHeaders || Array.isArray(extraHeaders) || typeof extraHeaders !== 'object') throw new Error(); } catch { throw new Error('Custom headers must be valid JSON, for example: {"HTTP-Referer":"https://your-site.com"}'); } }
      const payload = { model: activeProvider.model, messages, stream: true, temperature: Number(settings.temperature) };
      if (!settings.unlimitedOutput) payload.max_tokens = Number(settings.maxTokens);

      const requestHeaders = { 'Content-Type': 'application/json', Authorization: `Bearer ${activeProvider.apiKey}`, ...extraHeaders };
      let res;
      try {
        res = await fetch(endpoint, { method: 'POST', signal: controller.signal, headers: requestHeaders, body: JSON.stringify(payload) });
      } catch (directErr) {
        if (directErr.name === 'AbortError') throw directErr;
        // Direct browser fetch failed (e.g. provider CORS restriction on deployed domain). Seamlessly retry via /api/proxy
        try {
          res = await fetch('/api/proxy', {
            method: 'POST',
            signal: controller.signal,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ endpoint, headers: requestHeaders, body: payload })
          });
          if (res.status === 404 || res.status === 405) {
            throw new Error(`Direct connection was blocked by CORS (${directErr.message}), and /api/proxy is not available on this server.`);
          }
        } catch (proxyErr) {
          if (proxyErr.name === 'AbortError') throw proxyErr;
          throw new Error(
            `Connection error: Unable to reach ${activeProvider.name || activeProvider.baseUrl}. ` +
            `This happens when the API provider does not allow browser requests from deployed domains (CORS error). ` +
            `Ensure your serverless proxy (/api/proxy) is deployed, or use a CORS-enabled provider like OpenRouter or Gemini.`
          );
        }
      }

      if (!res.ok) { const body = await res.text(); let detail = body; try { detail = JSON.parse(body).error?.message || body; } catch {} throw new Error(`Provider error (${res.status}): ${detail.slice(0, 360)}`); }
      if (!res.body) throw new Error('This provider did not return a streaming response.');
      const reader = res.body.getReader(); const decoder = new TextDecoder(); let buffer = ''; let answer = '';
      while (true) {
        const { value, done } = await reader.read(); if (done) break;
        buffer += decoder.decode(value, { stream: true }); const lines = buffer.split('\n'); buffer = lines.pop() || '';
        for (const line of lines) { const l = line.trim(); if (!l.startsWith('data:')) continue; const data = l.slice(5).trim(); if (data === '[DONE]') continue;
          try { const event = JSON.parse(data); const delta = event.choices?.[0]?.delta?.content; if (typeof delta === 'string') { answer += delta; updateChat(chat.id, c => ({ ...c, messages: c.messages.map((m, i) => i === c.messages.length - 1 ? { ...m, content: answer } : m), updatedAt: Date.now() })); } else if (Array.isArray(delta)) { const d = delta.map(x => x.text || '').join(''); answer += d; updateChat(chat.id, c => ({ ...c, messages: c.messages.map((m, i) => i === c.messages.length - 1 ? { ...m, content: answer } : m), updatedAt: Date.now() })); } } catch {}
        }
      }
      updateChat(chat.id, c => ({ ...c, messages: c.messages.map((m, i) => i === c.messages.length - 1 ? { ...m, streaming: false, content: answer || 'I didn’t receive a text response. Please try again.' } : m), updatedAt: Date.now() }));
    } catch (err) {
      if (err.name !== 'AbortError') { updateChat(chat.id, c => ({ ...c, messages: c.messages.map((m, i) => i === c.messages.length - 1 ? { ...m, streaming: false, error: err.message, content: '' } : m), updatedAt: Date.now() })); }
      else updateChat(chat.id, c => ({ ...c, messages: c.messages.filter(m => !m.streaming), updatedAt: Date.now() }));
    } finally { setBusy(false); abortRef.current = null; }
  };
  const createBranch = (messages, title = activeChat?.title) => {
    const branch = { ...newChat(), title: `Branch — ${title || 'conversation'}`.slice(0, 60), messages, librarySourceIds: activeChat?.librarySourceIds || [], updatedAt: Date.now() };
    setChats(list => [branch, ...list]); setActiveId(branch.id); setMobileSidebar(false);
    return branch;
  };
  const editAndResend = (message, text) => {
    if (busy || !activeChat) return;
    const index = activeChat.messages.findIndex(m => m.id === message.id); if (index < 0) return;
    const history = activeChat.messages.slice(0, index).filter(m => !m.streaming);
    const branch = createBranch(history);
    send(text, message.attachments || [], history, branch);
  };
  const regenerateFrom = message => {
    if (busy || !activeChat) return;
    const index = activeChat.messages.findIndex(m => m.id === message.id); if (index < 0) return;
    const userIndex = activeChat.messages.slice(0, index).map(m => m.role).lastIndexOf('user'); if (userIndex < 0) return;
    const userMessage = activeChat.messages[userIndex]; const history = activeChat.messages.slice(0, userIndex).filter(m => !m.streaming);
    const branch = createBranch(history);
    send(userMessage.content || '', userMessage.attachments || [], history, branch);
  };
  const branchFromMessage = message => {
    if (busy || !activeChat) return;
    const index = activeChat.messages.findIndex(m => m.id === message.id); if (index < 0) return;
    if (message.role === 'user') {
      const history = activeChat.messages.slice(0, index).filter(m => !m.streaming); const branch = createBranch(history);
      send(message.content || '', message.attachments || [], history, branch);
    } else {
      createBranch(activeChat.messages.slice(0, index + 1).filter(m => !m.streaming));
    }
  };
  const toApiMessage = m => ({ role: m.role, content: toApiContent(m.content, m.role === 'user' ? (m.attachments || []) : []) });
  const toApiContent = (text, attachments) => {
    const blocks = []; if (text) blocks.push({ type: 'text', text });
    for (const f of attachments || []) {
      if (f.image && f.dataUrl) blocks.push({ type: 'image_url', image_url: { url: f.dataUrl } });
      else if (f.content) blocks.push({ type: 'text', text: `\n\n--- File: ${f.name} ---\n${f.content}\n--- End of file ---` });
      else blocks.push({ type: 'text', text: `\n[Attached file: ${f.name} (${formatSize(f.size)}). This file could not be read by the browser. Please ask me to use another supported file format.]` });
    }
    return blocks.length === 1 && blocks[0].type === 'text' ? blocks[0].text : blocks;
  };
  const formatSize = size => size < 1024 ? `${size} B` : size < 1048576 ? `${(size / 1024).toFixed(0)} KB` : `${(size / 1048576).toFixed(1)} MB`;
  const exportChats = () => { const blob = new Blob([JSON.stringify(chats, null, 2)], { type: 'application/json' }); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = `forma-chats-${new Date().toISOString().slice(0, 10)}.json`; document.body.appendChild(a); a.click(); a.remove(); window.setTimeout(() => URL.revokeObjectURL(url), 1000); setMoreMenu(false); };
  const handleKeyDown = e => { if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); send(); } };
  const searchTerm = query.trim().toLocaleLowerCase();
  const findMessageMatch = chat => searchTerm ? (chat.messages || []).find(m => [m.content, ...(m.attachments || []).flatMap(f => [f.name, f.content])].filter(Boolean).join('\n').toLocaleLowerCase().includes(searchTerm)) : null;
  const searchedChats = chats.filter(c => !searchTerm || (c.title || '').toLocaleLowerCase().includes(searchTerm) || findMessageMatch(c));
  const filtered = searchedChats.filter(c => Boolean(c.archived) === showArchived).sort((a,b) => (b.updatedAt || 0) - (a.updatedAt || 0));
  const pinnedChats = showArchived ? [] : filtered.filter(c => c.pinned);
  const regularChats = showArchived ? filtered : filtered.filter(c => !c.pinned);
  const groups = { ...(pinnedChats.length ? { Pinned: pinnedChats } : {}), ...(showArchived ? { Archived: regularChats } : { Today: [], 'Previous 7 days': [], Older: [] }) }; const today = new Date().setHours(0,0,0,0);
  if (!showArchived) regularChats.forEach(c => { const d = new Date(c.updatedAt || Date.now()).setHours(0,0,0,0); const day = (today - d) / 86400000; (day < 1 ? groups.Today : day < 7 ? groups['Previous 7 days'] : groups.Older).push(c); });
  const archivedCount = chats.filter(c => c.archived).length;

  return <div className="app-shell" data-theme={appTheme}>
    <aside className={`sidebar ${sidebarOpen ? 'sidebar-open' : 'sidebar-closed'} ${mobileSidebar ? 'mobile-visible' : ''}`}>
      <div className="sidebar-top">
        <a className="brand" href="#" onClick={e => e.preventDefault()}><span className="brand-mark"><MessageSquare size={15}/></span>{sidebarOpen && <span>forma<span className="brand-period">.</span></span>}</a>
        {mobileSidebar ? (
          <button className="icon-btn mobile-sidebar-close" aria-label="Close navigation" onClick={() => setMobileSidebar(false)}><X size={18}/></button>
        ) : (
          <button className="icon-btn collapse-btn" title={sidebarOpen ? 'Collapse sidebar' : 'Expand sidebar'} aria-label={sidebarOpen ? 'Collapse sidebar' : 'Expand sidebar'} aria-expanded={sidebarOpen} onClick={() => setSidebarOpen(open => !open)}>{sidebarOpen ? <PanelLeftClose size={18}/> : <PanelLeftOpen size={18}/>}</button>
        )}
      </div>
      <button className={`new-chat ${sidebarOpen ? '' : 'icon-new'}`} onClick={makeChat} title="New chat"><Plus size={17}/>{sidebarOpen && <><span>New chat</span><kbd>{shortcutLabel}</kbd></>}</button>
      {sidebarOpen && <><label className="search-field"><Search size={15}/><input ref={searchRef} placeholder={showArchived ? 'Search archived chats' : 'Search chats and messages'} value={query} onChange={e => setQuery(e.target.value)}/><kbd>/</kbd></label>
      <button className={`archive-view-button ${showArchived ? 'archive-view-active' : ''}`} onClick={() => { setShowArchived(value => !value); setChatMenuId(null); }}><Archive size={14}/><span>{showArchived ? 'All chats' : 'Archived'}</span>{!showArchived && archivedCount > 0 && <small>{archivedCount}</small>}</button>
      <div className="history-list">{Object.entries(groups).map(([heading, items]) => items.length > 0 && <section className="history-group" key={heading}><div className="history-heading">{heading}</div>{items.map(chat => { const match = findMessageMatch(chat); const excerpt = match ? [match.content, ...(match.attachments || []).map(f => f.name)].filter(Boolean).join(' ').replace(/\s+/g, ' ').slice(0, 82) : ''; const renaming = renamingChatId === chat.id; return <div className={`chat-row ${activeId === chat.id ? 'chat-row-active' : ''} ${match ? 'chat-row-has-match' : ''} ${chatMenuId === chat.id ? 'chat-row-menu-open' : ''}`} key={chat.id} onClick={() => { if (renaming) return; setActiveId(chat.id); setMobileSidebar(false); }}><MessageSquare size={15}/>{renaming ? <form className="chat-rename-form" onSubmit={e => saveRenameChat(chat.id,e)} onClick={e => e.stopPropagation()}><input autoFocus maxLength="100" value={renameDraft} onChange={e => setRenameDraft(e.target.value)} aria-label="Chat title"/><button type="submit" title="Save title"><Check size={13}/></button><button type="button" title="Cancel rename" onClick={() => setRenamingChatId(null)}><X size={13}/></button></form> : <span className="chat-row-copy"><span className="chat-title">{chat.pinned && <Pin size={11} className="chat-pin-indicator"/>}{chat.title}</span>{match && <span className="chat-match">{excerpt}{excerpt.length >= 82 ? '…' : ''}</span>}</span>}<div className="chat-row-menu-wrap" onClick={e => e.stopPropagation()}><button className="chat-menu-trigger" title="Chat options" aria-label={`Options for ${chat.title}`} aria-expanded={chatMenuId === chat.id} onClick={() => setChatMenuId(current => current === chat.id ? null : chat.id)}><MoreHorizontal size={16}/></button>{chatMenuId === chat.id && <div className="chat-context-menu"><button onClick={() => startRenameChat(chat)}><SquarePen size={14}/>Rename</button><button onClick={() => toggleChatPin(chat.id)}><Pin size={14}/>{chat.pinned ? 'Unpin chat' : 'Pin chat'}</button><button onClick={() => toggleChatArchive(chat.id)}><Archive size={14}/>{showArchived ? 'Restore chat' : 'Archive chat'}</button><div className="chat-menu-divider"/><button className="chat-context-danger" onClick={() => { setChatMenuId(null); setDeleteChatId(chat.id); }}><Trash2 size={14}/>Delete chat</button></div>}</div></div>; })}</section>)}{!filtered.length && <div className="empty-history">{query ? 'No matching chats or messages' : showArchived ? 'Archived chats will appear here.' : 'Your conversations will show up here.'}</div>}</div></>}
      <div className="sidebar-bottom"><div className="storage-card"><span className="storage-icon"><ShieldCheck size={15}/></span>{sidebarOpen && <span className="storage-label">Private by design<small>Saved on this device</small></span>}</div>
        <button className="profile-button" onClick={() => { setSettingsTab('persona'); setSettingsOpen(true); }}><span className="avatar">{(settings.name || 'A')[0].toUpperCase()}</span>{sidebarOpen && <span className="profile-label">{settings.name || 'Your assistant'}<small>Personal workspace</small></span>}<MoreHorizontal className="profile-more" size={18}/></button>
      </div>
    </aside>
    {mobileSidebar && <button className="mobile-scrim" onClick={() => setMobileSidebar(false)} aria-label="Close navigation"/>}
    <main className="main-pane">
      <header className="topbar">
        <div className="top-left">
          <button className="icon-btn mobile-menu" aria-label="Open navigation" aria-expanded={mobileSidebar} onClick={() => { setSidebarOpen(true); setMobileSidebar(true); }}><Menu size={19}/></button>
          <div className="model-switch provider-switch">
            <select aria-label="Active provider" value={activeProvider.id} onChange={e => { setActiveProviderId(e.target.value); setEditingProviderId(e.target.value); }}>
              <optgroup label="Providers">{providers.filter(p => p.enabled !== false).map(p => <option key={p.id} value={p.id}>{p.name} · {p.model || 'Choose a model'}</option>)}</optgroup>
            </select>
            <ChevronDown size={14}/>
          </div>
          <span className="provider-status"><span className={`status-dot ${activeProviderConfigured ? 'status-on' : ''}`}></span>{activeProviderConfigured ? 'Configured' : 'Setup provider'}</span>
        </div>
        <div className="top-actions">
          {activeChat?.messages?.length > 0 && (
            <>
              <button
                className={`icon-btn outline-topbar-btn ${outlineOpen ? 'icon-btn-active' : ''}`}
                title={outlineOpen ? 'Hide outline' : 'Conversation outline'}
                aria-label="Conversation outline"
                onClick={() => setOutlineOpen(v => !v)}
              >
                <Compass size={17} />
              </button>
              <button
                className={`icon-btn inchat-search-toggle ${inChatSearchOpen ? 'icon-btn-active' : ''}`}
                title="Search in conversation (Ctrl+F)"
                aria-label="Search in conversation"
                onClick={() => {
                  setInChatSearchOpen(v => {
                    if (!v) setTimeout(() => inChatSearchInputRef.current?.focus(), 50);
                    return !v;
                  });
                }}
              >
                <Search size={17}/>
              </button>
            </>
          )}
          <button className="icon-btn knowledge-trigger" title="Knowledge Library" onClick={() => setLibraryOpen(true)}><FileText size={17}/></button>
          <button className="icon-btn top-export" title="Export chats" onClick={exportChats}><Download size={17}/></button>
          <button className="icon-btn settings-trigger" onClick={() => { setEditingProviderId(activeProviderId); setSettingsTab('connection'); setSettingsOpen(true); }} title="Model settings"><Settings2 size={18}/></button>
        </div>
      </header>

      {inChatSearchOpen && (
        <div className="inchat-search-bar" role="search">
          <Search size={15} className="inchat-search-icon" />
          <input
            ref={inChatSearchInputRef}
            autoFocus
            placeholder="Search in this chat…"
            value={inChatSearchQuery}
            onChange={e => { setInChatSearchQuery(e.target.value); setInChatSearchIndex(0); }}
            onKeyDown={e => {
              if (e.key === 'Enter') {
                e.preventDefault();
                jumpToSearchMatch(e.shiftKey ? -1 : 1);
              } else if (e.key === 'Escape') {
                setInChatSearchOpen(false);
              }
            }}
          />
          <span className="inchat-search-count">
            {inChatSearchQuery.trim()
              ? matchingMessages.length
                ? `${inChatSearchIndex + 1} of ${matchingMessages.length}`
                : 'No matches'
              : 'Type to find'}
          </span>
          <button
            className="icon-btn mini"
            title="Previous match (Shift+Enter)"
            disabled={matchingMessages.length <= 1}
            onClick={() => jumpToSearchMatch(-1)}
          >
            <ChevronUp size={14} />
          </button>
          <button
            className="icon-btn mini"
            title="Next match (Enter)"
            disabled={matchingMessages.length <= 1}
            onClick={() => jumpToSearchMatch(1)}
          >
            <ChevronDown size={14} />
          </button>
          <button
            className="icon-btn mini"
            title="Close search"
            onClick={() => setInChatSearchOpen(false)}
          >
            <X size={14} />
          </button>
        </div>
      )}

      <div className="conversation-layout">
        <div className={`conversation ${activeChat?.messages?.length ? 'conversation-active' : ''}`} ref={scrollRef} onScroll={syncActiveMarker}>
          {!activeChat?.messages?.length ? (
            <div className="welcome-wrap">
              <div className="welcome-content">
                <h1>What can I help with?</h1>
                <p className="welcome-desc">Ask a question, or add a file to get started.</p>
                <div className="prompt-grid">
                  {starterPrompts.map(({icon: Icon,title,text}) => (
                    <button className="prompt-card" key={title} onClick={() => { setInput(text); textareaRef.current?.focus(); }}>
                      <span className="prompt-icon"><Icon size={17}/></span>
                      <span className="prompt-title">{title}</span>
                      <span className="prompt-text">{text}</span>
                      <ArrowUp className="prompt-arrow" size={14}/>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <div className="messages-wrap">
              {activeChat.messages.map((m, i) => (
                <Message
                  key={m.id}
                  message={m}
                  assistantName={settings.name || 'Assistant'}
                  isLast={i === activeChat.messages.length - 1}
                  busy={busy}
                  onEditSubmit={editAndResend}
                  onBranch={branchFromMessage}
                  onRegenerate={regenerateFrom}
                  onToggleBookmark={() => toggleMessageBookmark(m.id)}
                  onRetry={() => {
                    const lastUserIndex = activeChat.messages.map(x => x.role).lastIndexOf('user');
                    if (lastUserIndex < 0) return;
                    const lastUser = activeChat.messages[lastUserIndex];
                    const history = activeChat.messages.slice(0, lastUserIndex);
                    updateChat(activeId, c => ({ ...c, messages: history }));
                    send(lastUser.content || '', lastUser.attachments || [], history);
                  }}
                />
              ))}
            </div>
          )}
        </div>

        {/* Floating scroll to bottom button */}
        {showScrollBottom && (
          <button
            className={`inchat-scroll-bottom ${busy ? 'inchat-scroll-bottom-busy' : ''}`}
            onClick={scrollToBottom}
            title="Scroll to latest message"
            aria-label="Scroll to bottom"
          >
            <ArrowDown size={16} />
            {busy && <span className="inchat-scroll-pulse" />}
          </button>
        )}

        {/* In-Chat Outline Panel (ChatGPT-style Table of Contents) */}
        {outlineOpen && userMessages.length > 0 && (
          <>
            <div className="inchat-outline-backdrop" onClick={() => setOutlineOpen(false)} aria-label="Close outline" />
            <aside className="inchat-outline-panel" aria-label="Conversation outline">
              <div className="inchat-outline-head">
                <div className="inchat-outline-title">
                  <Compass size={15} />
                  <span>Outline</span>
                  <small>{userMessages.length}</small>
                </div>
                <button className="icon-btn mini" onClick={() => setOutlineOpen(false)} title="Close outline">
                  <X size={14} />
                </button>
              </div>
              <div className="inchat-outline-filter">
                <button
                  className={outlineFilter === 'all' ? 'active' : ''}
                  onClick={() => setOutlineFilter('all')}
                >
                  All turns ({userMessages.length})
                </button>
                <button
                  className={outlineFilter === 'bookmarked' ? 'active' : ''}
                  onClick={() => setOutlineFilter('bookmarked')}
                >
                  Saved ({userMessages.filter(m => m.bookmarked).length})
                </button>
              </div>
              <div className="inchat-outline-list">
                {userMessages
                  .filter(m => outlineFilter === 'all' || m.bookmarked)
                  .map((m) => {
                    const actualIndex = userMessages.indexOf(m);
                    const question = (m.content || m.attachments?.map(f => f.name).join(', ') || 'File attachment').trim();
                    const isActive = activeMarkerId === m.id;
                    return (
                      <div
                        key={m.id}
                        className={`inchat-outline-item ${isActive ? 'inchat-outline-active' : ''}`}
                        onClick={() => {
                          jumpToMessage(m.id);
                          if (window.innerWidth <= 768) setOutlineOpen(false);
                        }}
                      >
                      <span className="inchat-outline-num">#{actualIndex + 1}</span>
                      <span className="inchat-outline-text" title={question}>{question}</span>
                      <button
                        className={`inchat-outline-bm ${m.bookmarked ? 'is-bookmarked' : ''}`}
                        title={m.bookmarked ? 'Remove bookmark' : 'Bookmark turn'}
                        onClick={(e) => toggleMessageBookmark(m.id, e)}
                      >
                        <Bookmark size={13} fill={m.bookmarked ? 'currentColor' : 'none'} />
                      </button>
                    </div>
                  );
                })}
              {outlineFilter === 'bookmarked' && userMessages.filter(m => m.bookmarked).length === 0 && (
                <div className="inchat-outline-empty">No bookmarked turns yet. Click the bookmark icon on any message to save it here.</div>
              )}
            </div>
          </aside>
        </>
      )}

        {/* The Polished Timeline Scrubber & Hover Card matching Image 1 & Image 2 */}
        {userMessages.length > 0 && (
          <div className="message-nav-wrapper">
            <button
              className={`message-nav-outline-toggle ${outlineOpen ? 'active' : ''}`}
              onClick={() => setOutlineOpen(v => !v)}
              title={outlineOpen ? 'Hide outline' : 'Show conversation outline'}
              aria-label="Conversation outline"
            >
              <Compass size={14} />
            </button>

            <nav
              className="message-nav-rail"
              aria-label="Jump to a message in this chat"
              style={{
                height: `clamp(110px, calc(${userMessages.length} * 38px + 30px), min(55vh, 440px))`
              }}
            >
              <div className="message-nav-track-line" />
              {userMessages.map((m, index) => {
                const messageIndex = activeChat.messages.indexOf(m);
                const answer = activeChat.messages.slice(messageIndex + 1).find(x => x.role === 'assistant');
                const question = (m.content || m.attachments?.map(f => f.name).join(', ') || 'File attachment').trim();
                const preview = answer?.content
                  ? answer.content.slice(0, 240)
                  : (answer?.error ? 'Response error' : answer?.streaming ? 'Generating response…' : 'No response yet');
                const isBookmarked = Boolean(m.bookmarked);
                const hasFiles = Boolean(m.attachments?.length);
                const isActive = activeMarkerId === m.id;

                return (
                  <div
                    className={`message-nav-item ${isActive ? 'message-nav-item-active' : ''} ${isBookmarked ? 'message-nav-item-bookmarked' : ''} ${hoveredMarkerId === m.id ? 'message-nav-item-hovered' : ''}`}
                    key={m.id}
                    style={{ top: `${((index + 0.5) / userMessages.length) * 100}%` }}
                    onMouseEnter={() => setHoveredMarkerId(m.id)}
                    onMouseLeave={() => setHoveredMarkerId(null)}
                  >
                    <button
                      className="message-nav-marker-btn"
                      aria-label={`Jump to turn ${index + 1}: ${question.slice(0, 40)}`}
                      onClick={() => jumpToMessage(m.id)}
                      onMouseEnter={() => setHoveredMarkerId(m.id)}
                      onFocus={() => setHoveredMarkerId(m.id)}
                      onBlur={() => setHoveredMarkerId(null)}
                    >
                      <span className="message-nav-tick-bar" />
                    </button>

                    {/* Popover card matching Image 1 */}
                    <div
                      className="message-nav-card"
                      onClick={() => jumpToMessage(m.id)}
                      onMouseEnter={() => setHoveredMarkerId(m.id)}
                      onMouseLeave={() => setHoveredMarkerId(null)}
                    >
                      {hasFiles && (
                        <div className="message-nav-card-filetag">
                          <Paperclip size={11} />
                          <span>{m.attachments.map(f => f.name).join(', ')}</span>
                        </div>
                      )}
                      <div className="message-nav-card-head">
                        <div className="message-nav-card-title-group">
                          <span className="message-nav-card-turn">Turn {index + 1}</span>
                          <h4 className="message-nav-card-title" title={question}>{question}</h4>
                        </div>
                        <button
                          className={`message-nav-card-bookmark ${isBookmarked ? 'is-bookmarked' : ''}`}
                          title={isBookmarked ? 'Remove bookmark' : 'Bookmark this turn'}
                          aria-label={isBookmarked ? 'Remove bookmark' : 'Bookmark this turn'}
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleMessageBookmark(m.id, e);
                          }}
                        >
                          <Bookmark size={14} fill={isBookmarked ? 'currentColor' : 'none'} />
                        </button>
                      </div>

                      <p className="message-nav-card-body">
                        {preview}
                      </p>

                      <div className="message-nav-card-foot">
                        <span className="message-nav-card-meta">
                          {answer?.streaming ? (
                            <span className="meta-streaming"><LoaderCircle size={11} className="spin" /> Generating…</span>
                          ) : answer?.error ? (
                            <span className="meta-error"><AlertCircle size={11} /> Error</span>
                          ) : (
                            formatMessageTime(m.createdAt) || `Turn ${index + 1}`
                          )}
                        </span>
                        <span className="message-nav-card-jump">
                          Jump to turn <ChevronRight size={12} />
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </nav>
          </div>
        )}
      </div>
      <div className="composer-area"><div className="composer-wrap"><div className="file-previews">{files.map(f => { const Icon = fileIcon(f.type); return <div className="file-chip" key={f.id}>{f.image && f.dataUrl ? <img src={f.dataUrl} alt=""/> : <span className="file-chip-icon"><Icon size={15}/></span>}<span className="file-chip-text"><b>{f.name}</b><small>{formatSize(f.size)}</small></span><button onClick={() => setFiles(v => v.filter(x => x.id !== f.id))}><X size={13}/></button></div>; })}</div>
        <div className="composer"><textarea ref={textareaRef} rows="1" placeholder={activeChat?.messages?.length ? 'Message Ari…' : 'Ask anything, or start with a file…'} value={input} onChange={e => { setInput(e.target.value); e.target.style.height = 'auto'; e.target.style.height = `${Math.min(e.target.scrollHeight, 180)}px`; }} onKeyDown={handleKeyDown}/><div className="composer-toolbar"><div className="composer-tools"><button className="tool-btn attach-btn" onClick={() => fileRef.current?.click()} title="Attach files"><Paperclip size={17}/><span>Attach</span></button><input ref={fileRef} type="file" multiple hidden onChange={e => { onFiles(e.target.files); e.target.value = ''; }}/><button className={`tool-btn library-chip ${activeLibrarySources.length ? 'library-chip-active' : ''}`} onClick={() => setLibraryOpen(true)} title="Choose knowledge sources"><FileText size={15}/><span>Sources{activeLibrarySources.length ? ` · ${activeLibrarySources.length}` : ''}</span></button><span className="tool-separator"/><button className="tool-btn persona-chip" onClick={() => { setSettingsTab('persona'); setSettingsOpen(true); }}><UserRound size={14}/><span>{settings.name || 'Ari'} <span className="persona-live">·</span> persona</span></button></div><div className="send-group"><span className="send-hint">Shift + Enter for a new line</span><button className={`send-btn ${busy ? 'send-stop' : ''}`} title={busy ? 'Stop response' : 'Send message'} onClick={() => busy ? abortRef.current?.abort() : send()} disabled={!busy && !input.trim() && !files.length}>{busy ? <span className="stop-square"/> : <ArrowUp size={17}/>}</button></div></div></div><div className="composer-caption">Your conversations stay on this device. Your API key is stored locally in your browser.</div></div></div>
    </main>
    {libraryOpen && <div className="modal-backdrop library-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) setLibraryOpen(false); }}><section className="library-modal" role="dialog" aria-modal="true" aria-labelledby="library-title"><header className="library-head"><div><div className="modal-kicker">LOCAL KNOWLEDGE</div><h2 id="library-title">Knowledge Library</h2><p>Upload once, then choose the sources this chat can use.</p></div><button className="icon-btn" aria-label="Close Knowledge Library" onClick={() => setLibraryOpen(false)}><X size={19}/></button></header><div className="library-content"><div className="library-upload-card"><div className="library-upload-icon"><FileText size={18}/></div><div><b>Add reference files</b><small>PDF, DOCX, text, code, CSV, and images stay in this browser.</small></div><button className="library-upload-button" onClick={() => libraryFileRef.current?.click()}><Upload size={15}/>Add files</button><input ref={libraryFileRef} type="file" multiple hidden onChange={e => { onLibraryFiles(e.target.files); e.target.value = ''; }}/></div><div className="library-list-heading"><span>Your sources</span><small>{library.length} saved</small></div>{library.length ? <div className="library-source-list">{library.map(source => { const selected = activeChat?.librarySourceIds?.includes(source.id); const Icon = fileIcon(source.type); return <div className={`library-source-row ${selected ? 'library-source-selected' : ''}`} key={source.id}><button className="library-source-select" onClick={() => toggleLibrarySource(source.id)} aria-pressed={selected}><span className="library-source-check">{selected && <Check size={12}/>}</span><span className="library-source-icon"><Icon size={16}/></span><span className="library-source-copy"><b title={source.name}>{source.name}</b><small>{formatSize(source.size)} · {source.content ? 'Text ready' : source.image ? 'Visual source' : 'File attached'}</small></span></button><button className="library-source-remove" title={`Remove ${source.name}`} aria-label={`Remove ${source.name}`} onClick={() => removeLibrarySource(source.id)}><Trash2 size={15}/></button></div>; })}</div> : <div className="library-empty"><FileText size={20}/><b>Your library is empty</b><span>Add a resume, project brief, or reference document to reuse it across chats.</span></div>}<p className="library-note"><ShieldCheck size={14}/> Selected sources are sent with each new request in this chat. Your library stays on this device.</p></div><footer className="library-footer"><span>{activeLibrarySources.length ? `${activeLibrarySources.length} source${activeLibrarySources.length === 1 ? '' : 's'} active for this chat` : 'No sources selected for this chat'}</span><button className="done-btn" onClick={() => setLibraryOpen(false)}>Done</button></footer></section></div>}
    {settingsOpen && <div className="modal-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) setSettingsOpen(false); }}><div className={`settings-modal ${settingsTab === 'connection' ? 'model-settings-modal' : ''}`}><div className="modal-head"><div><div className="modal-kicker">{settingsTab === 'connection' ? 'MODEL SETTINGS' : 'PREFERENCES'}</div><h2>{settingsTab === 'connection' ? 'Model settings' : 'Settings'}</h2></div><button className="icon-btn" onClick={() => setSettingsOpen(false)}><X size={19}/></button></div><div className="settings-layout"><nav className="settings-nav"><button className={settingsTab==='connection'?'nav-active':''} onClick={() => setSettingsTab('connection')}><KeyRound size={16}/> Models</button><button className={settingsTab==='persona'?'nav-active':''} onClick={() => setSettingsTab('persona')}><UserRound size={16}/> Persona</button><button className={settingsTab==='preferences'?'nav-active':''} onClick={() => setSettingsTab('preferences')}><SlidersHorizontal size={16}/> Preferences</button></nav><div className="settings-content">
          {settingsTab==='connection' && <div className="provider-manager-layout">
            <aside className="provider-list-panel"><div className="provider-list-caption">Providers</div>{providers.map(p => <button key={p.id} className={`provider-list-item ${p.id === editingProviderId ? 'provider-list-selected' : ''} ${p.enabled === false ? 'provider-list-disabled' : ''}`} onClick={() => { setEditingProviderId(p.id); setModelEntryOpen(false); setEditingModelId(''); }}><span className="provider-list-icon"><Globe2 size={15}/></span><span className="provider-list-copy"><b>{p.name || 'Unnamed provider'}</b><small>{p.id === activeProviderId ? 'Active · ' : ''}{p.model || p.baseUrl || 'Needs setup'}</small></span><span className={`provider-list-dot ${p.enabled === false ? 'dot-disabled' : p.apiKey && p.baseUrl && p.model ? 'dot-ready' : 'dot-incomplete'}`}/></button>)}<button className="provider-add-button" onClick={addProvider}><Plus size={16}/> Add provider</button></aside>
            <section className="provider-detail-panel"><div className="provider-detail-scroll"><div className="provider-detail-header"><div className="provider-detail-title"><span className="provider-detail-icon"><Globe2 size={17}/></span><input className="provider-title-input" aria-label="Provider name" maxLength="40" value={editingProvider.name || ''} onChange={e => patchProvider({ name:e.target.value })} placeholder="Provider name"/></div><div className="provider-detail-actions"><button type="button" className={`provider-activate-button ${editingProvider.id === activeProviderId ? 'provider-activate-current' : ''}`} onClick={() => { setActiveProviderId(editingProviderId); setToast(`Switched active provider to ${editingProvider.name || 'selected provider'}`); }} title={editingProvider.id === activeProviderId ? 'Currently active provider' : 'Make this the active provider'}>{editingProvider.id === activeProviderId ? 'Active' : 'Set active'}</button><button className={`provider-state-toggle ${editingProvider.enabled === false ? '' : 'toggle-on'}`} role="switch" aria-checked={editingProvider.enabled !== false} aria-label="Enable provider" onClick={() => toggleProvider(editingProviderId)}><span/></button>{providers.length > 1 && <button className="icon-btn provider-delete-button" title="Remove provider" onClick={removeEditingProvider}><Trash2 size={16}/></button>}</div></div>
              <label className="form-label">Provider preset</label><select className="form-input" value={editingProvider.baseUrl === 'https://api.openai.com/v1' ? 'openai' : editingProvider.baseUrl === 'https://openrouter.ai/api/v1' ? 'openrouter' : editingProvider.baseUrl === 'https://generativelanguage.googleapis.com/v1beta/openai' ? 'google' : 'custom'} onChange={e => applyProviderPreset(e.target.value)}><option value="custom">Custom OpenAI-compatible</option><option value="openai">OpenAI</option><option value="openrouter">OpenRouter</option><option value="google">Google Gemini</option></select>
              <label className="form-label">Base URL</label><input className="form-input" placeholder="https://api.example.com/v1" value={editingProvider.baseUrl || ''} onChange={e => patchProvider({ baseUrl:e.target.value })}/>
              <label className="form-label">API key</label><div className="input-with-action"><KeyRound size={15}/><input className="form-input" type={keyVisible?'text':'password'} placeholder="Paste your secret key" value={editingProvider.apiKey || ''} onChange={e => patchProvider({ apiKey:e.target.value })}/><button onClick={() => setKeyVisible(!keyVisible)}>{keyVisible?<EyeOff size={16}/>:<Eye size={16}/>}</button></div>
              <div className="model-list-heading"><span>Model list</span><button className="model-add-button" onClick={() => { setModelEntryOpen(v => !v); setEditingModelId(''); setModelDraft(''); }}><Plus size={15}/> Add model</button></div>
              {modelEntryOpen && <div className="model-entry-row"><input className="form-input" autoFocus value={modelDraft} onChange={e => setModelDraft(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') addModel(); }} placeholder="Enter a model ID, e.g. gpt-4o-mini"/><button className="model-save-button" onClick={addModel} disabled={!modelDraft.trim()}>Add</button></div>}
              {(editingProvider.models || []).length ? <div className="model-list">{editingProvider.models.map(model => <div className={`model-list-row ${model.id === editingProvider.activeModelId ? 'model-row-selected' : ''} ${model.enabled === false ? 'model-row-disabled' : ''}`} key={model.id}>{editingModelId === model.id ? <div className="model-inline-edit"><input className="form-input" autoFocus value={modelDraft} onChange={e => setModelDraft(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') saveModelEdit(model.id); if (e.key === 'Escape') setEditingModelId(''); }}/><button className="model-save-button" onClick={() => saveModelEdit(model.id)} disabled={!modelDraft.trim()}>Save</button></div> : <><button className="model-list-select" onClick={() => selectProviderModel(model)} disabled={model.enabled === false}><span className="model-radio">{model.id === editingProvider.activeModelId && <i/>}</span><span>{model.name}</span>{model.id === editingProvider.activeModelId && <small>Selected</small>}</button><button className="icon-btn model-edit-button" title="Edit model ID" onClick={() => { setEditingModelId(model.id); setModelDraft(model.name); setModelEntryOpen(false); }}><SquarePen size={14}/></button></>}<label className="model-enable-label" title={model.enabled === false ? 'Enable model' : 'Disable model'}><input type="checkbox" checked={model.enabled !== false} onChange={() => toggleModel(model.id)}/><span className="mini-toggle-track"/></label>{(editingProvider.models || []).length > 1 && <button className="icon-btn model-delete-button" title="Remove model" onClick={() => { removeModel(model.id); setEditingModelId(''); }}><X size={14}/></button>}</div>)}</div> : <div className="model-empty">Add a model ID from your provider to use this connection.</div>}
              <details className="provider-advanced"><summary>Advanced connection settings</summary><label className="form-label">Additional headers <span className="optional-label">JSON · OPTIONAL</span></label><textarea className="form-input header-textarea" value={editingProvider.extraHeaders || ''} onChange={e => patchProvider({ extraHeaders:e.target.value })} placeholder={'{"HTTP-Referer":"https://your-site.com"}'}/></details>
              <p className="settings-note"><AlertCircle size={14}/> This app supports OpenAI chat-completions compatible endpoints. The provider must allow browser requests (CORS).</p>
            </div></section>
          </div>}
          {settingsTab==='persona' && <><div className="section-title">Your assistant’s personality</div><p className="section-copy">Give your assistant a name, a point of view, and a little context about how to help.</p><label className="form-label">Assistant name</label><input className="form-input" maxLength="32" placeholder="Ari" value={settings.name} onChange={e => patchSettings({ name:e.target.value })}/><label className="form-label">Persona instructions</label><textarea className="form-input persona-textarea" value={settings.persona} onChange={e => patchSettings({ persona:e.target.value })} placeholder="Describe how your assistant should sound and behave…"/><div className="hint-block"><Sparkles size={15}/><span>Try: “You’re a friendly career coach who gives candid feedback and helps me prepare for interviews.”</span></div><label className="form-label">Extra context or instructions <span className="optional-label">OPTIONAL</span></label><textarea className="form-input persona-textarea short-area" value={settings.systemPrompt} onChange={e => patchSettings({ systemPrompt:e.target.value })} placeholder="Add extra background, preferences, or instructions…"/><p className="settings-note"><ShieldCheck size={14}/> Your instructions are stored locally and included in requests to your provider.</p></>}
          {settingsTab==='preferences' && <><div className="section-title">Appearance</div><p className="section-copy">Choose how Forma looks on this device.</p><label className="form-label">Theme</label><select className="form-input theme-select" value={settings.theme || 'dark'} onChange={e => patchSettings({ theme:e.target.value })}><option value="dark">Dark</option><option value="light">Light</option><option value="system">Use system setting</option></select><div className="settings-divider"/><div className="section-title">Response preferences</div><p className="section-copy">Control response length and creativity.</p><label className="range-label form-label">Temperature <span>{settings.temperature}</span></label><input className="range-input" type="range" min="0" max="2" step="0.1" value={settings.temperature} onChange={e => patchSettings({ temperature:e.target.value })}/><div className="range-hints"><span>Focused</span><span>Creative</span></div><label className="output-cap-toggle"><span><b>No app-set output limit</b><small>Omit the token limit from requests. Your provider may still enforce its own maximum.</small></span><input type="checkbox" checked={Boolean(settings.unlimitedOutput)} onChange={e => patchSettings({ unlimitedOutput:e.target.checked })}/></label>{!settings.unlimitedOutput && <><label className="form-label">Maximum response tokens</label><input className="form-input" type="number" min="128" max="32768" step="128" value={settings.maxTokens} onChange={e => patchSettings({ maxTokens:e.target.value })}/></>}<div className="settings-divider"/><div className="section-title small-title">Your data</div><p className="section-copy">Chats and settings are saved only in this browser. Export a backup or clear your conversation history.</p><div className="data-actions"><button className="secondary-action" onClick={exportChats}><Download size={15}/> Export chats</button><button className="danger-action" onClick={() => { if (confirm('Delete every saved conversation? This cannot be undone.')) { setChats([]); setActiveId(null); } }}><Trash2 size={15}/> Clear chat history</button></div><button className="danger-action clear-key" onClick={() => { setProviders(list => list.map(p => p.id === activeProviderId ? { ...p, apiKey: '' } : p)); setToast('Active provider API key cleared'); }}>Clear active provider API key</button></>}
        </div></div><footer className="modal-footer"><span><ShieldCheck size={14}/> Saved automatically on this device</span><button className="done-btn" onClick={() => { setSettingsOpen(false); setToast('Settings saved'); }}>Done</button></footer></div></div>}
    {deleteChatId && <div className="modal-backdrop delete-confirm-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) setDeleteChatId(null); }}><section className="delete-confirm-dialog" role="dialog" aria-modal="true" aria-labelledby="delete-chat-title"><div className="delete-confirm-icon"><Trash2 size={18}/></div><h2 id="delete-chat-title">Delete this chat?</h2><p><strong>{chats.find(c => c.id === deleteChatId)?.title || 'This conversation'}</strong> and its messages will be permanently removed from this device.</p><div className="delete-confirm-actions"><button className="delete-cancel-button" autoFocus onClick={() => setDeleteChatId(null)}>Cancel</button><button className="delete-confirm-button" onClick={() => removeChat(deleteChatId)}>Delete chat</button></div></section></div>}
    {toast && <div className="toast"><Check size={15}/>{toast}</div>}
  </div>;
}

function Message({ message, onRetry, onEditSubmit, onBranch, onRegenerate, onToggleBookmark, assistantName = 'Assistant', busy = false }) {
  const [copied, setCopied] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(message.content || '');
  const user = message.role === 'user';
  const promptParts = !user ? splitPromptResponse(message.content) : null;
  const copy = async () => {
    try {
      await copyText(message.content || '');
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch (error) {
      console.error('Could not copy response', error);
    }
  };
  const saveEdit = () => { const text = draft.trim(); if (!text && !message.attachments?.length) return; onEditSubmit(message, text); setEditing(false); };
  return <article id={`message-${message.id}`} className={`message ${user ? 'user-message' : 'assistant-message'}`}>
    <div className="message-avatar">{user ? <span className="user-dot"><UserRound size={14}/></span> : <span className="assistant-mark"><MessageSquare size={13}/></span>}</div>
    <div className="message-content">
      <div className="message-body">
        <div className="message-author">{user ? 'You' : assistantName}</div>
        {message.attachments?.length > 0 && <div className="message-files">{message.attachments.map(f => f.image && f.dataUrl ? <img className="message-image" key={f.id} src={f.dataUrl} alt={f.name}/> : <div className="message-file" key={f.id}><FileText size={16}/><span>{f.name}</span></div>)}</div>}
        {editing ? <div className="message-edit"><textarea aria-label="Edit your message" value={draft} onChange={e => setDraft(e.target.value)} onKeyDown={e => { if (e.key === 'Escape') setEditing(false); if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); saveEdit(); } }}/><div className="message-edit-actions"><button className="edit-cancel" onClick={() => { setDraft(message.content || ''); setEditing(false); }}>Cancel</button><button className="edit-save" disabled={busy || (!draft.trim() && !message.attachments?.length)} onClick={saveEdit}>Save &amp; branch</button></div></div> : message.content && (promptParts ? <>{promptParts.intro && <div className="markdown-body prompt-intro"><MarkdownContent content={promptParts.intro}/></div>}<CopyablePromptCard content={promptParts.prompt}/>{promptParts.outro && <div className="markdown-body prompt-outro"><MarkdownContent content={promptParts.outro}/></div>}</> : <div className="markdown-body"><MarkdownContent content={message.content}/></div>)}
        {message.streaming && <div className="typing-dots"><i/><i/><i/></div>}
        {message.error && <div className="error-card"><AlertCircle size={16}/><span>{message.error}</span><button onClick={onRetry}>Try again</button></div>}
      </div>
      {user && !editing && <div className="message-actions user-message-actions"><time className="message-time">{formatMessageTime(message.createdAt)}</time><button title={copied ? 'Copied' : 'Copy message'} aria-label={copied ? 'Copied' : 'Copy message'} onClick={copy}>{copied ? <Check size={15}/> : <Copy size={15}/>}<span>{copied ? 'Copied' : 'Copy'}</span></button><button className={message.bookmarked ? 'bookmarked-action' : ''} title={message.bookmarked ? 'Remove bookmark' : 'Bookmark turn'} aria-label={message.bookmarked ? 'Remove bookmark' : 'Bookmark turn'} onClick={onToggleBookmark}><Bookmark size={15} fill={message.bookmarked ? 'currentColor' : 'none'}/><span>{message.bookmarked ? 'Saved' : 'Bookmark'}</span></button><button title="Edit message" aria-label="Edit message" disabled={busy} onClick={() => { setDraft(message.content || ''); setEditing(true); }}><SquarePen size={15}/><span>Edit</span></button><button title="Branch from message" aria-label="Branch from message" disabled={busy} onClick={() => onBranch(message)}><GitBranch size={15}/><span>Branch</span></button></div>}
      {!user && !message.streaming && !message.error && message.content && <div className="message-actions"><button title={copied ? 'Copied' : 'Copy response'} aria-label={copied ? 'Copied' : 'Copy response'} onClick={copy}>{copied ? <Check size={15}/> : <Copy size={15}/>}<span>{copied ? 'Copied' : 'Copy'}</span></button><button className={message.bookmarked ? 'bookmarked-action' : ''} title={message.bookmarked ? 'Remove bookmark' : 'Bookmark response'} aria-label={message.bookmarked ? 'Remove bookmark' : 'Bookmark response'} onClick={onToggleBookmark}><Bookmark size={15} fill={message.bookmarked ? 'currentColor' : 'none'}/><span>{message.bookmarked ? 'Saved' : 'Bookmark'}</span></button><button title="Regenerate response" aria-label="Regenerate response" disabled={busy} onClick={() => onRegenerate(message)}><RotateCcw size={15}/><span>Regenerate</span></button><button title="Branch from response" aria-label="Branch from response" disabled={busy} onClick={() => onBranch(message)}><GitBranch size={15}/><span>Branch</span></button></div>}
    </div>
  </article>;
}
const makePromptParts = (intro, rawPrompt) => {
  const outroStart = /\n{2,}(?=(?:a quick tip|that(?:'|’)s it!?|let me know if you|if you(?:'|’)d like))/i.exec(rawPrompt);
  const prompt = outroStart ? rawPrompt.slice(0, outroStart.index).trim() : rawPrompt.trim();
  const outro = outroStart ? rawPrompt.slice(outroStart.index).trim() : '';
  return { intro, prompt, outro };
};
const splitPromptResponse = content => {
  if (!content || content.length < 220) return null;
  const marker = /(?:^|\n)\s{0,3}(?:#{1,6}\s*)?(?:\*{1,2}\s*)?(?:(?:master|system|complete|ready-to-use)\s+)?prompt(?:\s*:|\b)/im;
  const match = marker.exec(content);
  if (match) {
    const start = match.index + (match[0].startsWith('\n') ? 1 : 0);
    return makePromptParts(content.slice(0, start).trim(), content.slice(start));
  }
  if (/\b(?:here(?:'s| is)|copy and paste|use)\b[^\n]{0,140}\bprompt\b/i.test(content)) {
    const firstParagraphEnd = content.indexOf('\n\n');
    if (firstParagraphEnd > -1 && content.length - firstParagraphEnd > 180) {
      return makePromptParts(content.slice(0, firstParagraphEnd).trim(), content.slice(firstParagraphEnd));
    }
  }
  return /\b(?:master|system|ready-to-use)\s+prompt\b/i.test(content) ? makePromptParts('', content) : null;
};

function CopyablePromptCard({ content }) {
  const [copied, setCopied] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const copy = async () => {
    try {
      await copyText(content);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch (error) {
      console.error('Could not copy prompt', error);
    }
  };
  const renderPrompt = () => <div className="markdown-body"><MarkdownContent content={content}/></div>;
  return <section className="copyable-prompt-card">
    <header className="copyable-card-head"><span>Writing</span><span className="copyable-card-actions"><button title={copied ? 'Copied' : 'Copy prompt'} aria-label={copied ? 'Copied' : 'Copy prompt'} onClick={copy}>{copied ? <Check size={18}/> : <Copy size={18}/>}</button><button title="Expand prompt" aria-label="Expand prompt" onClick={() => setExpanded(true)}><Maximize2 size={17}/></button></span></header>
    {renderPrompt()}
    {expanded && <div className="prompt-preview-backdrop" role="presentation" onMouseDown={e => { if (e.target === e.currentTarget) setExpanded(false); }}><section className="prompt-preview-dialog" role="dialog" aria-modal="true" aria-label="Prompt preview"><header className="copyable-card-head"><span>Writing</span><span className="copyable-card-actions"><button title={copied ? 'Copied' : 'Copy prompt'} aria-label={copied ? 'Copied' : 'Copy prompt'} onClick={copy}>{copied ? <Check size={18}/> : <Copy size={18}/>}</button><button title="Close preview" aria-label="Close preview" onClick={() => setExpanded(false)}><X size={19}/></button></span></header>{renderPrompt()}</section></div>}
  </section>;
}

function MarkdownContent({ content }) {
  return <ReactMarkdown remarkPlugins={[remarkGfm]} components={{ pre: CopyableCodeBlock }}>{content}</ReactMarkdown>;
}

function extractCodeSource(node) {
  if (!node) return '';
  if (typeof node === 'string') return node;
  if (Array.isArray(node)) return node.map(extractCodeSource).join('');
  if (node?.props?.children) return extractCodeSource(node.props.children);
  return String(node);
}

function tokenizeGenericCode(source, lang) {
  const isCss = lang === 'css';
  const tokens = [];
  const pattern = isCss
    ? /(\/\*[\s\S]*?\*\/)|("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*')|(#(?:[0-9a-fA-F]{3,8})\b)|(\b\d+(?:\.\d+)?(?:px|rem|em|vh|vw|%|s|ms|deg)?\b)|(\b(?:display|position|color|background|padding|margin|border|width|height|font|flex|grid|align-items|justify-content|transform|transition|animation|box-shadow|overflow|border-radius|z-index|opacity|cursor|gap)\b)|([{}();:,])/g
    : /(\/\*[\s\S]*?\*\/|\/\/[^\n]*|#[^\n]*)|(`(?:\\.|[^`])*`|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*')|(\b(?:async|await|break|case|catch|class|const|continue|def|default|delete|do|else|export|extends|false|finally|for|from|function|if|import|in|instanceof|let|new|null|return|self|static|super|switch|this|throw|true|try|typeof|var|void|while|with|yield)\b)|(\b\d+(?:\.\d+)?\b)|([{}()\[\].,;:]|=>|===|!==|==|!=|<=|>=|[+\-*\/%=<>!&|^~?])/g;

  let cursor = 0;
  let match;
  while ((match = pattern.exec(source)) !== null) {
    if (match.index > cursor) tokens.push({ text: source.slice(cursor, match.index), type: 'plain' });
    const text = match[0];
    let type = 'plain';
    if (isCss) {
      if (match[1]) type = 'comment';
      else if (match[2]) type = 'string';
      else if (match[3]) type = 'color';
      else if (match[4]) type = 'number';
      else if (match[5]) type = 'keyword';
      else if (match[6]) type = 'punctuation';
    } else {
      if (match[1]) type = 'comment';
      else if (match[2]) type = 'string';
      else if (match[3]) type = 'keyword';
      else if (match[4]) type = 'number';
      else if (match[5]) type = 'punctuation';
    }
    tokens.push({ text, type });
    cursor = match.index + text.length;
  }
  if (cursor < source.length) tokens.push({ text: source.slice(cursor), type: 'plain' });
  return tokens;
}

function tokenizeCode(source, language) {
  const langLower = (language || '').toLowerCase();
  const isHtmlLike = ['html', 'htm', 'svg', 'xml', 'markup'].includes(langLower);
  const tokens = [];

  if (isHtmlLike) {
    let index = 0;
    const len = source.length;
    while (index < len) {
      if (source.startsWith('<!--', index)) {
        const end = source.indexOf('-->', index);
        const commentEnd = end === -1 ? len : end + 3;
        tokens.push({ text: source.slice(index, commentEnd), type: 'comment' });
        index = commentEnd;
        continue;
      }
      if (source.startsWith('<!', index)) {
        const end = source.indexOf('>', index);
        const metaEnd = end === -1 ? len : end + 1;
        tokens.push({ text: source.slice(index, metaEnd), type: 'doctype' });
        index = metaEnd;
        continue;
      }
      if (source[index] === '<') {
        const isClosing = source[index + 1] === '/';
        index += isClosing ? 2 : 1;
        let tagName = '';
        while (index < len && /[a-zA-Z0-9:-]/.test(source[index])) {
          tagName += source[index];
          index++;
        }
        tokens.push({ text: isClosing ? '</' : '<', type: 'tag-bracket' });
        if (tagName) tokens.push({ text: tagName, type: 'tag-name' });
        while (index < len && source[index] !== '>' && !(source[index] === '/' && source[index + 1] === '>')) {
          if (/\s/.test(source[index])) {
            let ws = '';
            while (index < len && /\s/.test(source[index])) { ws += source[index]; index++; }
            tokens.push({ text: ws, type: 'plain' });
            continue;
          }
          if (/[a-zA-Z0-9_:-]/.test(source[index])) {
            let attrName = '';
            while (index < len && /[a-zA-Z0-9_:-]/.test(source[index])) { attrName += source[index]; index++; }
            tokens.push({ text: attrName, type: 'attr-name' });
            continue;
          }
          if (source[index] === '=') {
            tokens.push({ text: '=', type: 'attr-equals' });
            index++;
            continue;
          }
          if (source[index] === '"' || source[index] === "'") {
            const quote = source[index];
            let val = quote;
            index++;
            while (index < len && source[index] !== quote) {
              if (source[index] === '\\' && index + 1 < len) {
                val += source[index] + source[index + 1];
                index += 2;
              } else {
                val += source[index];
                index++;
              }
            }
            if (index < len) { val += source[index]; index++; }
            tokens.push({ text: val, type: 'attr-value' });
            continue;
          }
          tokens.push({ text: source[index], type: 'plain' });
          index++;
        }
        if (source[index] === '/' && source[index + 1] === '>') {
          tokens.push({ text: '/>', type: 'tag-bracket' });
          index += 2;
        } else if (source[index] === '>') {
          tokens.push({ text: '>', type: 'tag-bracket' });
          index++;
        }
        const lowerTagName = tagName.toLowerCase();
        if (!isClosing && lowerTagName === 'script') {
          const scriptCloseIdx = source.toLowerCase().indexOf('</script', index);
          const scriptEnd = scriptCloseIdx === -1 ? len : scriptCloseIdx;
          if (scriptEnd > index) {
            tokens.push(...tokenizeGenericCode(source.slice(index, scriptEnd), 'javascript'));
            index = scriptEnd;
          }
        } else if (!isClosing && lowerTagName === 'style') {
          const styleCloseIdx = source.toLowerCase().indexOf('</style', index);
          const styleEnd = styleCloseIdx === -1 ? len : styleCloseIdx;
          if (styleEnd > index) {
            tokens.push(...tokenizeGenericCode(source.slice(index, styleEnd), 'css'));
            index = styleEnd;
          }
        }
        continue;
      }
      if (source[index] === '&') {
        const semi = source.indexOf(';', index);
        if (semi !== -1 && semi - index < 10) {
          tokens.push({ text: source.slice(index, semi + 1), type: 'entity' });
          index = semi + 1;
          continue;
        }
      }
      let nextSpecial = source.indexOf('<', index);
      let nextEntity = source.indexOf('&', index);
      let nextEnd = len;
      if (nextSpecial !== -1) nextEnd = Math.min(nextEnd, nextSpecial);
      if (nextEntity !== -1) nextEnd = Math.min(nextEnd, nextEntity);
      tokens.push({ text: source.slice(index, nextEnd), type: 'text' });
      index = nextEnd;
    }
  } else {
    tokens.push(...tokenizeGenericCode(source, langLower));
  }
  return tokens;
}

function tokensToLines(tokens) {
  const lines = [[]];
  for (const token of tokens) {
    const parts = token.text.split('\n');
    for (let i = 0; i < parts.length; i++) {
      if (i > 0) lines.push([]);
      if (parts[i].length > 0) {
        lines[lines.length - 1].push({ text: parts[i], type: token.type });
      }
    }
  }
  return lines;
}

function CodeEditorContent({ source, language }) {
  const lines = useMemo(() => {
    const tokens = tokenizeCode(source, language);
    return tokensToLines(tokens);
  }, [source, language]);

  return (
    <div className="code-lines-wrapper">
      {lines.map((lineTokens, lineIdx) => {
        const lineNum = lineIdx + 1;
        return (
          <div className="code-line" key={lineIdx}>
            <span className="code-gutter-cell" aria-hidden="true">
              {lineNum}
            </span>
            <span className="code-line-text">
              {lineTokens.length > 0 ? (
                lineTokens.map((tok, tokIdx) => (
                  <span key={tokIdx} className={`token token-${tok.type}`}>
                    {tok.text}
                  </span>
                ))
              ) : (
                '\u00A0'
              )}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function buildHtmlPreviewDoc(rawCode) {
  const trimmed = rawCode.trim();
  const isSvg = /^\s*<svg[\s\S]*<\/svg>\s*$/i.test(trimmed);
  if (isSvg) {
    return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    * { box-sizing: border-box; }
    html, body {
      margin: 0;
      padding: 0;
      width: 100%;
      height: 100%;
      display: flex;
      align-items: center;
      justify-content: center;
      background: #ffffff;
      overflow: auto;
    }
    svg {
      max-width: 92%;
      max-height: 92%;
      height: auto;
    }
  </style>
</head>
<body>
  ${rawCode}
</body>
</html>`;
  }

  const errorCatchScript = `
<script>
  window.addEventListener('error', function(e) {
    var b = document.getElementById('__forma_preview_err__');
    if (!b) {
      b = document.createElement('div');
      b.id = '__forma_preview_err__';
      b.style.cssText = 'position:fixed;bottom:10px;left:10px;right:10px;background:#ef4444;color:#ffffff;padding:8px 12px;border-radius:6px;font-family:system-ui,-apple-system,sans-serif;font-size:12px;z-index:999999;box-shadow:0 4px 12px rgba(0,0,0,0.3);';
      document.body.appendChild(b);
    }
    b.textContent = 'Preview error: ' + (e.message || 'Script error');
  });
</script>`;

  if (/<!DOCTYPE\s+html/i.test(rawCode) || /<html[\s>]/i.test(rawCode)) {
    let result = rawCode;
    if (!/<meta[^>]+viewport/i.test(result)) {
      const viewportTag = '<meta name="viewport" content="width=device-width, initial-scale=1.0">';
      if (/<head[\s>]/i.test(result)) {
        result = result.replace(/<head[\s>]/i, match => `${match}\n  ${viewportTag}`);
      }
    }
    if (/<\/head>/i.test(result)) return result.replace(/<\/head>/i, `${errorCatchScript}\n</head>`);
    if (/<\/body>/i.test(result)) return result.replace(/<\/body>/i, `${errorCatchScript}\n</body>`);
    return result + errorCatchScript;
  }

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    * { box-sizing: border-box; }
    html, body {
      margin: 0;
      padding: 0;
      width: 100%;
      min-height: 100%;
    }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      padding: 16px;
      color: #111827;
      background: #ffffff;
      line-height: 1.5;
    }
  </style>
  ${errorCatchScript}
</head>
<body>
  ${rawCode}
</body>
</html>`;
}

function buildSandboxedPreviewPage(previewDoc) {
  const escapedSrcDoc = previewDoc.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>HTML Preview</title>
  <style>
    html, body { width: 100%; height: 100%; margin: 0; padding: 0; overflow: hidden; background: #fff; }
    iframe { display: block; width: 100%; height: 100%; border: 0; background: #fff; }
  </style>
</head>
<body>
  <iframe title="HTML Preview" sandbox="allow-scripts allow-modals allow-forms allow-popups" srcdoc="${escapedSrcDoc}"></iframe>
</body>
</html>`;
}

function CopyableCodeBlock({ children }) {
  const [copied, setCopied] = useState(false);
  const [viewMode, setViewMode] = useState('code');
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [viewport, setViewport] = useState('desktop');
  const [refreshKey, setRefreshKey] = useState(0);

  const codeNode = Array.isArray(children) ? children[0] : children;
  const className = codeNode?.props?.className || '';
  const language = className.match(/language-([\w+-]+)/)?.[1] || 'Code';
  const source = extractCodeSource(codeNode?.props?.children).replace(/\n$/, '');

  const langLower = language.toLowerCase();
  const isExplicitHtml = ['html', 'htm', 'svg'].includes(langLower);
  const isMarkup = /^\s*<!DOCTYPE\s+html/i.test(source) || /^\s*<html[\s>]/i.test(source) || (/<\/?[a-z][\s\S]*>/i.test(source) && ['xml', 'markup', 'code', ''].includes(langLower));
  const isPreviewable = isExplicitHtml || isMarkup;

  const closePreview = () => {
    setIsFullscreen(false);
    window.getSelection?.()?.removeAllRanges?.();
  };
  const openFullscreen = () => {
    setIsFullscreen(true);
    window.getSelection?.()?.removeAllRanges?.();
  };
  const switchMode = (mode) => {
    setViewMode(mode);
    window.getSelection?.()?.removeAllRanges?.();
  };

  useEffect(() => {
    window.getSelection?.()?.removeAllRanges?.();
  }, []);

  useEffect(() => {
    if (!isFullscreen) return;
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') closePreview();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isFullscreen]);

  const copy = async () => {
    try {
      await copyText(source);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch (error) {
      console.error('Could not copy code', error);
    }
  };

  const openInNewTab = () => {
    const previewPage = buildSandboxedPreviewPage(buildHtmlPreviewDoc(source));
    const blob = new Blob([previewPage], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    window.open(url, '_blank', 'noopener,noreferrer');
    window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
  };

  const downloadFile = () => {
    const extMap = {
      html: 'html', htm: 'html', svg: 'svg', javascript: 'js', js: 'js',
      typescript: 'ts', ts: 'ts', css: 'css', json: 'json', python: 'py',
      py: 'py', markdown: 'md', md: 'md', sh: 'sh', bash: 'sh', sql: 'sql'
    };
    const ext = extMap[langLower] || (isPreviewable ? 'html' : 'txt');
    const mime = ext === 'html' ? 'text/html' : ext === 'svg' ? 'image/svg+xml' : 'text/plain';
    const content = isPreviewable && (langLower === 'html' || langLower === 'htm') ? buildHtmlPreviewDoc(source) : source;
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `forma-${Date.now().toString(36)}.${ext}`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  return (
    <div className={`copyable-code-card ${isPreviewable ? 'has-preview' : ''}`}>
      <header className="copyable-card-head html-card-head">
        <div className="code-head-left">
          <span className="code-lang-tag">{language}</span>
          {isPreviewable && (
            <div className="code-view-tabs" role="tablist" aria-label="Code display mode">
              <button
                type="button"
                role="tab"
                aria-selected={viewMode === 'code'}
                className={`code-view-tab ${viewMode === 'code' ? 'active' : ''}`}
                onClick={() => switchMode('code')}
                title="View HTML Source Code"
              >
                <Code2 size={13} />
                <span>Code</span>
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={viewMode === 'preview'}
                className={`code-view-tab ${viewMode === 'preview' ? 'active' : ''}`}
                onClick={() => switchMode('preview')}
                title="Live HTML Preview"
              >
                <Play size={13} />
                <span>Preview</span>
              </button>
            </div>
          )}
        </div>
        <div className="copyable-card-actions">
          {isPreviewable && viewMode === 'preview' && (
            <>
              <button
                type="button"
                className="code-action-btn"
                title="Refresh preview"
                aria-label="Refresh preview"
                onClick={() => setRefreshKey(k => k + 1)}
              >
                <RotateCcw size={15} />
              </button>
              <button
                type="button"
                className="code-action-btn"
                title="Expand to fullscreen modal"
                aria-label="Expand preview"
                onClick={openFullscreen}
              >
                <Maximize2 size={15} />
              </button>
              <button
                type="button"
                className="code-action-btn"
                title="Open preview in new tab"
                aria-label="Open preview in new tab"
                onClick={openInNewTab}
              >
                <ExternalLink size={15} />
              </button>
            </>
          )}
          <button
            type="button"
            className="code-action-btn"
            title={isPreviewable ? "Download HTML file" : "Download code file"}
            aria-label="Download code"
            onClick={downloadFile}
          >
            <Download size={15} />
          </button>
          <button
            type="button"
            className="code-action-btn"
            title={copied ? 'Copied' : 'Copy code'}
            aria-label={copied ? 'Copied' : 'Copy code'}
            onClick={copy}
          >
            {copied ? <Check size={15} /> : <Copy size={15} />}
          </button>
        </div>
      </header>

      {isPreviewable && viewMode === 'preview' ? (
        <div className="html-inline-preview-wrap">
          <iframe
            key={`inline-${refreshKey}`}
            title="HTML Live Preview"
            srcDoc={buildHtmlPreviewDoc(source)}
            sandbox="allow-scripts allow-modals allow-forms allow-popups"
            className="html-preview-iframe"
          />
        </div>
      ) : (
        <div
          className="code-scroll-region"
          role="region"
          tabIndex={0}
          aria-label={`${language} source code`}
        >
          <CodeEditorContent source={source} language={langLower} />
        </div>
      )}

      {isFullscreen && (
        <div
          className="prompt-preview-backdrop html-modal-backdrop"
          role="presentation"
          onMouseDown={e => { if (e.target === e.currentTarget) closePreview(); }}
        >
          <section className="prompt-preview-dialog html-preview-modal-dialog" role="dialog" aria-modal="true" aria-label="Interactive HTML Sandbox">
            <header className="copyable-card-head html-modal-head">
              <div className="html-modal-title-group">
                <span className="html-modal-badge">Interactive Preview</span>
                <div className="html-viewport-switcher" role="group" aria-label="Device viewport">
                  <button
                    type="button"
                    className={`viewport-btn ${viewport === 'desktop' ? 'active' : ''}`}
                    title="Desktop view (100%)"
                    onClick={() => setViewport('desktop')}
                  >
                    <Monitor size={14} />
                    <span>Desktop</span>
                  </button>
                  <button
                    type="button"
                    className={`viewport-btn ${viewport === 'tablet' ? 'active' : ''}`}
                    title="Tablet view (768px)"
                    onClick={() => setViewport('tablet')}
                  >
                    <Tablet size={14} />
                    <span>Tablet</span>
                  </button>
                  <button
                    type="button"
                    className={`viewport-btn ${viewport === 'mobile' ? 'active' : ''}`}
                    title="Mobile view (375px)"
                    onClick={() => setViewport('mobile')}
                  >
                    <Smartphone size={14} />
                    <span>Mobile</span>
                  </button>
                </div>
              </div>
              <div className="copyable-card-actions">
                <button title="Refresh preview" aria-label="Refresh preview" onClick={() => setRefreshKey(k => k + 1)}>
                  <RotateCcw size={16} />
                </button>
                <button title="Open in new browser tab" aria-label="Open in new browser tab" onClick={openInNewTab}>
                  <ExternalLink size={16} />
                </button>
                <button title="Download HTML" aria-label="Download HTML" onClick={downloadFile}>
                  <Download size={16} />
                </button>
                <button title="Close preview" aria-label="Close preview" onClick={closePreview}>
                  <X size={19} />
                </button>
              </div>
            </header>
            <div className={`html-modal-body viewport-${viewport}`}>
              <div className="html-modal-frame-wrapper">
                <iframe
                  key={`modal-${refreshKey}`}
                  title="HTML Fullscreen Preview"
                  srcDoc={buildHtmlPreviewDoc(source)}
                  sandbox="allow-scripts allow-modals allow-forms allow-popups"
                  className="html-preview-iframe"
                />
              </div>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}

