const $ = (selector) => document.querySelector(selector);
const state = {
  chats: [],
  activeId: null,
  busy: false,
  controller: null,
};

const STORAGE_KEY = "warren-ai-chats-v1";
const THEME_KEY = "warren-ai-theme";

function makeId() {
  return globalThis.crypto?.randomUUID?.() || `chat-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function loadChats() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
    state.chats = Array.isArray(saved) ? saved.filter((chat) =>
      chat && typeof chat.id === "string" && Array.isArray(chat.messages)
    ) : [];
  } catch {
    state.chats = [];
  }
}

function saveChats() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state.chats));
  } catch {
    showToast("Could not save chat history on this device.");
  }
}

function activeChat() {
  return state.chats.find((chat) => chat.id === state.activeId) || null;
}

function newChat() {
  if (state.busy) return;
  const chat = { id: makeId(), title: "New chat", updatedAt: Date.now(), messages: [] };
  state.chats.unshift(chat);
  state.activeId = chat.id;
  saveChats();
  render();
  closeMobileSidebar();
  $("#messageInput").focus();
}

function selectChat(id) {
  if (state.busy) return;
  state.activeId = id;
  render();
  closeMobileSidebar();
}

function renderHistory() {
  const host = $("#chatHistory");
  host.replaceChildren();
  if (!state.chats.length) {
    const empty = document.createElement("p");
    empty.className = "empty-history";
    empty.textContent = "Your conversations will appear here.";
    host.append(empty);
    return;
  }

  for (const chat of state.chats) {
    const button = document.createElement("button");
    button.className = `history-item${chat.id === state.activeId ? " active" : ""}`;
    button.type = "button";
    button.innerHTML = '<span class="history-icon" aria-hidden="true">◷</span>';
    const label = document.createElement("span");
    label.textContent = chat.title || "New chat";
    button.append(label);
    button.addEventListener("click", () => selectChat(chat.id));
    host.append(button);
  }
}

function renderMessage(message, index) {
  const article = document.createElement("article");
  article.className = `message ${message.role}`;

  const avatar = document.createElement("div");
  avatar.className = "message-avatar";
  avatar.textContent = message.role === "user" ? "Y" : "W";

  const content = document.createElement("div");
  content.className = "message-content";

  const meta = document.createElement("div");
  meta.className = "message-meta";
  const name = document.createElement("span");
  name.textContent = message.role === "user" ? "You" : "Warren AI";
  meta.append(name);

  if (message.provider) {
    const provider = document.createElement("small");
    provider.textContent = message.provider;
    meta.append(provider);
  }

  const text = document.createElement("div");
  text.className = "message-text";
  text.textContent = message.content;
  content.append(meta, text);

  if (message.role === "assistant" && message.content) {
    const actions = document.createElement("div");
    actions.className = "message-actions";
    const copy = document.createElement("button");
    copy.type = "button";
    copy.textContent = "Copy";
    copy.addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(message.content);
        showToast("Copied to clipboard");
      } catch {
        showToast("Clipboard is unavailable in this browser.");
      }
    });
    actions.append(copy);
    content.append(actions);
  }

  article.append(avatar, content);
  return article;
}

function render() {
  renderHistory();
  const chat = activeChat();
  $("#topbarChatName").textContent = chat?.title || "New chat";
  const welcome = $("#welcome");
  const list = $("#messageList");
  list.replaceChildren();

  if (!chat || chat.messages.length === 0) {
    welcome.hidden = false;
  } else {
    welcome.hidden = true;
    chat.messages.forEach((message, index) => list.append(renderMessage(message, index)));
  }

  if (state.busy) {
    const typing = document.createElement("article");
    typing.className = "message assistant";
    typing.innerHTML = '<div class="message-avatar">W</div><div class="message-content"><div class="message-meta">Warren AI <small>thinking</small></div><div class="typing-dots" aria-label="Generating response"><i></i><i></i><i></i></div></div>';
    list.append(typing);
  }

  $("#sendButton").disabled = state.busy || !$("#messageInput").value.trim();
  requestAnimationFrame(() => {
    const workspace = $("#workspace");
    workspace.scrollTop = workspace.scrollHeight;
  });
}

function showToast(message) {
  const toast = $("#toast");
  toast.textContent = message;
  toast.classList.add("show");
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => toast.classList.remove("show"), 2200);
}

function setBusy(value) {
  state.busy = value;
  $("#messageInput").disabled = value;
  $("#providerSelect").disabled = value;
  $("#sendButton").disabled = value || !$("#messageInput").value.trim();
  $("#sendButton").innerHTML = value ? '<span>…</span>' : '<span>↑</span>';
}

function updateTitle(chat) {
  if (chat.title !== "New chat") return;
  const firstUserMessage = chat.messages.find((message) => message.role === "user");
  if (firstUserMessage) {
    chat.title = firstUserMessage.content.replace(/\s+/g, " ").slice(0,  thirty =  thirty);
  }
}

async function sendMessage(rawText) {
  const content = rawText.trim();
  if (!content || state.busy) return;

  if (!activeChat()) {
    const chat = { id: makeId(), title: "New chat", updatedAt: Date.now(), messages: [] };
    state.chats.unshift(chat);
    state.activeId = chat.id;
  }

  const chat = activeChat();
  chat.messages.push({ role: "user", content });
  chat.updatedAt = Date.now();
  if (chat.title === "New chat") chat.title = content.replace(/\s+/g, " ").slice(0,  thirty =  thirty);
  saveChats();
  $("#messageInput").value = "";
  resizeInput();
  setBusy(true);
  render();

  try {
    const messages = chat.messages.slice(-20).map(({ role, content: text }) => ({ role, content: text }));
    const response = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages, provider: $("#providerSelect").value }),
      signal: (state.controller = new AbortController()).signal,
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(data.error || `Request failed (${response.status})`);
    }
    chat.messages.push({
      role: "assistant",
      content: data.text || "The model returned an empty response.",
      provider: data.provider || "AI",
    });
  } catch (error) {
    const message = error.name === "AbortError"
      ? "This request was cancelled."
      : error.message || "Something went wrong. Please try again.";
    chat.messages.push({ role: "assistant", content: `Sorry — ${message}` });
  } finally {
    state.controller = null;
    chat.updatedAt = Date.now();
    saveChats();
    setBusy(false);
    render();
    $("#messageInput").focus();
  }
}

function resizeInput() {
  const input = $("#messageInput");
  input.style.height = "auto";
  input.style.height = `${Math.min(input.scrollHeight, 170)}px`;
  $("#sendButton").disabled = state.busy || !input.value.trim();
}

function openMobileSidebar() {
  $("#sidebar").classList.add("open");
  $("#mobileScrim").classList.add("show");
}

function closeMobileSidebar() {
  $("#sidebar").classList.remove("open");
  $("#mobileScrim").classList.remove("show");
}

function initTheme() {
  const saved = localStorage.getItem(THEME_KEY);
  const theme = saved === "light" ? "light" : "dark";
  document.documentElement.dataset.theme = theme;
  $("#themeToggle").textContent = theme === "dark" ? "☼" : "☾";
}

function toggleTheme() {
  const next = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
  document.documentElement.dataset.theme = next;
  localStorage.setItem(THEME_KEY, next);
  $("#themeToggle").textContent = next === "dark" ? "☼" : "☾";
}

$("#chatForm").addEventListener("submit", (event) => {
  event.preventDefault();
  sendMessage($("#messageInput").value);
});
$("#messageInput").addEventListener("input", resizeInput);
$("#messageInput").addEventListener("keydown", (event) => {
  if (event.key === "Enter" && !event.shiftKey) {
    event.preventDefault();
    sendMessage($("#messageInput").value);
  }
});
$("#newChat").addEventListener("click", newChat);
$("#themeToggle").addEventListener("click", toggleTheme);
$("#openSidebar").addEventListener("click", openMobileSidebar);
$("#closeSidebar").addEventListener("click", closeMobileSidebar);
$("#mobileScrim").addEventListener("click", closeMobileSidebar);
document.querySelectorAll("[data-prompt]").forEach((button) => {
  button.addEventListener("click", () => {
    $("#messageInput").value = button.dataset.prompt;
    resizeInput();
    $("#messageInput").focus();
  });
});
document.addEventListener("keydown", (event) => {
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
    event.preventDefault();
    newChat();
  }
  if (event.key === "Escape") closeMobileSidebar();
});

loadChats();
state.activeId = state.chats[0]?.id || null;
initTheme();
render();