/* ============================================================
   Hindi Story Audio Proofreader — Firefox-optimized
   Firefox gives true 3x rate with no freezing.
   Chrome/Edge are detected and get micro-chunking fallback.
   ============================================================ */
(function () {
  'use strict';

  /* ---------- DOM ---------- */
  const $ = (id) => document.getElementById(id);

  const storyText     = $('storyText');
  const wordCountEl   = $('wordCount');
  const charCountEl   = $('charCount');
  const chunkBadge    = $('chunkCountBadge');
  const hintText      = $('hintText');

  const playBtn       = $('playBtn');
  const playIcon      = $('playIcon');
  const playLabel     = $('playLabel');
  const pauseBtn      = $('pauseBtn');
  const stopBtn       = $('stopBtn');

  const skipBackBtn   = $('skipBackBtn');
  const skipBack10Btn = $('skipBack10Btn');
  const skipFwd10Btn  = $('skipFwd10Btn');
  const skipFwdBtn    = $('skipFwdBtn');

  const seekSlider    = $('seekSlider');
  const seekCurrent   = $('seekCurrent');
  const seekPercent   = $('seekPercent');

  const speedSlider   = $('speedSlider');
  const speedValue    = $('speedValue');

  const voiceSelect   = $('voiceSelect');
  const voiceHint     = $('voiceHint');

  const statusBadge   = $('statusBadge');
  const statusDetail  = $('statusDetail');
  const statusMeta    = $('statusMeta');
  const statusDot     = $('statusDot');
  const engineBadge   = $('engineBadge');

  /* ---------- BROWSER DETECTION ---------- */
  const ua = navigator.userAgent;
  const IS_FIREFOX     = /Firefox/.test(ua);
  const IS_SAFARI      = /^((?!chrome|android).)*safari/i.test(ua);
  const IS_CHROME_LIKE = /Chrome|Edg|OPR/.test(ua);

  /* ---------- RATE CAPS PER BROWSER ---------- */
  // Firefox: full 3x, no issues
  // Safari: 2.5x safe
  // Chrome/Edge: 1.4x hard limit; we compensate with micro-chunks
  const RATE_CAP = IS_FIREFOX ? 3.0
                 : IS_SAFARI  ? 2.5
                 : IS_CHROME_LIKE ? 1.4
                 : 2.0;

  // Inter-chunk delay: Firefox needs none. Chrome needs a small gap.
  const INTER_CHUNK_DELAY = IS_FIREFOX ? 0 : 20;
  const CANCEL_DELAY      = IS_FIREFOX ? 30 : 60;

  /* ---------- STATE ---------- */
  const synth = window.speechSynthesis;

  let voices         = [];
  let hindiVoices    = [];
  let cachedVoice    = null;
  let chunks         = [];
  let chunkIndex     = 0;
  let rate           = 2.0;
  let effectiveRate  = 2.0;
  let isPlaying      = false;
  let isPaused       = false;
  let currentUtterance = null;
  let loopToken      = 0;
  let resumeTimer    = null;
  let lastCancelTime = 0;
  let warmupDone     = false;
  let pendingSeek    = null;
  let nextUtterance  = null;
  let nextIndex      = -1;

  /* ============================================================
     SAFE CANCEL
     ============================================================ */
  function safeCancel() {
    const now = performance.now();
    if (now - lastCancelTime < 100) return;
    lastCancelTime = now;
    try { synth.cancel(); } catch (_) {}
  }

  /* ============================================================
     ENGINE WARMUP — silence + prime the pipeline
     ============================================================ */
  function warmUp() {
    if (warmupDone) return;
    warmupDone = true;
    try {
      const u = new SpeechSynthesisUtterance('क');
      u.volume = 0;
      u.rate = 10;
      u.lang = 'hi-IN';
      if (cachedVoice) u.voice = cachedVoice;
      synth.speak(u);
      setTimeout(() => safeCancel(), 50);
    } catch (_) {}
  }

  /* ============================================================
     VOICE DETECTION
     ============================================================ */
  function classifyVoice(v) {
    const l = v.lang.toLowerCase();
    if (l === 'hi-in' || l === 'hi') return 0;
    if (l.startsWith('hi-')) return 1;
    return 99;
  }

  function loadVoices() {
    const all = synth.getVoices();
    if (!all.length) return;

    voices = all;
    hindiVoices = all.filter(v => classifyVoice(v) <= 1);
    hindiVoices.sort((a, b) => classifyVoice(a) - classifyVoice(b) || a.name.localeCompare(b.name));

    voiceSelect.innerHTML = '';

    if (hindiVoices.length === 0) {
      const warn = document.createElement('option');
      warn.textContent = '⚠ No Hindi voice installed — showing all voices';
      warn.disabled = true;
      voiceSelect.appendChild(warn);

      const fallback = [...all].sort((a, b) => a.lang.localeCompare(b.lang));
      for (const v of fallback) {
        const opt = document.createElement('option');
        opt.value = v.voiceURI;
        opt.textContent = `${v.name} — ${v.lang}`;
        voiceSelect.appendChild(opt);
      }

      voiceHint.textContent = '⚠ No Hindi voice found. Install: Windows Settings → Time & Language → Speech → Add voices.';
      voiceHint.className = 'voice-hint warn';
    } else {
      for (const v of hindiVoices) {
        const opt = document.createElement('option');
        opt.value = v.voiceURI;
        opt.textContent = `${v.name} — ${v.lang}`;
        voiceSelect.appendChild(opt);
      }

      const best = hindiVoices[0];
      voiceSelect.value = best.voiceURI;
      voiceHint.textContent = `✓ Using: ${best.name} (${best.lang})`;
      voiceHint.className = 'voice-hint ok';
      engineBadge.textContent = best.lang.toUpperCase();
    }

    resolveVoice();
    warmUp();
  }

  function resolveVoice() {
    const uri = voiceSelect.value;
    cachedVoice = voices.find(v => v.voiceURI === uri) || null;
  }

  synth.onvoiceschanged = loadVoices;
  loadVoices();
  setTimeout(loadVoices, 100);
  setTimeout(loadVoices, 400);
  setTimeout(loadVoices, 1200);

  /* ============================================================
     COUNTERS
     ============================================================ */
  function updateCounters() {
    const text = storyText.value;
    const trimmed = text.trim();
    const words = trimmed === '' ? [] : trimmed.split(/\s+/).filter(Boolean);
    wordCountEl.textContent = words.length.toLocaleString();
    charCountEl.textContent = text.length.toLocaleString();
  }

  /* ============================================================
     CHUNK SIZE — browser-aware
     Firefox: 200-300 chars (works great, no freeze)
     Chrome/Edge: 120 at ≤1.4x, tiny above
     Safari: 180
     ============================================================ */
  function maxChunkCharsFor(rateVal) {
    if (IS_FIREFOX) {
      // Firefox handles big chunks fine, even at 3x
      if (rateVal <= 1.5) return 300;
      if (rateVal <= 2.5) return 220;
      return 180;
    }
    if (IS_SAFARI) {
      if (rateVal <= 1.5) return 220;
      if (rateVal <= 2.0) return 180;
      return 140;
    }
    if (IS_CHROME_LIKE) {
      if (rateVal <= 1.0) return 180;
      if (rateVal <= 1.4) return 120;
      if (rateVal <= 1.8) return 70;
      if (rateVal <= 2.2) return 55;
      if (rateVal <= 2.6) return 45;
      return 38;
    }
    return 180;
  }

  /* ============================================================
     HINDI-AWARE CHUNKING
     ============================================================ */
  function buildChunks(text, rateVal) {
    const trimmed = text.trim();
    if (!trimmed) return [];

    const maxChars = maxChunkCharsFor(rateVal);

    const sentenceRegex = /[^।॥.!?…]+[।॥.!?…]+[\s"')\]»]*|[^।॥.!?…]+$/g;
    const sentences = trimmed.match(sentenceRegex) || [trimmed];

    const result = [];
    let wordCursor = 0;

    for (const rawSentence of sentences) {
      const sentence = rawSentence.trim();
      if (!sentence) continue;

      const pieces = splitLongSentence(sentence, maxChars);

      for (const piece of pieces) {
        const clean = piece.trim();
        if (!clean) continue;
        const wc = clean.split(/\s+/).length;
        result.push({
          text: clean,
          wordOffset: wordCursor,
          endWord: wordCursor + wc,
        });
        wordCursor += wc;
      }
    }

    return result;
  }

  function splitLongSentence(sentence, maxChars) {
    if (sentence.length <= maxChars) return [sentence];

    const softParts = sentence.split(/(?<=[,;:\u2013\u2014\-])\s+/);
    const out = [];

    for (const part of softParts) {
      if (part.length <= maxChars) {
        out.push(part);
        continue;
      }
      const words = part.split(/\s+/);
      let buf = '';
      for (const w of words) {
        if ((buf + ' ' + w).trim().length > maxChars && buf) {
          out.push(buf.trim());
          buf = w;
        } else {
          buf = (buf ? buf + ' ' : '') + w;
        }
      }
      if (buf.trim()) out.push(buf.trim());
    }
    return out;
  }

  /* ============================================================
     RATE — Firefox gets the real rate; Chrome gets capped
     ============================================================ */
  function resolveRate(requested) {
    return Math.min(requested, RATE_CAP);
  }

  /* ============================================================
     UI HELPERS
     ============================================================ */
  function setStatus(kind, badge, detail) {
    statusBadge.textContent = badge;
    statusDetail.textContent = detail;
    statusDot.className = 'status-dot';
    if (kind) statusDot.classList.add(kind);
  }

  function setPlayButtonState(state) {
    if (state === 'playing') {
      playIcon.textContent = '⏸';
      playLabel.textContent = 'Playing…';
      playBtn.classList.add('playing');
    } else if (state === 'paused') {
      playIcon.textContent = '▶';
      playLabel.textContent = 'Resume';
      playBtn.classList.remove('playing');
    } else {
      playIcon.textContent = '▶';
      playLabel.textContent = 'Start Listening';
      playBtn.classList.remove('playing');
    }
  }

  function updateChunkUI() {
    const total = chunks.length;
    const current = total ? Math.min(chunkIndex + 1, total) : 0;
    const pct = total ? Math.round((chunkIndex / total) * 100) : 0;

    seekSlider.max = total || 1;
    seekSlider.value = chunkIndex;
    seekSlider.style.setProperty('--progress', `${pct}%`);

    seekCurrent.textContent = `${current} / ${total}`;
    seekPercent.textContent = `${pct}%`;
    statusMeta.textContent = `Sentence ${current} / ${total}`;
    chunkBadge.textContent = total.toLocaleString();
  }

  function updateSpeedUI() {
    speedValue.textContent = rate.toFixed(2) + 'x';
    const pct = ((rate - 0.5) / (3 - 0.5)) * 100;
    speedSlider.style.setProperty('--progress', `${pct}%`);

    if (rate > RATE_CAP && IS_CHROME_LIKE) {
      speedValue.title = `Chrome caps at ${RATE_CAP}x · chunks auto-shrink for speed`;
    } else {
      speedValue.title = '';
    }
  }

  /* ============================================================
     QUEUE-AHEAD + SPEAK LOOP
     ============================================================ */
  function prepareNext(token) {
    nextUtterance = null;
    nextIndex = -1;

    const target = chunkIndex + 1;
    if (target >= chunks.length) return;

    const u = new SpeechSynthesisUtterance(chunks[target].text);
    u.rate = effectiveRate;
    u.lang = 'hi-IN';
    if (cachedVoice) u.voice = cachedVoice;

    nextUtterance = u;
    nextIndex = target;
  }

  function speakChunk(token) {
    if (token !== loopToken) return;

    if (chunkIndex >= chunks.length) {
      isPlaying = false;
      isPaused = false;
      currentUtterance = null;
      nextUtterance = null;
      nextIndex = -1;
      setStatus('done', 'FINISHED', 'Playback complete.');
      setPlayButtonState('idle');
      updateChunkUI();
      return;
    }

    if (!isPlaying || isPaused) return;

    const chunk = chunks[chunkIndex];
    const utter = new SpeechSynthesisUtterance(chunk.text);
    utter.rate = effectiveRate;
    utter.lang = 'hi-IN';
    if (cachedVoice) utter.voice = cachedVoice;

    currentUtterance = utter;

    const total = chunks.length;
    const current = chunkIndex + 1;
    setStatus('playing', 'PLAYING', `Reading sentence ${current} of ${total}`);
    updateChunkUI();

    utter.onend = () => {
      if (token !== loopToken) return;
      if (!isPlaying || isPaused) return;

      chunkIndex++;
      updateChunkUI();

      // Queue-ahead path: zero gap
      if (nextUtterance && nextIndex === chunkIndex) {
        const prepared = nextUtterance;
        const preparedToken = token;
        nextUtterance = null;
        nextIndex = -1;

        prepared.onend = utter.onend;
        prepared.onerror = utter.onerror;

        currentUtterance = prepared;
        try { synth.speak(prepared); } catch (_) {
          resumeTimer = setTimeout(() => {
            if (preparedToken === loopToken) speakChunk(preparedToken);
          }, 30);
        }
        prepareNext(token);
        return;
      }

      // Fallback: standard gap
      clearTimeout(resumeTimer);
      if (INTER_CHUNK_DELAY === 0) {
        speakChunk(token);
      } else {
        resumeTimer = setTimeout(() => {
          if (token === loopToken) speakChunk(token);
        }, INTER_CHUNK_DELAY);
      }
    };

    utter.onerror = (e) => {
      if (e.error === 'interrupted' || e.error === 'canceled') return;
      if (token !== loopToken) return;
      console.warn('Speech error:', e.error);
      setStatus('error', 'ERROR', `Speech error: ${e.error}`);
      stopAll();
    };

    try {
      if (synth.paused) synth.resume();
      synth.speak(utter);
    } catch (err) {
      console.error('speak() threw:', err);
      setStatus('error', 'ERROR', 'Speech engine rejected the utterance.');
      stopAll();
    }

    prepareNext(token);
  }

  /* ============================================================
     ACTIONS
     ============================================================ */
  function play() {
    if (isPaused && isPlaying) {
      isPaused = false;
      synth.resume();
      setPlayButtonState('playing');
      setStatus('playing', 'PLAYING', `Resumed at sentence ${chunkIndex + 1} of ${chunks.length}`);
      return;
    }

    if (isPlaying) return;

    const text = storyText.value.trim();
    if (!text) {
      setStatus('error', 'EMPTY', 'Please paste some text first.');
      return;
    }

    effectiveRate = resolveRate(rate);
    chunks = buildChunks(text, rate);
    if (!chunks.length) {
      setStatus('error', 'EMPTY', 'Could not split text into sentences.');
      return;
    }

    if (chunkIndex >= chunks.length) chunkIndex = 0;

    isPlaying = true;
    isPaused  = false;
    nextUtterance = null;
    nextIndex = -1;

    safeCancel();
    const token = ++loopToken;
    clearTimeout(resumeTimer);
    resumeTimer = setTimeout(() => {
      if (token === loopToken) speakChunk(token);
    }, CANCEL_DELAY);

    setPlayButtonState('playing');

    const rateInfo = rate > effectiveRate
      ? ` (engine at ${effectiveRate}x, chunks shrunk)`
      : '';
    setStatus('playing', 'PREPARING', `Loaded ${chunks.length} sentences${rateInfo}`);
    updateChunkUI();
  }

  function pause() {
    if (!isPlaying || isPaused) return;
    synth.pause();
    isPaused = true;
    setPlayButtonState('paused');
    setStatus('paused', 'PAUSED', `Paused at sentence ${chunkIndex + 1} of ${chunks.length}`);
  }

  function stopAll() {
    isPlaying = false;
    isPaused  = false;
    loopToken++;
    clearTimeout(resumeTimer);
    safeCancel();
    currentUtterance = null;
    nextUtterance = null;
    nextIndex = -1;
    chunkIndex = 0;
    setPlayButtonState('idle');
    updateChunkUI();
    setStatus(null, 'STOPPED', 'Playback stopped. Press Play to start over.');
  }

  function jumpToChunk(index) {
    if (!chunks.length) return;
    index = Math.max(0, Math.min(chunks.length - 1, index));

    const wasPlaying = isPlaying && !isPaused;

    loopToken++;
    clearTimeout(resumeTimer);
    safeCancel();
    currentUtterance = null;
    nextUtterance = null;
    nextIndex = -1;

    chunkIndex = index;
    updateChunkUI();

    if (wasPlaying) {
      isPlaying = true;
      isPaused  = false;
      const token = ++loopToken;
      setPlayButtonState('playing');
      setStatus('playing', 'PLAYING', `Jumped to sentence ${chunkIndex + 1} of ${chunks.length}`);
      resumeTimer = setTimeout(() => {
        if (token === loopToken) speakChunk(token);
      }, CANCEL_DELAY);
    } else {
      setStatus(null, 'READY', `Position: sentence ${chunkIndex + 1} of ${chunks.length}`);
    }
  }

  /* ============================================================
     WIRING
     ============================================================ */
  playBtn.addEventListener('click', play);
  pauseBtn.addEventListener('click', pause);
  stopBtn.addEventListener('click', stopAll);

  skipBackBtn.addEventListener('click', () => jumpToChunk(chunkIndex - 1));
  skipBack10Btn.addEventListener('click', () => jumpToChunk(chunkIndex - 10));
  skipFwd10Btn.addEventListener('click', () => jumpToChunk(chunkIndex + 10));
  skipFwdBtn.addEventListener('click', () => jumpToChunk(chunkIndex + 1));

  seekSlider.addEventListener('input', (e) => {
    pendingSeek = parseInt(e.target.value, 10);
    const total = chunks.length;
    const shown = Math.min(pendingSeek + 1, total);
    const pct = total ? Math.round((pendingSeek / total) * 100) : 0;
    seekSlider.style.setProperty('--progress', `${pct}%`);
    seekCurrent.textContent = `${shown} / ${total}`;
    seekPercent.textContent = `${pct}%`;
  });

  seekSlider.addEventListener('change', () => {
    if (pendingSeek !== null) {
      jumpToChunk(pendingSeek);
      pendingSeek = null;
    }
  });

  speedSlider.addEventListener('input', (e) => {
    rate = parseFloat(e.target.value);
    effectiveRate = resolveRate(rate);
    updateSpeedUI();

    if (isPlaying && !isPaused && chunks.length) {
      const text = storyText.value.trim();
      const currentChunkText = chunks[chunkIndex] ? chunks[chunkIndex].text : null;
      const rebuilt = buildChunks(text, rate);

      let newIndex = 0;
      if (currentChunkText) {
        const found = rebuilt.findIndex(c => c.text.includes(currentChunkText.slice(0, 20)));
        newIndex = found >= 0 ? found : Math.min(chunkIndex, rebuilt.length - 1);
      }

      chunks = rebuilt;
      chunkIndex = Math.max(0, Math.min(newIndex, chunks.length - 1));
      updateChunkUI();

      const token = ++loopToken;
      clearTimeout(resumeTimer);
      safeCancel();
      currentUtterance = null;
      nextUtterance = null;
      nextIndex = -1;

      const rateInfo = rate > effectiveRate ? ` · engine at ${effectiveRate}x` : '';
      setStatus('playing', 'SPEED', `Rate ${rate.toFixed(2)}x${rateInfo}`);

      resumeTimer = setTimeout(() => {
        if (token === loopToken) speakChunk(token);
      }, CANCEL_DELAY);
    }
  });

  voiceSelect.addEventListener('change', () => {
    resolveVoice();
    const v = cachedVoice;
    if (v) {
      voiceHint.textContent = `✓ Using: ${v.name} (${v.lang})`;
      voiceHint.className = 'voice-hint ok';
      engineBadge.textContent = v.lang.toUpperCase();
    }

    if (isPlaying && !isPaused && chunks.length) {
      const token = ++loopToken;
      clearTimeout(resumeTimer);
      safeCancel();
      currentUtterance = null;
      nextUtterance = null;
      nextIndex = -1;
      setStatus('playing', 'VOICE', `Voice: ${v ? v.name : 'changed'}`);
      resumeTimer = setTimeout(() => {
        if (token === loopToken) speakChunk(token);
      }, CANCEL_DELAY);
    }
  });

  let rebuildTimer = null;
  storyText.addEventListener('input', () => {
    updateCounters();

    if (!isPlaying) {
      clearTimeout(rebuildTimer);
      rebuildTimer = setTimeout(() => {
        if (!isPlaying) {
          chunks = buildChunks(storyText.value, rate);
          chunkIndex = 0;
          updateChunkUI();
          hintText.textContent = chunks.length
            ? `Ready — ${chunks.length} sentences loaded`
            : 'Ready — press Play to listen';
        }
      }, 250);
    }
  });

  storyText.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      play();
    }
  });

  window.addEventListener('beforeunload', () => {
    loopToken++;
    safeCancel();
  });

  window.addEventListener('load', () => setTimeout(warmUp, 400));

  /* INIT */
  updateCounters();
  updateSpeedUI();
  updateChunkUI();
  setStatus(null, 'READY', 'Paste Hindi text and press Play');

  chunks = buildChunks(storyText.value, rate);
  updateChunkUI();
  hintText.textContent = chunks.length
    ? `Ready — ${chunks.length} sentences loaded`
    : 'Ready — press Play to listen';

  setTimeout(() => {
    if (hindiVoices.length === 0 && voices.length > 0) {
      voiceHint.textContent =
        '⚠ No Hindi voice found. Install: Windows Settings → Time & Language → Speech → Add voices.';
      voiceHint.className = 'voice-hint error';
    }
  }, 2000);

})();