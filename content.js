(() => {
  if (document.getElementById("blobby-root")) return;

  // Conversation state
  let conversationHistory = [];
  let currentQuestion = "";

  // ── STYLES ──────────────────────────────────────────────────────
  const style = document.createElement("style");
  style.textContent = `
    @keyframes blobbyDot {
      0%, 60%, 100% { opacity: 0.2; transform: translateY(0); }
      30% { opacity: 1; transform: translateY(-4px); }
    }
    @keyframes blobbyPopIn {
      from { opacity: 0; transform: scale(0.85); }
      to   { opacity: 1; transform: scale(1); }
    }
    @keyframes blobbyMsgIn {
      from { opacity: 0; transform: translateY(6px); }
      to   { opacity: 1; transform: translateY(0); }
    }
    #blobby-ask-btn {
      position: fixed;
      z-index: 2147483646;
      background: #7ec8e3;
      color: white;
      border: none;
      border-radius: 20px;
      padding: 6px 13px;
      font-size: 12.5px;
      font-weight: 600;
      font-family: 'Segoe UI', system-ui, sans-serif;
      cursor: pointer;
      box-shadow: 0 3px 12px rgba(0,0,0,0.18);
      animation: blobbyPopIn 0.15s ease;
      white-space: nowrap;
      pointer-events: auto;
      transition: background 0.15s;
    }
    #blobby-ask-btn:hover { background: #5ab8d8; }
    #blobby-refresh-btn:hover { color: #5ab8d8 !important; }
    #blobby-chat-log::-webkit-scrollbar { width: 4px; }
    #blobby-chat-log::-webkit-scrollbar-track { background: transparent; }
    #blobby-chat-log::-webkit-scrollbar-thumb { background: #e0e7ef; border-radius: 4px; }
  `;
  document.head.appendChild(style);

  // ── FLOATING ASK BUTTON ─────────────────────────────────────────
  let askBtn = null;
  let askBtnTimeout = null;

  function removeAskBtn() {
    if (askBtn) { askBtn.remove(); askBtn = null; }
    clearTimeout(askBtnTimeout);
  }

  document.addEventListener("mouseup", (e) => {
    if (e.target.closest("#blobby-root") || e.target.id === "blobby-ask-btn") return;
    setTimeout(() => {
      const sel = window.getSelection();
      const text = sel?.toString().trim();
      removeAskBtn();
      if (!text || text.length < 5) return;
      const range = sel.getRangeAt(0);
      const rect = range.getBoundingClientRect();
      askBtn = document.createElement("button");
      askBtn.id = "blobby-ask-btn";
      askBtn.textContent = "Ask Blobby";
      askBtn.style.left = Math.min(rect.left + window.scrollX, window.innerWidth - 160) + "px";
      askBtn.style.top = (rect.top + window.scrollY - 40) + "px";
      askBtn.addEventListener("click", () => {
        const selected = window.getSelection()?.toString().trim() || text;
        removeAskBtn();
        chrome.runtime.sendMessage({ type: "BLOBBY_SELECTION", selectedText: selected });
        showBubble();
        setLoading(true);
      });
      document.body.appendChild(askBtn);
      askBtnTimeout = setTimeout(removeAskBtn, 4000);
    }, 10);
  });

  document.addEventListener("mousedown", (e) => {
    if (e.target.id !== "blobby-ask-btn") removeAskBtn();
  });

  // Alt+B (or Option+B on Mac) to trigger Blobby on selected text
  document.addEventListener("keydown", (e) => {
    if (e.altKey && e.key === "b") {
      const sel = window.getSelection();
      const text = sel?.toString().trim();
      if (!text || text.length < 2) return;
      removeAskBtn();
      chrome.runtime.sendMessage({ type: "BLOBBY_SELECTION", selectedText: text });
      showBubble();
      setLoading(true);
      e.preventDefault();
    }
  });

  // ── ROOT CONTAINER ──────────────────────────────────────────────
  const root = document.createElement("div");
  root.id = "blobby-root";
  Object.assign(root.style, {
    position: "fixed",
    bottom: "24px",
    right: "24px",
    display: "flex",
    flexDirection: "row",
    alignItems: "flex-end",
    zIndex: "2147483647",
    fontFamily: "'Segoe UI', system-ui, sans-serif",
  });

  // ── BLOBBY IMAGE ────────────────────────────────────────────────
  const imgWrapper = document.createElement("div");
  Object.assign(imgWrapper.style, {
    position: "relative", width: "90px", height: "90px", flexShrink: "0", cursor: "pointer",
  });

  const img = document.createElement("img");
  img.src = chrome.runtime.getURL("blobby.png");
  img.alt = "Blobby Fischer";
  Object.assign(img.style, {
    width: "100%", height: "100%", objectFit: "contain", objectPosition: "bottom",
    display: "block", filter: "drop-shadow(0 4px 12px rgba(0,0,0,0.18))",
    transition: "transform 0.2s ease",
  });

  // ── DRAG TO REPOSITION ─────────────────────────────────────────
  let isDragging = false;
  let dragStartX, dragStartY, startRight, startBottom;

  imgWrapper.addEventListener("mousedown", (e) => {
    if (e.button !== 0) return;
    isDragging = false;
    dragStartX = e.clientX;
    dragStartY = e.clientY;
    startRight = parseInt(root.style.right) || 24;
    startBottom = parseInt(root.style.bottom) || 24;
    e.preventDefault();
    const onMove = (e) => {
      const dx = e.clientX - dragStartX;
      const dy = e.clientY - dragStartY;
      if (Math.abs(dx) > 4 || Math.abs(dy) > 4) isDragging = true;
      if (!isDragging) return;
      const newRight = Math.max(0, Math.min(window.innerWidth - 90, startRight - dx));
      const newBottom = Math.max(0, Math.min(window.innerHeight - 90, startBottom - dy));
      root.style.right = newRight + "px";
      root.style.bottom = newBottom + "px";
    };
    const onUp = () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
      imgWrapper.style.cursor = "pointer";
    };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
    imgWrapper.style.cursor = "grabbing";
  });

  imgWrapper.addEventListener("mouseenter", () => { if (!isDragging) img.style.transform = "translateY(-4px)"; });
  imgWrapper.addEventListener("mouseleave", () => img.style.transform = "translateY(0)");
  imgWrapper.addEventListener("click", () => {
    if (isDragging) { isDragging = false; return; }
    const isHidden = bubble.style.display === "none" || bubble.style.opacity === "0";
    if (isHidden) showBubble(); else hideBubble();
  });

  // ── RESIZE HANDLE ──────────────────────────────────────────────
  let blobbySize = 90;
  const resizeHandle = document.createElement("div");
  Object.assign(resizeHandle.style, {
    position: "absolute", top: "0px", left: "0px",
    width: "14px", height: "14px",
    background: "white", border: "2px solid #7ec8e3",
    borderRadius: "50%", cursor: "nwse-resize",
    opacity: "0", transition: "opacity 0.2s ease",
    zIndex: "10", boxShadow: "0 1px 4px rgba(0,0,0,0.15)",
  });

  imgWrapper.addEventListener("mouseenter", () => resizeHandle.style.opacity = "1");
  imgWrapper.addEventListener("mouseleave", () => resizeHandle.style.opacity = "0");

  let isResizing = false;
  let resizeStartX, resizeStartY, resizeStartSize;

  resizeHandle.addEventListener("mousedown", (e) => {
    e.stopPropagation();
    isResizing = true;
    resizeStartX = e.clientX;
    resizeStartY = e.clientY;
    resizeStartSize = blobbySize;
    const onMove = (e) => {
      if (!isResizing) return;
      const dx = e.clientX - resizeStartX;
      const dy = resizeStartY - e.clientY;
      const delta = (dy - dx) / 2;
      blobbySize = Math.max(50, Math.min(160, resizeStartSize + delta));
      imgWrapper.style.width = blobbySize + "px";
      imgWrapper.style.height = blobbySize + "px";
      scaleBubble(blobbySize);
    };
    const onUp = () => {
      isResizing = false;
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
    };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
    e.preventDefault();
  });

  imgWrapper.appendChild(img);
  imgWrapper.appendChild(resizeHandle);

  // ── SPEECH BUBBLE ───────────────────────────────────────────────
  const bubble = document.createElement("div");
  bubble.id = "blobby-bubble";
  Object.assign(bubble.style, {
    position: "absolute", bottom: "105px", right: "0px", width: "280px",
    background: "white", borderRadius: "18px", padding: "14px 16px 12px",
    boxShadow: "0 8px 32px rgba(0,0,0,0.13), 0 2px 8px rgba(0,0,0,0.08)",
    border: "1.5px solid #e8edf5", display: "none", opacity: "0",
    transform: "translateY(6px) scale(0.97)",
    transition: "opacity 0.22s ease, transform 0.22s ease",
    pointerEvents: "auto",
  });

  const tail = document.createElement("div");
  Object.assign(tail.style, {
    position: "absolute", bottom: "-9px", right: "28px",
    width: "0", height: "0",
    borderLeft: "9px solid transparent", borderRight: "9px solid transparent",
    borderTop: "10px solid white",
  });
  const tailBorder = document.createElement("div");
  Object.assign(tailBorder.style, {
    position: "absolute", bottom: "-11px", right: "27px",
    width: "0", height: "0",
    borderLeft: "10px solid transparent", borderRight: "10px solid transparent",
    borderTop: "11px solid #e8edf5", zIndex: "-1",
  });

  const header = document.createElement("div");
  Object.assign(header.style, {
    display: "flex", alignItems: "center", gap: "7px",
    marginBottom: "9px", paddingBottom: "9px", borderBottom: "1px solid #f0f3f9",
  });

  const headerDot = document.createElement("div");
  Object.assign(headerDot.style, {
    width: "8px", height: "8px", borderRadius: "50%", background: "#7ec8e3", flexShrink: "0",
  });

  const headerName = document.createElement("span");
  headerName.textContent = "Blobby Fischer";
  Object.assign(headerName.style, {
    fontSize: "11.5px", fontWeight: "600", color: "#8494a8",
    letterSpacing: "0.3px", textTransform: "uppercase",
  });

  const refreshBtn = document.createElement("button");
  refreshBtn.id = "blobby-refresh-btn";
  refreshBtn.title = "Start over";
  refreshBtn.innerHTML = "&#8635;";
  Object.assign(refreshBtn.style, {
    marginLeft: "auto", background: "none", border: "none", cursor: "pointer",
    fontSize: "17px", color: "#b0bac9", lineHeight: "1",
    padding: "0 4px 0 0", transition: "color 0.15s",
  });
  refreshBtn.addEventListener("click", (e) => { e.stopPropagation(); resetBlobby(); });

  const closeBtn = document.createElement("button");
  closeBtn.textContent = "x";
  Object.assign(closeBtn.style, {
    background: "none", border: "none", cursor: "pointer",
    fontSize: "16px", color: "#b0bac9", lineHeight: "1", padding: "0",
  });
  closeBtn.addEventListener("click", (e) => { e.stopPropagation(); hideBubble(); });
  closeBtn.addEventListener("mouseenter", () => closeBtn.style.color = "#7a8899");
  closeBtn.addEventListener("mouseleave", () => closeBtn.style.color = "#b0bac9");

  header.appendChild(headerDot);
  header.appendChild(headerName);
  header.appendChild(refreshBtn);
  header.appendChild(closeBtn);

  const chatLog = document.createElement("div");
  chatLog.id = "blobby-chat-log";
  Object.assign(chatLog.style, {
    display: "flex", flexDirection: "column", gap: "8px",
    maxHeight: "220px", overflowY: "auto", paddingRight: "2px",
  });

  const loadingDots = document.createElement("div");
  loadingDots.id = "blobby-loading";
  loadingDots.innerHTML = '<span style="display:inline-block;animation:blobbyDot 1.2s infinite 0s">.</span><span style="display:inline-block;animation:blobbyDot 1.2s infinite 0.4s">.</span><span style="display:inline-block;animation:blobbyDot 1.2s infinite 0.8s">.</span>';
  Object.assign(loadingDots.style, {
    fontSize: "22px", color: "#7ec8e3", letterSpacing: "3px", display: "none", marginTop: "2px",
  });

  const inputArea = document.createElement("div");
  inputArea.id = "blobby-input-area";
  Object.assign(inputArea.style, {
    display: "none", flexDirection: "column", gap: "7px",
    marginTop: "11px", paddingTop: "11px", borderTop: "1px solid #f0f3f9",
  });

  const inputLabel = document.createElement("div");
  inputLabel.textContent = "Your answer or next step:";
  Object.assign(inputLabel.style, { fontSize: "11px", color: "#9aa5b4", fontWeight: "500" });

  const inputRow = document.createElement("div");
  Object.assign(inputRow.style, {
    display: "flex", gap: "6px", alignItems: "center", width: "100%", boxSizing: "border-box",
  });

  const input = document.createElement("input");
  input.id = "blobby-input";
  input.type = "text";
  input.placeholder = "type here...";
  Object.assign(input.style, {
    flex: "1", minWidth: "0", padding: "7px 10px", fontSize: "13px",
    border: "1.5px solid #e8edf5", borderRadius: "10px",
    background: "#f8fafc", color: "#2d3748", outline: "none",
    boxSizing: "border-box", transition: "border-color 0.15s",
  });
  input.addEventListener("focus", () => input.style.borderColor = "#7ec8e3");
  input.addEventListener("blur", () => input.style.borderColor = "#e8edf5");

  const sendBtn = document.createElement("button");
  sendBtn.textContent = "Send";
  Object.assign(sendBtn.style, {
    background: "#7ec8e3", border: "none", borderRadius: "10px",
    color: "white", fontWeight: "600", fontSize: "12px",
    padding: "7px 11px", cursor: "pointer", flexShrink: "0", transition: "background 0.15s",
  });
  sendBtn.addEventListener("mouseenter", () => { if (!sendBtn.disabled) sendBtn.style.background = "#5ab8d8"; });
  sendBtn.addEventListener("mouseleave", () => { if (!sendBtn.disabled) sendBtn.style.background = "#7ec8e3"; });

  inputRow.appendChild(input);
  inputRow.appendChild(sendBtn);
  inputArea.appendChild(inputLabel);
  inputArea.appendChild(inputRow);

  const handleSend = () => {
    const text = input.value.trim();
    if (!text || sendBtn.disabled) return;
    input.value = "";
    addMessage(text, "student");
    setLoading(true);
    chrome.runtime.sendMessage({
      type: "BLOBBY_FOLLOWUP",
      studentMessage: text,
      history: conversationHistory,
      question: currentQuestion
    }, (response) => {
      const reply = response?.reply || "Something went sideways. Try again.";
      conversationHistory.push({ role: "user", content: text });
      conversationHistory.push({ role: "assistant", content: reply });
      setLoading(false);
      addMessage(reply, "blobby");
    });
  };

  sendBtn.addEventListener("click", handleSend);
  input.addEventListener("keydown", e => { if (e.key === "Enter") handleSend(); });

  bubble.appendChild(tailBorder);
  bubble.appendChild(tail);
  bubble.appendChild(header);
  bubble.appendChild(chatLog);
  bubble.appendChild(loadingDots);
  bubble.appendChild(inputArea);
  root.appendChild(bubble);
  root.appendChild(imgWrapper);
  document.body.appendChild(root);

  // ── HELPERS ─────────────────────────────────────────────────────
  function addMessage(text, sender) {
    const isBlobby = sender === "blobby";
    const row = document.createElement("div");
    Object.assign(row.style, {
      display: "flex",
      justifyContent: isBlobby ? "flex-start" : "flex-end",
      animation: "blobbyMsgIn 0.18s ease",
    });
    const msgBubble = document.createElement("div");
    Object.assign(msgBubble.style, {
      maxWidth: "88%", padding: "8px 11px",
      borderRadius: isBlobby ? "4px 14px 14px 14px" : "14px 4px 14px 14px",
      fontSize: "13px", lineHeight: "1.5", wordBreak: "break-word", whiteSpace: "pre-wrap",
      background: isBlobby ? "#f0f7fa" : "#7ec8e3",
      color: isBlobby ? "#2d3748" : "white",
    });
    msgBubble.textContent = text;
    row.appendChild(msgBubble);
    chatLog.appendChild(row);
    chatLog.scrollTop = chatLog.scrollHeight;
  }

  function scaleBubble(size) {
    const scale = size / 90;
    const bubbleWidth = Math.round(280 * scale);
    const baseFontSize = Math.round(13.5 * scale * 10) / 10;
    const smallFontSize = Math.round(11 * scale * 10) / 10;
    const headerFontSize = Math.round(11.5 * scale * 10) / 10;
    const padding = Math.round(14 * scale);
    bubble.style.width = bubbleWidth + "px";
    bubble.style.bottom = (size + 10) + "px";
    bubble.style.padding = padding + "px " + Math.round(16 * scale) + "px " + Math.round(12 * scale) + "px";
    const msgBubbles = chatLog.querySelectorAll("div > div");
    msgBubbles.forEach(el => el.style.fontSize = baseFontSize + "px");
    headerName.style.fontSize = headerFontSize + "px";
    inputLabel.style.fontSize = smallFontSize + "px";
    input.style.fontSize = baseFontSize + "px";
    sendBtn.style.fontSize = smallFontSize + "px";
  }

  function showBubble() {
    bubble.style.display = "block";
    requestAnimationFrame(() => requestAnimationFrame(() => {
      bubble.style.opacity = "1";
      bubble.style.transform = "translateY(0) scale(1)";
    }));
  }

  function hideBubble() {
    bubble.style.opacity = "0";
    bubble.style.transform = "translateY(6px) scale(0.97)";
    setTimeout(() => { bubble.style.display = "none"; }, 220);
  }

  function setLoading(on) {
    loadingDots.style.display = on ? "block" : "none";
    sendBtn.disabled = on;
    input.disabled = on;
    sendBtn.style.opacity = on ? "0.5" : "1";
    sendBtn.style.cursor = on ? "default" : "pointer";
  }

  function resetBlobby() {
    conversationHistory = [];
    currentQuestion = "";
    setLoading(false);
    chatLog.innerHTML = "";
    inputArea.style.display = "none";
    addMessage("Ready? Let's blob our way to better grades...", "blobby");
    showBubble();
  }

  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.type === "BLOBBY_LOADING") {
      showBubble();
      setLoading(true);
    }
    if (msg.type === "BLOBBY_MESSAGE") {
      setLoading(false);
      currentQuestion = msg.question || currentQuestion;
      conversationHistory = msg.history || [];
      addMessage(msg.text, "blobby");
      inputArea.style.display = "flex";
      showBubble();
    }
  });

  addMessage("Hey, I'm Blobby Fischer...like that chess guy. You look desperate. Just highlight any question on this page and right-click to get a hint.", "blobby");

})();