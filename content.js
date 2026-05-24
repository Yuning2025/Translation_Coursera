(() => {
  const OVERLAY_ID = "coursera-subtitle-overlay";
  const UI_VERSION = "2";
  const API_URL = "https://api.deepseek.com/chat/completions";
  const MODEL_ID = "deepseek-chat";
  const TRANSLATE_BATCH_SIZE = 35;
  const MAX_RETRY_ATTEMPTS = 2;
  const SYSTEM_PROMPT =
    "你是字幕翻译助手，擅长计算机科学与工程术语。用户会提供多行英文字幕，每行都带有形如[序号]的前缀。请逐行翻译成中文并严格保留序号，输出格式必须为：[序号] 翻译内容。每个序号一行，不要遗漏，不要新增，不要合并，不要解释。";

  const STATE = {
    video: null,
    videoSrc: "",
    rafId: null,
    isDragging: false,
    dragOffsetX: 0,
    dragOffsetY: 0,
    position: null,
    subtitles: [],
    apiKey: "",
    isTranslating: false,
    englishCues: [],
    hasTranslated: false,
    fontSize: 16,
    baseFontSize: 16,
    baseWidth: 0,
    resizeObserver: null,
    mutationObserver: null,
    fullscreenBound: false,
    dragHandlersBound: false,
    currentUrl: window.location.href,
    closed: false
  };

  function createOverlay() {
    const existing = document.getElementById(OVERLAY_ID);
    if (existing) {
      const version = existing.getAttribute("data-ui-version");
      if (version === UI_VERSION) {
        return existing;
      }
      existing.remove();
    }

    const overlay = document.createElement("div");
    overlay.id = OVERLAY_ID;
    overlay.setAttribute("data-ui-version", UI_VERSION);
    overlay.className = "coursera-subtitle-overlay";
    overlay.innerHTML = [
      "<div class=\"coursera-subtitle-text\">等待英文字幕轨道...</div>",
      "<div class=\"coursera-subtitle-hint\">拖拽移动 | 读取英文字幕并翻译为中文</div>",
      "<div class=\"coursera-subtitle-actions\">",
      "  <button class=\"coursera-subtitle-button\" data-action=\"toggle\">设置</button>",
      "  <button class=\"coursera-subtitle-button\" data-action=\"translate\">开始翻译</button>",
      "  <button class=\"coursera-subtitle-button\" data-action=\"subtitle-only\">仅显示字幕</button>",
      "  <button class=\"coursera-subtitle-button\" data-action=\"minimize\">最小化</button>",
      "  <button class=\"coursera-subtitle-button\" data-action=\"close\">关闭</button>",
      "</div>",
      "<div class=\"coursera-subtitle-minimal-actions\">",
      "  <button class=\"coursera-subtitle-button\" data-action=\"exit-subtitle-only\">回到界面</button>",
      "</div>",
      "<div class=\"coursera-subtitle-status\"></div>",
      "<div class=\"coursera-subtitle-panel\">",
      "  <label class=\"coursera-subtitle-label\">DeepSeek API Key</label>",
      "  <input class=\"coursera-subtitle-input\" type=\"password\" placeholder=\"输入 API Key\" />",
      "  <button class=\"coursera-subtitle-button\" data-action=\"save-key\">保存 Key</button>",
      "  <label class=\"coursera-subtitle-label\">字幕字体大小</label>",
      "  <input class=\"coursera-subtitle-range\" type=\"range\" min=\"12\" max=\"32\" step=\"1\" data-action=\"font-size\" />",
      "</div>"
    ].join("");

    overlay.addEventListener("mousedown", onDragStart);
    if (!STATE.dragHandlersBound) {
      window.addEventListener("mousemove", onDragMove);
      window.addEventListener("mouseup", onDragEnd);
      STATE.dragHandlersBound = true;
    }
    overlay.addEventListener("click", onOverlayClick);
    overlay.addEventListener("input", onOverlayInput);

    document.body.appendChild(overlay);
    return overlay;
  }

  function onDragStart(event) {
    if (event.button !== 0) return;
    if (!shouldStartDrag(event.target)) return;
    const overlay = document.getElementById(OVERLAY_ID);
    if (!overlay) return;
    STATE.isDragging = true;
    const rect = overlay.getBoundingClientRect();
    STATE.dragOffsetX = event.clientX - rect.left;
    STATE.dragOffsetY = event.clientY - rect.top;
    overlay.classList.add("is-dragging");
  }

  function onDragMove(event) {
    if (!STATE.isDragging) return;
    const overlay = document.getElementById(OVERLAY_ID);
    if (!overlay) return;
    const x = event.clientX - STATE.dragOffsetX;
    const y = event.clientY - STATE.dragOffsetY;
    STATE.position = { x, y };
    overlay.style.left = `${x}px`;
    overlay.style.top = `${y}px`;
    overlay.style.bottom = "auto";
    overlay.style.transform = "none";
  }

  function onDragEnd() {
    if (!STATE.isDragging) return;
    STATE.isDragging = false;
    const overlay = document.getElementById(OVERLAY_ID);
    if (overlay) {
      overlay.classList.remove("is-dragging");
    }
  }

  function onOverlayClick(event) {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    const action = target.getAttribute("data-action");
    if (!action) {
      const overlay = document.getElementById(OVERLAY_ID);
      if (
        overlay &&
        overlay.classList.contains("is-minimized") &&
        overlay.contains(target)
      ) {
        overlay.classList.remove("is-minimized");
      }
      return;
    }

    const overlay = document.getElementById(OVERLAY_ID);
    if (!overlay) return;
    const panel = overlay.querySelector(".coursera-subtitle-panel");
    const status = overlay.querySelector(".coursera-subtitle-status");
    const input = overlay.querySelector(".coursera-subtitle-input");
    if (!panel || !status || !input) return;

    if (action === "toggle") {
      panel.classList.toggle("is-open");
      return;
    }

    if (action === "save-key") {
      const value = input.value.trim();
      if (!value) {
        status.textContent = "请输入有效的 API Key";
        return;
      }
      saveApiKey(value).then(() => {
        STATE.apiKey = value;
        status.textContent = "API Key 已保存";
        panel.classList.remove("is-open");
      });
      return;
    }

    if (action === "translate") {
      translateEnglishCues();
    }

    if (action === "subtitle-only") {
      overlay.classList.add("is-subtitle-only");
      panel.classList.remove("is-open");
      return;
    }

    if (action === "exit-subtitle-only") {
      overlay.classList.remove("is-subtitle-only");
      return;
    }

    if (action === "minimize") {
      overlay.classList.toggle("is-minimized");
      if (overlay.classList.contains("is-minimized")) {
        overlay.classList.remove("is-subtitle-only");
        panel.classList.remove("is-open");
      }
      return;
    }

    if (action === "close") {
      closeOverlay();
      return;
    }
  }

  function closeOverlay() {
    STATE.closed = true;
    const overlay = document.getElementById(OVERLAY_ID);
    if (overlay) {
      overlay.remove();
    }
    if (STATE.rafId) {
      window.cancelAnimationFrame(STATE.rafId);
      STATE.rafId = null;
    }
    if (STATE.mutationObserver) {
      STATE.mutationObserver.disconnect();
      STATE.mutationObserver = null;
    }
    if (STATE.resizeObserver) {
      STATE.resizeObserver.disconnect();
      STATE.resizeObserver = null;
    }
    if (STATE.fullscreenBound) {
      document.removeEventListener("fullscreenchange", handleFullscreenChange);
      document.removeEventListener("webkitfullscreenchange", handleFullscreenChange);
      STATE.fullscreenBound = false;
    }
    if (STATE.dragHandlersBound) {
      window.removeEventListener("mousemove", onDragMove);
      window.removeEventListener("mouseup", onDragEnd);
      STATE.dragHandlersBound = false;
    }
    STATE.video = null;
    STATE.subtitles = [];
    STATE.englishCues = [];
    STATE.hasTranslated = false;
  }

  function hydrateOverlay(overlay) {
    if (!overlay) return;
    updateFontSize(STATE.fontSize || 16);
    updateBaseSize(STATE.fontSize || 16);
    const input = overlay.querySelector(".coursera-subtitle-input");
    if (input && STATE.apiKey) input.value = STATE.apiKey;
    const range = overlay.querySelector(".coursera-subtitle-range");
    if (range) range.value = String(STATE.fontSize || 16);
    if (STATE.resizeObserver && typeof STATE.resizeObserver.observe === "function") {
      STATE.resizeObserver.observe(overlay);
    }
    handleFullscreenChange();
  }

  function ensureOverlay() {
    let overlay = document.getElementById(OVERLAY_ID);
    if (overlay) return overlay;
    overlay = createOverlay();
    hydrateOverlay(overlay);
    return overlay;
  }

  function ensureOverlayVisibility(overlay) {
    if (!overlay) return;
    const fullscreenElement =
      document.fullscreenElement || document.webkitFullscreenElement || null;
    const viewportWidth = window.innerWidth || document.documentElement.clientWidth || 0;
    const viewportHeight = window.innerHeight || document.documentElement.clientHeight || 0;

    const keepOverlayInViewport = () => {
      const rect = overlay.getBoundingClientRect();
      const isOutOfViewport =
        rect.right < 24 ||
        rect.left > viewportWidth - 24 ||
        rect.bottom < 24 ||
        rect.top > viewportHeight - 24;
      if (isOutOfViewport) {
        // Reset to default centered anchor when position is no longer visible.
        overlay.style.left = "";
        overlay.style.top = "";
        overlay.style.bottom = "";
        overlay.style.transform = "";
        STATE.position = null;
      }
    };

    if (!fullscreenElement) {
      if (overlay.parentElement !== document.body) {
        document.body.appendChild(overlay);
      }
      overlay.classList.remove("is-fullscreen");
      keepOverlayInViewport();
      return;
    }

    let container = fullscreenElement;
    if (fullscreenElement instanceof HTMLVideoElement) {
      container = fullscreenElement.parentElement || fullscreenElement;
    }
    if (container && !container.contains(overlay)) {
      container.appendChild(overlay);
    }
    overlay.classList.add("is-fullscreen");
    keepOverlayInViewport();
  }

  function shouldStartDrag(target) {
    if (!(target instanceof HTMLElement)) return false;
    return !target.closest(
      "button, input, textarea, select, label, .coursera-subtitle-panel"
    );
  }

  function onOverlayInput(event) {
    const target = event.target;
    if (!(target instanceof HTMLInputElement)) return;
    const action = target.getAttribute("data-action");
    if (action !== "font-size") return;
    const size = parseInt(target.value, 10);
    if (Number.isFinite(size)) {
      updateFontSize(size);
      updateBaseSize(size);
      saveFontSize(size);
    }
  }

  function loadApiKey() {
    return new Promise((resolve) => {
      chrome.storage.local.get(["deepseekApiKey"], (result) => {
        resolve(result.deepseekApiKey || "");
      });
    });
  }

  function saveApiKey(key) {
    return new Promise((resolve) => {
      chrome.storage.local.set({ deepseekApiKey: key }, () => resolve());
    });
  }

  function loadFontSize() {
    return new Promise((resolve) => {
      chrome.storage.local.get(["courseraSubtitleFontSize"], (result) => {
        resolve(result.courseraSubtitleFontSize || 16);
      });
    });
  }

  function saveFontSize(size) {
    chrome.storage.local.set({ courseraSubtitleFontSize: size });
  }

  function setStatus(text) {
    const overlay = document.getElementById(OVERLAY_ID);
    if (!overlay) return;
    const status = overlay.querySelector(".coursera-subtitle-status");
    if (status) status.textContent = text;
  }

  function updateFontSize(size) {
    const overlay = document.getElementById(OVERLAY_ID);
    if (!overlay) return;
    STATE.fontSize = size;
    overlay.style.setProperty("--coursera-subtitle-font-size", `${size}px`);
  }

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function updateBaseSize(size) {
    const overlay = document.getElementById(OVERLAY_ID);
    if (!overlay) return;
    STATE.baseFontSize = size;
    STATE.baseWidth = overlay.getBoundingClientRect().width || 0;
  }

  function syncFontSizeToOverlay() {
    const overlay = document.getElementById(OVERLAY_ID);
    if (!overlay || !STATE.baseWidth || !STATE.baseFontSize) return;
    const width = overlay.getBoundingClientRect().width;
    if (!width) return;
    const scaled = clamp(
      Math.round(STATE.baseFontSize * (width / STATE.baseWidth)),
      12,
      32
    );
    updateFontSize(scaled);
    const range = overlay.querySelector(".coursera-subtitle-range");
    if (range) range.value = String(scaled);
  }

  function findVideo() {
    const videos = Array.from(document.querySelectorAll("video"));
    if (!videos.length) return null;

    const candidates = videos.filter((video) => {
      if (!video.isConnected) return false;
      const rect = video.getBoundingClientRect();
      return rect.width > 160 && rect.height > 90;
    });
    const list = candidates.length ? candidates : videos;

    list.sort((a, b) => {
      const aRect = a.getBoundingClientRect();
      const bRect = b.getBoundingClientRect();
      const aArea = aRect.width * aRect.height;
      const bArea = bRect.width * bRect.height;
      const aScore =
        (a.readyState > 0 ? 4 : 0) +
        (!a.ended ? 2 : 0) +
        (a.textTracks && a.textTracks.length ? 2 : 0) +
        (!a.paused ? 1 : 0);
      const bScore =
        (b.readyState > 0 ? 4 : 0) +
        (!b.ended ? 2 : 0) +
        (b.textTracks && b.textTracks.length ? 2 : 0) +
        (!b.paused ? 1 : 0);
      if (bScore !== aScore) return bScore - aScore;
      return bArea - aArea;
    });

    return list[0] || null;
  }

  function resetForNewVideo() {
    STATE.englishCues = [];
    STATE.subtitles = [];
    STATE.hasTranslated = false;
    setStatus("等待英文字幕轨道...");
  }

  function formatTime(seconds) {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
  }

  function normalizeCueText(text) {
    return text.replace(/\s+/g, " ").trim();
  }

  function pickEnglishTrack(tracks) {
    if (!tracks.length) return null;
    const english = tracks.find((track) => {
      const language = (track.language || "").toLowerCase();
      const label = (track.label || "").toLowerCase();
      return language.startsWith("en") || label.includes("english");
    });
    return english || tracks.find((track) => track.cues && track.cues.length) || tracks[0];
  }

  function buildIndexedLines(lines) {
    return lines.map((line, index) => `[${index + 1}] ${line}`);
  }

  function parseIndexedLines(content, expectedCount, fallbackLines) {
    const parsed = Array.from({ length: expectedCount }, () => "");
    const regex = /^\s*(?:\[|【)(\d+)(?:\]|】)[.\s:：\-]*(.*)$/gm;
    let match = regex.exec(content);
    let parsedCount = 0;

    while (match) {
      const index = Number.parseInt(match[1], 10) - 1;
      if (index >= 0 && index < expectedCount) {
        const text = (match[2] || "").trim();
        if (text) {
          parsed[index] = text;
          parsedCount += 1;
        }
      }
      match = regex.exec(content);
    }

    if (!parsedCount) {
      const raw = content
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean);
      for (let i = 0; i < Math.min(raw.length, expectedCount); i += 1) {
        parsed[i] = raw[i].replace(/^(?:\[|【)?\d+(?:\]|】)?[.\)\]:：\-]*\s*/, "").trim();
      }
      parsedCount = Math.min(raw.length, expectedCount);
    }

    return { lines: parsed, parsedCount };
  }

  function parseVttTimestamp(ts) {
    const parts = ts.trim().split(":");
    let hours = 0, minutes = 0;
    let secsMillis;
    if (parts.length === 3) {
      hours = parseInt(parts[0], 10) || 0;
      minutes = parseInt(parts[1], 10) || 0;
      secsMillis = parts[2];
    } else if (parts.length === 2) {
      minutes = parseInt(parts[0], 10) || 0;
      secsMillis = parts[1];
    } else {
      secsMillis = parts[0];
    }
    const [secStr, millisStr] = secsMillis.split(/[.,]/);
    const seconds = parseInt(secStr, 10) || 0;
    const millis = parseInt((millisStr || "0").padEnd(3, "0").slice(0, 3), 10) || 0;
    return hours * 3600 + minutes * 60 + seconds + millis / 1000;
  }

  function parseVttContent(vttText) {
    const cues = [];
    const blocks = vttText.split(/\n\s*\n/);
    const timeLineRegex = /^\s*((?:\d{2}:)?\d{2}:\d{2}[.,]\d{3})\s*-->\s*((?:\d{2}:)?\d{2}:\d{2}[.,]\d{3})\s*$/;

    for (const block of blocks) {
      const rawLines = block.split(/\r?\n/);
      const lines = [];
      for (const line of rawLines) {
        const trimmed = line.trim();
        if (trimmed) lines.push(trimmed);
      }
      if (lines.length < 2) continue;
      if (/^WEBVTT/i.test(lines[0])) continue;
      if (/^NOTE\b/i.test(lines[0]) || /^STYLE\b/i.test(lines[0])) continue;

      let timeIndex = 0;
      if (!timeLineRegex.test(lines[0]) && lines.length > 1 && timeLineRegex.test(lines[1])) {
        timeIndex = 1;
      }
      if (timeIndex >= lines.length - 1) continue;
      const timeMatch = lines[timeIndex].match(timeLineRegex);
      if (!timeMatch) continue;

      const start = parseVttTimestamp(timeMatch[1]);
      const end = parseVttTimestamp(timeMatch[2]);
      const textLines = lines.slice(timeIndex + 1);
      const text = normalizeCueText(textLines.join(" ").replace(/<[^>]+>/g, ""));
      if (text) {
        cues.push({ start, end, text });
      }
    }
    return cues;
  }

  async function fetchEnglishCuesFromVtt() {
    const trackElements = document.querySelectorAll("track");
    const candidates = [];

    for (const track of trackElements) {
      const lang = (track.getAttribute("srclang") || "").toLowerCase();
      const label = (track.getAttribute("label") || "").toLowerCase();
      const kind = (track.getAttribute("kind") || "").toLowerCase();
      const src = track.getAttribute("src");

      if (!src) continue;
      if (kind === "metadata" || kind === "chapters") continue;

      const isEnglish = lang.startsWith("en") || label.includes("english") || label.includes("英文");
      candidates.push({ src, isEnglish, element: track });
    }

    candidates.sort((a, b) => (b.isEnglish ? 1 : 0) - (a.isEnglish ? 1 : 0));

    for (const candidate of candidates) {
      try {
        const response = await fetch(candidate.src);
        if (!response.ok) continue;
        const vttText = await response.text();
        const cues = parseVttContent(vttText);
        if (cues.length > 0) return cues;
      } catch (_e) {
        continue;
      }
    }
    return null;
  }

  function collectEnglishCues() {
    if (!STATE.video) return [];
    const tracks = Array.from(STATE.video.textTracks || []);
    const track = pickEnglishTrack(tracks);
    if (!track) return [];
    if (track.mode === "disabled") track.mode = "hidden";
    if (!track.cues || !track.cues.length) return [];
    return Array.from(track.cues)
      .map((cue) => ({
        start: cue.startTime,
        end: cue.endTime,
        text: normalizeCueText(cue.text || "")
      }))
      .filter((cue) => cue.text);
  }

  async function attachTrackWatcher() {
    if (!STATE.video) return;

    const vttCues = await fetchEnglishCuesFromVtt();
    if (vttCues && vttCues.length > 0) {
      STATE.englishCues = vttCues;
      if (!STATE.hasTranslated) {
        setStatus(`检测到 ${STATE.englishCues.length} 条英文字幕（VTT），请点击"开始翻译"`);
      }
    } else {
      const tracks = Array.from(STATE.video.textTracks || []);
      tracks.forEach((track) => {
        if (track.mode === "disabled") track.mode = "hidden";
        if (track.__courseraOverlayHooked) return;
        track.__courseraOverlayHooked = true;
        track.addEventListener("cuechange", () => {
          const freshCues = collectEnglishCues();
          if (freshCues.length > STATE.englishCues.length) {
            STATE.englishCues = freshCues;
            if (!STATE.hasTranslated) {
              setStatus(`检测到 ${STATE.englishCues.length} 条英文字幕，请点击"开始翻译"`);
            }
          }
        });
      });

      const freshCues = collectEnglishCues();
      if (freshCues.length > STATE.englishCues.length) {
        STATE.englishCues = freshCues;
        if (!STATE.hasTranslated) {
          setStatus(`检测到 ${STATE.englishCues.length} 条英文字幕，请点击"开始翻译"`);
        }
      }
    }
  }

  async function translateEnglishCues() {
    if (STATE.isTranslating) return;
    if (!STATE.apiKey) {
      setStatus("请先保存 DeepSeek API Key");
      return;
    }

    const freshCues = collectEnglishCues();
    if (freshCues.length > STATE.englishCues.length) {
      STATE.englishCues = freshCues;
    }
    const cues = STATE.englishCues;
    if (!cues.length) {
      setStatus("未检测到英文字幕轨道");
      return;
    }

    const englishLines = cues.map((cue) => cue.text);
    if (!englishLines.length) {
      setStatus("英文字幕为空");
      return;
    }

    STATE.isTranslating = true;
    setStatus("正在加载中文字幕，请稍候...");

    if (STATE.video && !STATE.video.paused) {
      STATE.video.pause();
    }

    try {
      const entries = [];
      let totalParsedCount = 0;
      const totalBatches = Math.ceil(cues.length / TRANSLATE_BATCH_SIZE);

      for (let batchIndex = 0; batchIndex < totalBatches; batchIndex += 1) {
        const start = batchIndex * TRANSLATE_BATCH_SIZE;
        const end = Math.min(start + TRANSLATE_BATCH_SIZE, cues.length);
        const batchCues = cues.slice(start, end);
        const batchLines = englishLines.slice(start, end);
        setStatus(
          `正在翻译第 ${batchIndex + 1}/${totalBatches} 批（${batchCues.length} 行）...`
        );

        const response = await fetch(API_URL, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${STATE.apiKey}`
          },
          body: JSON.stringify({
            model: MODEL_ID,
            messages: [
              { role: "system", content: SYSTEM_PROMPT },
              { role: "user", content: buildIndexedLines(batchLines).join("\n") }
            ],
            max_tokens: 8192,
            stream: false
          })
        });

        if (!response.ok) {
          throw new Error(`第 ${batchIndex + 1} 批接口错误 (${response.status})`);
        }

        const data = await response.json();
        const content = data?.choices?.[0]?.message?.content;
        if (!content) {
          throw new Error(`第 ${batchIndex + 1} 批翻译结果为空`);
        }

        const parsed = parseIndexedLines(content, batchCues.length, batchLines);

        // Retry missing lines
        const missingIndices = [];
        for (let i = 0; i < batchCues.length; i += 1) {
          if (!parsed.lines[i]) missingIndices.push(i);
        }

        if (missingIndices.length > 0 && missingIndices.length < batchCues.length) {
          for (let attempt = 0; attempt < MAX_RETRY_ATTEMPTS && missingIndices.length > 0; attempt += 1) {
            const retryLines = missingIndices.map((i) => batchLines[i]);
            const retryIndexed = missingIndices.map((i, idx) => `[${idx + 1}] ${retryLines[idx]}`);
            const retryResp = await fetch(API_URL, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${STATE.apiKey}`
              },
              body: JSON.stringify({
                model: MODEL_ID,
                messages: [
                  { role: "system", content: SYSTEM_PROMPT },
                  { role: "user", content: retryIndexed.join("\n") }
                ],
                max_tokens: 8192,
                stream: false
              })
            });
            if (!retryResp.ok) break;
            const retryData = await retryResp.json();
            const retryContent = retryData?.choices?.[0]?.message?.content;
            if (!retryContent) break;
            const retryParsed = parseIndexedLines(retryContent, missingIndices.length, retryLines);
            for (let ri = missingIndices.length - 1; ri >= 0; ri -= 1) {
              if (retryParsed.lines[ri]) {
                parsed.lines[missingIndices[ri]] = retryParsed.lines[ri];
                missingIndices.splice(ri, 1);
              }
            }
          }
        }

        totalParsedCount += batchCues.length - missingIndices.length;

        for (let i = 0; i < batchCues.length; i += 1) {
          entries.push({
            start: batchCues[i].start,
            end: batchCues[i].end,
            text: parsed.lines[i]
          });
        }
      }

      STATE.subtitles = entries;
      STATE.hasTranslated = true;

      if (totalParsedCount < cues.length) {
        setStatus(
          `中文字幕已加载：${entries.length} 条（模型格式部分不规范，已自动对齐）`
        );
      } else {
        setStatus(`中文字幕已加载：${entries.length} 条`);
      }
    } catch (error) {
      setStatus(`翻译失败：${error.message}`);
    } finally {
      STATE.isTranslating = false;
    }
  }

  function findSubtitle(time) {
    if (!STATE.subtitles.length) return "";
    const entry = STATE.subtitles.find(
      (item) => time >= item.start && time <= item.end
    );
    return entry ? entry.text : "";
  }

  function tick() {
    if (STATE.closed) {
      STATE.rafId = null;
      return;
    }
    const overlay = ensureOverlay();
    if (!overlay) {
      STATE.rafId = window.requestAnimationFrame(tick);
      return;
    }

    if (window.location.href !== STATE.currentUrl) {
      STATE.currentUrl = window.location.href;
      STATE.video = null;
      STATE.videoSrc = "";
      resetForNewVideo();
    }

    ensureOverlayVisibility(overlay);

    const nextVideo = findVideo();
    if (nextVideo && nextVideo !== STATE.video) {
      STATE.video = nextVideo;
      STATE.videoSrc = STATE.video.currentSrc || STATE.video.src || "";
      resetForNewVideo();
      attachTrackWatcher();
    } else if (!nextVideo) {
      STATE.video = null;
    }

    if (STATE.video && !STATE.video.isConnected) {
      STATE.video = null;
      STATE.videoSrc = "";
      resetForNewVideo();
    }

    if (STATE.video) {
      const currentSrc = STATE.video.currentSrc || STATE.video.src || "";
      if (currentSrc && currentSrc !== STATE.videoSrc) {
        STATE.videoSrc = currentSrc;
        resetForNewVideo();
        attachTrackWatcher();
      }
    }

    const textEl = overlay.querySelector(".coursera-subtitle-text");
    if (STATE.video) {
      const current = STATE.video.currentTime || 0;
      const subtitle = findSubtitle(current);
      if (subtitle) {
        textEl.innerHTML = `<span class="coursera-subtitle-highlight">${escapeHtml(
          subtitle
        )}</span>`;
      } else {
        textEl.textContent = `当前时间: ${formatTime(current)}`;
      }
    } else {
      textEl.textContent = "等待英文字幕轨道...";
    }

    STATE.rafId = window.requestAnimationFrame(tick);
  }

  async function init() {
    const overlay = createOverlay();
    if (!overlay) return;

    STATE.video = findVideo();
    STATE.videoSrc = STATE.video ? STATE.video.currentSrc || STATE.video.src || "" : "";
    if (!STATE.rafId) {
      STATE.rafId = window.requestAnimationFrame(tick);
    }

    const apiKey = await loadApiKey();
    if (apiKey) {
      STATE.apiKey = apiKey;
      const input = overlay.querySelector(".coursera-subtitle-input");
      if (input) input.value = apiKey;
      setStatus("API Key 已加载");
    }

    const fontSize = await loadFontSize();
    updateFontSize(fontSize);
    updateBaseSize(fontSize);
    const range = overlay.querySelector(".coursera-subtitle-range");
    if (range) range.value = String(fontSize);

    attachTrackWatcher();

    if (!STATE.mutationObserver) {
      STATE.mutationObserver = new MutationObserver(() => {
        ensureOverlay();
        if (window.location.href !== STATE.currentUrl) {
          STATE.currentUrl = window.location.href;
          STATE.video = null;
          STATE.videoSrc = "";
          resetForNewVideo();
        }

        const nextVideo = findVideo();
        if (nextVideo && nextVideo !== STATE.video) {
          STATE.video = nextVideo;
          STATE.videoSrc = STATE.video.currentSrc || STATE.video.src || "";
          resetForNewVideo();
          attachTrackWatcher();
          return;
        }
        if (STATE.video) {
          const currentSrc = STATE.video.currentSrc || STATE.video.src || "";
          if (currentSrc && currentSrc !== STATE.videoSrc) {
            STATE.videoSrc = currentSrc;
            resetForNewVideo();
            attachTrackWatcher();
          }
        }
      });
    }
    STATE.mutationObserver.observe(document.body, { childList: true, subtree: true });

    if (!STATE.fullscreenBound) {
      document.addEventListener("fullscreenchange", handleFullscreenChange);
      document.addEventListener("webkitfullscreenchange", handleFullscreenChange);
      STATE.fullscreenBound = true;
    }
    handleFullscreenChange();

    if (!STATE.resizeObserver && typeof ResizeObserver !== "undefined") {
      STATE.resizeObserver = new ResizeObserver(() => {
        syncFontSizeToOverlay();
      });
      STATE.resizeObserver.observe(overlay);
    }
  }

  function handleFullscreenChange() {
    const overlay = document.getElementById(OVERLAY_ID);
    if (!overlay) return;
    ensureOverlayVisibility(overlay);
  }

  function escapeHtml(text) {
    return text
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function safeInit() {
    try {
      init();
      window.__courseraSubtitleOverlayLoaded = true;
      console.info("[coursera-subtitle-overlay] injected");
    } catch (error) {
      console.error("[coursera-subtitle-overlay] init failed:", error);
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", safeInit);
  } else {
    safeInit();
  }
})();