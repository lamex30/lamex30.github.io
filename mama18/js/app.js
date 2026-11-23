(() => {
  const NS = 'http://www.w3.org/2000/svg';
  const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
  const vib = (p) => navigator.vibrate && navigator.vibrate(p);

  /* ==================== ПРОЦЕДУРНЫЙ САУНД-ДИЗАЙН (ВКЛЮЧЁН ПО УМОЛЧАНИЮ) ==================== */
  let actx = null, soundOn = true, noiseBuf = null;
  let dryerNodes = null, holdNodes = null;
  const sndBtn = document.getElementById('snd');

  function ensureAudio() {
    if (!actx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      actx = new AC();
    }
    if (actx.state === 'suspended') actx.resume().catch(() => {});
    if (!noiseBuf && actx) {
      noiseBuf = actx.createBuffer(1, actx.sampleRate * 2, actx.sampleRate);
      const d = noiseBuf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    return actx;
  }

  // Авторазблокировка звука при первом касании/клике (требование браузеров)
  ['pointerdown', 'touchstart', 'keydown'].forEach((ev) => {
    addEventListener(ev, () => { if (soundOn) ensureAudio(); }, { passive: true, capture: true });
  });

  sndBtn.addEventListener('click', () => {
    soundOn = !soundOn;
    sndBtn.textContent = soundOn ? '🔊' : '🔇';
    if (soundOn) { ensureAudio(); sfx.unlock(1); }
    else { sfx.dryer(false); sfx.holdCharge(0, false); }
  });

  // Пентатоника D-мажор для шёлкового скролла и перезвонов
  const PENTA = [293.66, 329.63, 369.99, 440.00, 493.88, 587.33, 659.25, 739.99, 880.00, 987.77, 1174.66];
  let scrollNoteIdx = 2, lastBrushSfx = 0, lastCombSfx = 0, lastSteamSfx = 0, lastSliderSfx = 0;

  function tone(freq, dur = .22, vol = .06, type = 'sine', slideTo = null, delay = 0) {
    if (!soundOn) return;
    const c = ensureAudio(); if (!c || c.state !== 'running') return;
    const t0 = c.currentTime + delay;
    const o = c.createOscillator(), g = c.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t0);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
    g.gain.setValueAtTime(.0001, t0);
    g.gain.linearRampToValueAtTime(vol, t0 + Math.min(.02, dur * .25));
    g.gain.exponentialRampToValueAtTime(.0001, t0 + dur);
    o.connect(g).connect(c.destination);
    o.start(t0); o.stop(t0 + dur + .02);
  }

  function noiseBurst(dur = .1, freq = 1200, q = 1.5, vol = .05, filterType = 'bandpass', delay = 0) {
    if (!soundOn) return;
    const c = ensureAudio(); if (!c || c.state !== 'running' || !noiseBuf) return;
    const t0 = c.currentTime + delay;
    const src = c.createBufferSource(); src.buffer = noiseBuf;
    const flt = c.createBiquadFilter(); flt.type = filterType; flt.frequency.setValueAtTime(freq, t0); flt.Q.value = q;
    const g = c.createGain();
    g.gain.setValueAtTime(.0001, t0);
    g.gain.linearRampToValueAtTime(vol, t0 + Math.min(.015, dur * .2));
    g.gain.exponentialRampToValueAtTime(.0001, t0 + dur);
    src.connect(flt).connect(g).connect(c.destination);
    src.start(t0, Math.random() * .8, dur + .02);
  }

  const sfx = {
    // Необычный шёлковый перезвон на скролл
    scrollNote(dir, speed) {
      if (!soundOn) return;
      scrollNoteIdx = clamp(scrollNoteIdx + (dir > 0 ? 1 : -1), 0, PENTA.length - 1);
      if (scrollNoteIdx === 0 || scrollNoteIdx === PENTA.length - 1) {
        scrollNoteIdx = dir > 0 ? 2 : PENTA.length - 3;
      }
      const f = PENTA[scrollNoteIdx];
      const vol = clamp(.022 + speed * .001, .022, .052);
      tone(f, .28, vol, 'sine', f * 1.006);
      tone(f * 2, .14, vol * .22, 'triangle');
      if (speed > 18) noiseBurst(.07, 2600, 2.2, .016);
    },
    holdCharge(prog, active) {
      if (!active || !soundOn) {
        if (holdNodes) {
          try { holdNodes.g.gain.exponentialRampToValueAtTime(.0001, actx.currentTime + .08); holdNodes.o.stop(actx.currentTime + .1); } catch {}
          holdNodes = null;
        }
        return;
      }
      const c = ensureAudio(); if (!c || c.state !== 'running') return;
      if (!holdNodes) {
        const o = c.createOscillator(), g = c.createGain();
        o.type = 'sine'; o.frequency.value = 180;
        g.gain.value = .001; g.gain.linearRampToValueAtTime(.06, c.currentTime + .12);
        o.connect(g).connect(c.destination); o.start();
        holdNodes = { o, g };
      }
      holdNodes.o.frequency.setTargetAtTime(180 + prog * 360, c.currentTime, .05);
    },
    stamp() {
      tone(150, .18, .2, 'triangle', 42);
      noiseBurst(.12, 480, .8, .12, 'lowpass');
      tone(587.33, .35, .07, 'sine', 880, .08);
    },
    brush() {
      const now = performance.now();
      if (now - lastBrushSfx < 65) return;
      lastBrushSfx = now;
      noiseBurst(.09, 1700 + Math.random() * 800, 2.5, .035);
      if (Math.random() < .45) {
        const f = PENTA[6 + Math.floor(Math.random() * 5)] * 1.5;
        tone(f, .14, .022, 'sine');
      }
    },
    combTick() {
      const now = performance.now();
      if (now - lastCombSfx < 55) return;
      lastCombSfx = now;
      const f = 520 + Math.random() * 340;
      tone(f, .05, .032, 'triangle', f * .7);
      noiseBurst(.04, 3000, 3, .018);
    },
    bead(i) {
      const f = PENTA[i % PENTA.length];
      tone(f, .35, .055, 'sine');
      tone(f * 1.5, .22, .02, 'triangle', null, .04);
    },
    colorWash() {
      noiseBurst(.18, 1900, 1.8, .024);
      tone(659.25, .25, .028, 'sine', 739.99);
    },
    sliderTick() {
      const now = performance.now();
      if (now - lastSliderSfx < 48) return;
      lastSliderSfx = now;
      tone(740 + Math.random() * 140, .03, .03, 'triangle', 460);
    },
    coin(level = 0) {
      const base = 1050 + level * 7 + Math.random() * 180;
      tone(base, .12, .055, 'sine');
      tone(base * 1.25, .2, .05, 'sine', null, .045);
    },
    goldFanfare() {
      [587.33, 739.99, 880, 1174.66, 1479.98].forEach((f, i) => {
        tone(f, .55, .065, 'sine', null, i * .07);
        tone(f * 2, .3, .02, 'triangle', null, i * .07 + .02);
      });
    },
    steam() {
      const now = performance.now();
      if (now - lastSteamSfx < 90) return;
      lastSteamSfx = now;
      noiseBurst(.18, 3400, 1.2, .042, 'highpass');
    },
    chordNote(i) {
      const notes = [440, 554.37, 659.25];
      const f = notes[i % 3];
      tone(f, .5, .07, 'sine');
      tone(f * 1.5, .35, .025, 'triangle', null, .05);
    },
    cordPull() {
      tone(280, .06, .03, 'triangle', 360);
    },
    lampSwitch() {
      tone(620, .03, .09, 'square', 220);
      noiseBurst(.03, 2400, 1, .06);
      [329.63, 440, 554.37, 659.25].forEach((f, i) => tone(f, .7, .045, 'sine', null, .06 + i * .045));
    },
    pop() {
      const f = 190 + Math.random() * 90;
      tone(f, .075, .13, 'sine', f * 3.8);
      noiseBurst(.045, 1600, 1.5, .05);
    },
    tear() {
      for (let i = 0; i < 6; i++) noiseBurst(.05, 2200 + i * 260, 1.4, .055, 'bandpass', i * .035);
    },
    dryer(on, proximity = 0) {
      if (!on || !soundOn) {
        if (dryerNodes) {
          try {
            dryerNodes.g.gain.exponentialRampToValueAtTime(.0001, actx.currentTime + .12);
            dryerNodes.src.stop(actx.currentTime + .15);
            dryerNodes.hum.stop(actx.currentTime + .15);
          } catch {}
          dryerNodes = null;
        }
        return;
      }
      const c = ensureAudio(); if (!c || c.state !== 'running' || !noiseBuf) return;
      if (!dryerNodes) {
        const src = c.createBufferSource(); src.buffer = noiseBuf; src.loop = true;
        const flt = c.createBiquadFilter(); flt.type = 'bandpass'; flt.frequency.value = 520; flt.Q.value = .85;
        const hum = c.createOscillator(); hum.type = 'sine'; hum.frequency.value = 145;
        const hg = c.createGain(); hg.gain.value = .025;
        const g = c.createGain(); g.gain.value = .001; g.gain.linearRampToValueAtTime(.085, c.currentTime + .12);
        src.connect(flt).connect(g).connect(c.destination);
        hum.connect(hg).connect(c.destination);
        src.start(); hum.start();
        dryerNodes = { src, flt, hum, g };
      }
      dryerNodes.flt.frequency.setTargetAtTime(480 + proximity * 520, c.currentTime, .06);
      dryerNodes.hum.frequency.setTargetAtTime(145 + proximity * 45, c.currentTime, .06);
    },
    candleOut() {
      noiseBurst(.16, 1500, 2.2, .055);
      tone(520, .14, .035, 'sine', 240);
    },
    cardSwipe() {
      noiseBurst(.14, 1400, 1.1, .055);
      tone(420, .12, .03, 'sine', 640);
    },
    lockedKnock() {
      tone(190, .06, .08, 'triangle', 120);
      tone(160, .06, .06, 'triangle', 100, .08);
    },
    unlock(n = 1) {
      const base = 440 + (n % 5) * 44;
      [1, 1.25, 1.5, 2].forEach((m, i) => tone(base * m, .42, .05, 'sine', null, i * .055));
    },
    confetti() {
      noiseBurst(.12, 1100, .7, .12);
      for (let i = 0; i < 7; i++) {
        const f = PENTA[3 + Math.floor(Math.random() * 8)];
        tone(f, .35, .045, 'sine', f * 1.1, .04 + i * .05);
      }
    }
  };

  /* ==================== СИСТЕМА ГЕЙТОВ (БЛОКИРОВКА СКРОЛЛА) ==================== */
  const TOTAL_GATES = 10;
  let unlockedGate = 0;
  const gateHooks = {};

  function unlockGate(n) {
    if (n <= unlockedGate) return;
    unlockedGate = n;
    sfx.unlock(n);
    vib([20, 30, 20]);

    const status = document.querySelector(`[data-gate-status="${n}"]`);
    if (status) {
      status.classList.add('unlocked');
      status.textContent = '✨ Готово! Листай дальше ↓';
    }

    const revealed = document.querySelectorAll(`[data-stage="${n}"]`);
    revealed.forEach((sec) => {
      sec.classList.remove('gated-hidden');
      sec.classList.add('gate-reveal');
      sec.querySelectorAll('.rv').forEach((el) => rio.observe(el));
    });

    if (gateHooks[n]) {
      requestAnimationFrame(() => gateHooks[n]());
    }
  }

  let lastNudge = 0;
  function nudgeCurrentGate() {
    if (unlockedGate >= TOTAL_GATES) return;
    const atBottom = scrollY + innerHeight >= document.documentElement.scrollHeight - 24;
    if (!atBottom) return;
    const now = performance.now();
    if (now - lastNudge < 700) return;
    lastNudge = now;
    const st = document.querySelector(`[data-gate-status="${unlockedGate + 1}"]`);
    if (st) {
      st.classList.remove('nudge');
      void st.offsetWidth;
      st.classList.add('nudge');
      sfx.lockedKnock();
      vib(15);
    }
  }
  addEventListener('wheel', (e) => { if (e.deltaY > 0) nudgeCurrentGate(); }, { passive: true });
  let touchStartY = 0;
  addEventListener('touchstart', (e) => { touchStartY = e.touches[0].clientY; }, { passive: true });
  addEventListener('touchmove', (e) => {
    if (touchStartY - e.touches[0].clientY > 30) nudgeCurrentGate();
  }, { passive: true });

  /* ==================== СЦЕНА 0: ТАЛОН НА ЗАПИСЬ ==================== */
  const intro = document.getElementById('intro');
  const holdBtn = document.getElementById('holdBtn');
  const holdRing = document.getElementById('holdRing');
  const stamp = document.getElementById('stamp');
  let holdProg = 0, holding = false, introDone = false;

  const startHold = (e) => {
    e.preventDefault();
    if (introDone) return;
    ensureAudio();
    holding = true;
    holdBtn.classList.add('on', 'shake');
  };
  const endHold = () => {
    holding = false;
    holdBtn.classList.remove('on', 'shake');
    sfx.holdCharge(0, false);
  };
  holdBtn.addEventListener('pointerdown', startHold);
  ['pointerup', 'pointerleave', 'pointercancel'].forEach((ev) => holdBtn.addEventListener(ev, endHold));
  holdBtn.addEventListener('contextmenu', (e) => e.preventDefault());

  (function holdLoop() {
    if (!introDone) {
      holdProg = holding ? Math.min(1, holdProg + .015) : Math.max(0, holdProg - .025);
      holdRing.style.strokeDashoffset = 408 * (1 - holdProg);
      if (holding) {
        sfx.holdCharge(holdProg, true);
        if (Math.random() < .12) vib(8);
      }
      if (holdProg >= 1) {
        introDone = true;
        endHold();
        stamp.classList.add('hit');
        sfx.stamp();
        vib(100);
        holdBtn.innerHTML = '✓';
        holdBtn.style.fontSize = '42px';
        document.getElementById('holdHint').textContent = 'Добро пожаловать в салон ✨';
        setTimeout(() => {
          document.documentElement.classList.remove('locked');
          intro.classList.add('gone');
          drawAge();
          setTimeout(() => { intro.style.display = 'none'; }, 1300);
        }, 750);
      }
      requestAnimationFrame(holdLoop);
    }
  })();

  /* ==================== REVEAL ПРИ СКРОЛЛЕ ==================== */
  document.querySelectorAll('.words-rv').forEach((p) => {
    p.innerHTML = p.textContent.trim().split(/\s+/).map((w, i) =>
      `<span style="transition-delay:${i * 45}ms">${w}</span>`
    ).join(' ');
  });
  const rio = new IntersectionObserver((entries) => {
    entries.forEach((e) => {
      if (e.isIntersecting) {
        e.target.classList.add('in');
        rio.unobserve(e.target);
      }
    });
  }, { threshold: .22 });
  document.querySelectorAll('[data-stage="0"] .rv').forEach((el) => rio.observe(el));

  // Фикс табло "1 → 2 → 3-й десяток": наблюдаем за самой карточкой #decadeStat
  const rollEl = document.getElementById('roll');
  const decadeStat = document.getElementById('decadeStat');
  let rolled = false;
  const rollIO = new IntersectionObserver((entries) => {
    entries.forEach((e) => {
      if (e.isIntersecting && !rolled) {
        rolled = true;
        rollEl.style.transform = 'translateY(-96px)';
        sfx.bead(4);
        setTimeout(() => sfx.bead(6), 350);
        setTimeout(() => sfx.bead(8), 700);
        rollIO.unobserve(decadeStat);
      }
    });
  }, { threshold: .35 });

  /* ==================== СЦЕНА 1: ОБЛОЖКА + ВОЛНЫ + ПРОГРЕСС ==================== */
  const wv = document.getElementById('waves');
  const wpaths = [], wcols = ['#e8b4a0', '#b76e79', '#d4949a', '#c98a7d', '#f0c9b9', '#a65e6d'];
  for (let i = 0; i < 16; i++) {
    const p = document.createElementNS(NS, 'path');
    p.setAttribute('fill', 'none');
    p.setAttribute('stroke', wcols[i % 6]);
    p.setAttribute('stroke-width', 1 + Math.random() * 2.4);
    p.setAttribute('opacity', .28 + Math.random() * .38);
    wv.appendChild(p);
    wpaths.push({ p, ph: Math.random() * 6, y: .08 + i * .055, a: 14 + Math.random() * 24 });
  }

  const title = document.getElementById('title');
  const letters = [];
  function splitText(el) {
    [...el.childNodes].forEach((n) => {
      if (n.nodeType === 3) {
        const frag = document.createDocumentFragment();
        [...n.textContent].forEach((ch) => {
          const s = document.createElement('span');
          s.textContent = ch === ' ' ? '\u00a0' : ch;
          s.dataset.dx = (Math.random() - .5) * 280;
          s.dataset.dy = -Math.random() * 190 - 40;
          s.dataset.r = (Math.random() - .5) * 80;
          letters.push(s);
          frag.appendChild(s);
        });
        n.replaceWith(frag);
      } else if (n.nodeName !== 'BR') {
        splitText(n);
      }
    });
  }
  splitText(title);

  (function buildProg() {
    let d = 'M9 0';
    for (let y = 0; y < 1000; y += 50) d += ` Q${(y / 50) % 2 ? 15 : 3} ${y + 25} 9 ${y + 50}`;
    document.getElementById('progBg').setAttribute('d', d);
    document.getElementById('progP').setAttribute('d', d);
  })();
  const progP = document.getElementById('progP');
  const progLen = progP.getTotalLength();
  progP.style.strokeDasharray = progLen;

  /* ==================== СЦЕНА 2: СКОЛЬКО ТЕБЕ ЛЕТ? (GATE 1) ==================== */
  const ageWrap = document.getElementById('ageWrap');
  const ageUnder = document.getElementById('ageUnder');
  const ageOver = document.getElementById('ageOver');
  const uc = ageUnder.getContext('2d'), oc = ageOver.getContext('2d');
  const brush = document.getElementById('brush');
  let ageW = 0, ageH = 0, ageDpr = 1, agePainting = false, ageDone = false, ageLast = null, ageBase = 0;

  function drawAge() {
    if (ageDone) return;
    ageDpr = devicePixelRatio || 1;
    ageW = ageWrap.clientWidth;
    ageH = ageWrap.clientHeight;
    if (!ageW || !ageH) return;
    [ageUnder, ageOver].forEach((c) => { c.width = ageW * ageDpr; c.height = ageH * ageDpr; });
    uc.setTransform(ageDpr, 0, 0, ageDpr, 0, 0);
    oc.setTransform(ageDpr, 0, 0, ageDpr, 0, 0);

    uc.clearRect(0, 0, ageW, ageH);
    const g = uc.createLinearGradient(0, 0, ageW, ageH);
    g.addColorStop(0, '#7a3b4f'); g.addColorStop(.35, '#e8b4a0');
    g.addColorStop(.55, '#b76e79'); g.addColorStop(.8, '#f0c9b9'); g.addColorStop(1, '#7a3b4f');
    uc.fillStyle = g;
    uc.textAlign = 'center'; uc.textBaseline = 'middle';
    uc.font = `500 ${ageH * .88}px "Cormorant Infant", serif`;
    uc.fillText('18', ageW / 2, ageH / 2 + ageH * .04);

    oc.globalCompositeOperation = 'source-over';
    const og = oc.createLinearGradient(0, 0, ageW, ageH);
    og.addColorStop(0, '#5a3545'); og.addColorStop(.5, '#7a4a5c'); og.addColorStop(1, '#4a2a38');
    oc.fillStyle = og;
    oc.beginPath();
    oc.roundRect(0, 0, ageW, ageH, 28);
    oc.fill();

    oc.fillStyle = 'rgba(247,233,228,.22)';
    oc.textAlign = 'center'; oc.textBaseline = 'middle';
    oc.font = `italic 300 ${ageH * .45}px "Cormorant Infant", serif`;
    oc.fillText('? ?', ageW / 2, ageH / 2);

    ageBase = 0;
  }
  document.fonts.ready.then(drawAge);
  addEventListener('resize', () => { if (!ageDone) drawAge(); });

  function agePos(e) {
    const r = ageWrap.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }
  function paintAge(p) {
    oc.globalCompositeOperation = 'destination-out';
    oc.lineCap = 'round';
    oc.lineWidth = Math.max(42, ageW * .14);
    oc.beginPath();
    oc.moveTo((ageLast || p).x, (ageLast || p).y);
    oc.lineTo(p.x, p.y);
    oc.stroke();
    ageLast = p;
    sfx.brush();
    if (Math.random() < .65) {
      const r = ageWrap.getBoundingClientRect();
      const s = document.createElement('i');
      s.style.cssText = `position:fixed;left:${r.left + p.x}px;top:${r.top + p.y}px;width:5px;height:5px;border-radius:50%;background:#e8b4a0;box-shadow:0 0 8px #b76e79;pointer-events:none;z-index:75;transition:.9s ease-out`;
      document.body.appendChild(s);
      requestAnimationFrame(() => {
        s.style.transform = `translate(${(Math.random() - .5) * 70}px,${(Math.random() - .2) * 70}px)`;
        s.style.opacity = 0;
      });
      setTimeout(() => s.remove(), 950);
    }
  }
  function checkAge() {
    if (ageDone || !ageOver.width) return;
    const x0 = Math.floor(ageOver.width * .18), y0 = Math.floor(ageOver.height * .18);
    const w = Math.floor(ageOver.width * .64), h = Math.floor(ageOver.height * .64);
    const d = oc.getImageData(x0, y0, w, h).data;
    let left = 0;
    for (let i = 3; i < d.length; i += 24) if (d[i] > 40) left++;
    if (!ageBase) ageBase = left || 1;
    if (left < ageBase * .58) {
      ageDone = true;
      ageOver.style.transition = 'opacity .9s';
      ageOver.style.opacity = 0;
      brush.style.opacity = 0;
      document.getElementById('ageHint').classList.add('hidden');
      document.getElementById('ageDone').classList.add('show');
      unlockGate(1);
    }
  }
  ageWrap.addEventListener('pointerdown', (e) => {
    if (ageDone) return;
    if (!ageBase) checkAge();
    agePainting = true; ageLast = null;
    ageWrap.setPointerCapture(e.pointerId);
    paintAge(agePos(e));
  });
  ageWrap.addEventListener('pointermove', (e) => {
    brush.style.left = e.clientX + 'px';
    brush.style.top = e.clientY + 'px';
    if (!ageDone && e.pointerType === 'mouse') brush.style.opacity = 1;
    if (agePainting && !ageDone) {
      paintAge(agePos(e));
      if (Math.random() < .15) checkAge();
    }
  });
  ageWrap.addEventListener('pointerup', () => { agePainting = false; checkAge(); });
  ageWrap.addEventListener('pointerleave', () => { brush.style.opacity = 0; });

  /* ==================== СЦЕНА 3: РАСПУТАЙ ПРЯДИ (GATE 2) ==================== */
  const combArea = document.getElementById('combArea');
  const tc = document.getElementById('tangle'), tx = tc.getContext('2d');
  const combCur = document.getElementById('combCur');
  const combProg = document.getElementById('combProg');
  let tw = 0, th = 0, hair = [], combDown = false, combed = false, startTangle = 1;
  const ROWS = 22;

  function initTangle() {
    if (combed) return;
    const d = devicePixelRatio || 1;
    tw = combArea.clientWidth; th = combArea.clientHeight;
    if (!tw || !th) return;
    tc.width = tw * d; tc.height = th * d;
    tx.setTransform(d, 0, 0, d, 0, 0);
    hair = [];
    const n = Math.floor(tw / 7);
    const cols = ['#b76e79', '#e8b4a0', '#7a3b4f', '#d4949a', '#c98a7d', '#a65e6d'];
    for (let i = 0; i < n; i++) {
      hair.push({
        x: i * tw / n + 3,
        c: cols[i % cols.length],
        seed: Math.random() * 100,
        amp: Array.from({ length: ROWS }, () => 26 + Math.random() * 34),
        off: 0
      });
    }
    startTangle = drawTangle() || 1;
  }
  function drawTangle() {
    tx.clearRect(0, 0, tw, th);
    let total = 0;
    for (const h of hair) {
      tx.beginPath();
      tx.moveTo(h.x + h.off, 0);
      for (let j = 0; j <= ROWS; j++) {
        const a = h.amp[Math.min(j, ROWS - 1)];
        total += a;
        const y = j / ROWS * th;
        const x = h.x + h.off + Math.sin(h.seed + j * 1.6) * a + Math.cos(h.seed * 2 + j * 2.2) * a * .55;
        tx.lineTo(x, y);
      }
      tx.strokeStyle = h.c;
      tx.lineWidth = 2.5;
      tx.globalAlpha = .92;
      tx.stroke();
    }
    tx.globalAlpha = 1;
    return total;
  }
  function combAt(x, y) {
    for (const h of hair) {
      if (Math.abs(h.x - x) < 64) {
        const j = Math.floor(y / th * ROWS);
        for (let k = j - 3; k <= j + 3; k++) {
          if (h.amp[k] !== undefined) h.amp[k] *= .78;
        }
      }
    }
  }
  function finishComb() {
    combed = true;
    combCur.style.opacity = 0;
    document.getElementById('combHint').textContent = '✨ Идеальная укладка!';
    document.getElementById('combHint').classList.remove('pulse');
    const t0 = performance.now();
    (function part(t) {
      const k = Math.min(1, (t - t0) / 1100), e = k * k * (3 - 2 * k);
      hair.forEach((h) => {
        h.amp = h.amp.map((a) => a * .85);
        h.off = (h.x < tw / 2 ? -1 : 1) * e * tw * .62;
      });
      drawTangle();
      if (k < 1) requestAnimationFrame(part);
    })(t0);
    unlockGate(2);
  }
  combArea.addEventListener('pointerdown', (e) => {
    combDown = true;
    combArea.setPointerCapture(e.pointerId);
  });
  combArea.addEventListener('pointerup', () => { combDown = false; });
  combArea.addEventListener('pointerleave', () => { combCur.style.opacity = 0; });
  combArea.addEventListener('pointermove', (e) => {
    combCur.style.left = e.clientX + 'px';
    combCur.style.top = e.clientY + 'px';
    if (e.pointerType === 'mouse') combCur.style.opacity = combed ? 0 : 1;
    if ((!combDown && e.pointerType !== 'mouse') || combed) return;
    const r = combArea.getBoundingClientRect();
    combAt(e.clientX - r.left, e.clientY - r.top);
    sfx.combTick();
    const tot = drawTangle();
    const pr = 1 - tot / startTangle;
    combProg.style.width = Math.min(100, pr / .62 * 100) + '%';
    if (pr > .62) finishComb();
  });
  gateHooks[1] = () => initTangle();

  /* ==================== СЦЕНА 4: ТРЕТИЙ ДЕСЯТОК (ТАЙМЛАЙН) ==================== */
  const track = document.getElementById('track');
  const tlsvg = document.getElementById('tlsvg');
  const tlpath = document.getElementById('tlpath');
  const tlbg = document.getElementById('tlbg');
  const events = [
    ['✂️', 'Первые ножницы', 'с них всё началось'],
    ['💁‍♀️', 'Первые клиентки', 'и первые «вау!»'],
    ['🌧', 'Сложности', 'были, куда без них'],
    ['🎉', 'Весёлые дни', 'их было гораздо больше'],
    ['🎨', 'Любовь к цвету', 'так появился колорист'],
    ['✨', 'Свой почерк', 'работу узнают с первого взгляда'],
    ['💛', 'Сейчас', 'третий десяток в любимом деле — и всё ещё 18 😉']
  ];
  let tlLen = 1, lastLitBead = -1;
  const evEls = [];

  function buildTL() {
    const TW = track.clientWidth, TH = track.clientHeight;
    if (!TW || !TH) return;
    tlsvg.setAttribute('viewBox', `0 0 ${TW} ${TH}`);
    let d = `M${TW / 2} 0`;
    for (let y = 0; y < TH; y += 150) {
      const s = (y / 150) % 2 ? 1 : -1;
      d += ` Q${TW / 2 + s * 40} ${y + 75} ${TW / 2} ${y + 150}`;
    }
    tlpath.setAttribute('d', d);
    tlbg.setAttribute('d', d);
    tlLen = tlpath.getTotalLength() || 1;
    tlpath.style.strokeDasharray = tlLen;
    evEls.forEach((e) => e.remove());
    evEls.length = 0;
    events.forEach(([ic, t, s], i) => {
      const top = (i + .5) / events.length * TH;
      const ev = document.createElement('div');
      ev.className = 'ev ' + (i % 2 ? 'r' : 'l');
      ev.style.top = (top - 40) + 'px';
      ev.innerHTML = `<div class="ic">${ic}</div><b>${t}</b><span>${s}</span>`;
      const dot = document.createElement('div');
      dot.className = 'dot';
      dot.style.top = top + 'px';
      track.append(ev, dot);
      evEls.push(ev, dot);
      ev.dataset.f = dot.dataset.f = top / TH;
      ev.dataset.idx = dot.dataset.idx = i;
    });
  }
  gateHooks[2] = () => {
    buildTL();
    rollIO.observe(decadeStat);
  };
  addEventListener('resize', () => { if (unlockedGate >= 2) buildTL(); });

  /* ==================== СЦЕНА 5: ГАЛЕРЕЯ РАБОТ + ЛАЙТБОКС ==================== */
  const workCaps = [
    'Блонд, о котором мечтают',
    'Каре с характером',
    'Пикси — смело и стильно',
    'Шёлк вместо волос',
    'Длина, которой завидуют',
    'Переход цвета без единого шва'
  ];
  const strip = document.getElementById('strip');
  const worksSec = document.getElementById('works');
  workCaps.forEach((cap, i) => {
    const d = document.createElement('div');
    d.className = 'card';
    d.innerHTML = `<div class="ph"><img src="assets/works/work-${i + 1}.jpg" alt="${cap}" loading="lazy"></div><p>${cap}</p>`;
    d.addEventListener('click', () => { sfx.cardSwipe(); openLB(i); });
    strip.appendChild(d);
  });
  const workCards = [...strip.children];
  let lastCenteredWork = -1;

  const lb = document.getElementById('lightbox');
  const lbImg = document.getElementById('lbImg');
  const lbCap = document.getElementById('lbCap');
  let lbIdx = 0;
  function showLB(i) {
    lbIdx = (i + workCaps.length) % workCaps.length;
    lbImg.src = `assets/works/work-${lbIdx + 1}.jpg`;
    lbCap.textContent = workCaps[lbIdx];
  }
  function openLB(i) { showLB(i); lb.classList.add('on'); }
  function closeLB() { lb.classList.remove('on'); }
  document.getElementById('lbClose').addEventListener('click', closeLB);
  document.getElementById('lbPrev').addEventListener('click', () => { sfx.cardSwipe(); showLB(lbIdx - 1); });
  document.getElementById('lbNext').addEventListener('click', () => { sfx.cardSwipe(); showLB(lbIdx + 1); });
  lb.addEventListener('click', (e) => { if (e.target === lb) closeLB(); });
  let lbX = 0;
  lb.addEventListener('pointerdown', (e) => { lbX = e.clientX; });
  lb.addEventListener('pointerup', (e) => {
    const dx = e.clientX - lbX;
    if (Math.abs(dx) > 50) { sfx.cardSwipe(); showLB(lbIdx + (dx < 0 ? 1 : -1)); }
  });

  /* ==================== СЦЕНА 6: НАЙДИ 10 ОТЛИЧИЙ (GATE 3) ==================== */
  const diffBox = document.getElementById('diffBox');
  const diffTop = document.getElementById('diffTop');
  const diffHandle = document.getElementById('diffHandle');
  let diffDrag = false, diffMoved = 0, diffLastP = .5, diffDone = false;

  function setDiff(p) {
    p = clamp(p, .04, .96);
    diffTop.style.clipPath = `inset(0 ${(1 - p) * 100}% 0 0)`;
    diffHandle.style.left = p * 100 + '%';
    const delta = Math.abs(p - diffLastP);
    if (delta > .015) sfx.sliderTick();
    diffMoved += delta;
    diffLastP = p;
    if (!diffDone && diffMoved > .45) {
      diffDone = true;
      document.getElementById('diffHint').classList.add('hidden');
      document.getElementById('diffTxt').classList.add('show');
      unlockGate(3);
    }
  }
  diffBox.addEventListener('pointerdown', (e) => {
    diffDrag = true;
    diffBox.setPointerCapture(e.pointerId);
    const r = diffBox.getBoundingClientRect();
    setDiff((e.clientX - r.left) / r.width);
  });
  diffBox.addEventListener('pointermove', (e) => {
    if (!diffDrag) return;
    const r = diffBox.getBoundingClientRect();
    setDiff((e.clientX - r.left) / r.width);
  });
  diffBox.addEventListener('pointerup', () => { diffDrag = false; });

  /* ==================== СЦЕНА 7: ПРАЙС И ЗОЛОТО (GATE 4) ==================== */
  const flipEl = document.getElementById('flip');
  const mults = [10, 20, 30];
  let fi = 0;
  setInterval(() => {
    fi = (fi + 1) % 3;
    flipEl.innerHTML = `<span>${mults[fi]}</span>`;
  }, 1300);

  let goldLevel = 0, goldFlooded = false;
  const goldMeter = document.getElementById('goldMeter');
  const multBadge = document.getElementById('multBadge');
  const priceVals = [...document.querySelectorAll('.prow b')];
  const floodEl = document.getElementById('flood');

  function spawnCoin() {
    const c = document.createElement('i');
    c.className = 'coin';
    c.style.left = Math.random() * 100 + 'vw';
    document.body.appendChild(c);
    const dur = 1100 + Math.random() * 1100, rot = Math.random() * 720;
    c.animate(
      [{ transform: 'translateY(0) rotateY(0)' }, { transform: `translateY(110vh) rotateY(${rot}deg)` }],
      { duration: dur, easing: 'cubic-bezier(.4,0,.8,.6)' }
    ).onfinish = () => c.remove();
  }

  document.getElementById('raiseBtn').addEventListener('pointerdown', () => {
    if (goldFlooded) return;
    goldLevel = Math.min(100, goldLevel + 8.5);
    const m = goldLevel < 34 ? 10 : goldLevel < 67 ? 20 : 30;
    multBadge.textContent = '×' + m;
    multBadge.classList.add('on', 'bump');
    setTimeout(() => multBadge.classList.remove('bump'), 140);
    sfx.coin(goldLevel);
    vib(12);
    for (let i = 0; i < 3; i++) spawnCoin();

    if (goldLevel >= 100) {
      goldFlooded = true;
      sfx.goldFanfare();
      priceVals.forEach((b) => {
        b.classList.remove('blur');
        b.textContent = b.dataset.final;
      });
      document.getElementById('priceHint').textContent = '💰 Максимальный уровень роскоши!';
      floodEl.classList.add('on');
      let n = 0;
      const t = setInterval(() => { spawnCoin(); spawnCoin(); if (++n > 45) clearInterval(t); }, 55);
    }
  });
  setInterval(() => {
    if (!goldFlooded && goldLevel > 0) goldLevel = Math.max(0, goldLevel - 1.7);
    goldMeter.style.width = goldLevel + '%';
  }, 60);
  document.getElementById('floodClose').addEventListener('click', () => {
    floodEl.classList.remove('on');
    unlockGate(4);
  });

  /* ==================== СЦЕНА 8: ГЛАДКО С ПАШЕЙ (GATE 5) ==================== */
  const ironStage = document.getElementById('ironStage');
  const ironSvg = document.getElementById('ironStrand');
  const ironEl = document.getElementById('iron');
  const words3 = [...document.querySelectorAll('.words3 span')];
  const sCols = ['#7a3b4f', '#b76e79', '#a65e6d', '#c98a7d', '#8e4a5c', '#d4949a', '#b76e79'];
  const ironPaths = [];
  for (const c of sCols) {
    const p = document.createElementNS(NS, 'path');
    p.setAttribute('fill', 'none'); p.setAttribute('stroke', c);
    p.setAttribute('stroke-width', 3); p.setAttribute('stroke-linecap', 'round');
    ironSvg.appendChild(p);
    ironPaths.push(p);
  }
  const gloss = document.createElementNS(NS, 'path');
  gloss.setAttribute('fill', 'none'); gloss.setAttribute('stroke', '#fff');
  gloss.setAttribute('stroke-width', 3); gloss.setAttribute('stroke-linecap', 'round');
  ironSvg.appendChild(gloss);

  let ix = 36, maxIX = 36, ironDrag = false, ironDone = false, wordsLit = 0;
  ironEl.style.left = ix + 'px';

  function drawIronStrand(t) {
    if (unlockedGate < 4) return;
    const W = ironStage.clientWidth, H = ironStage.clientHeight;
    if (!W) return;
    const mid = H / 2;
    ironPaths.forEach((p, i) => {
      let d = '';
      const off = (i - 3) * 4;
      for (let x = 0; x <= W; x += 6) {
        const k = clamp((x - maxIX) / 40);
        const curl = (Math.sin(x / 14 + i * .9 + t / 700) * 26 + Math.cos(x / 9 + i * 1.7) * 12) * k;
        d += (x ? 'L' : 'M') + x + ' ' + (mid + off + curl).toFixed(1);
      }
      p.setAttribute('d', d);
    });
    const gx = Math.max(0, maxIX - 55);
    gloss.setAttribute('d', `M${Math.max(0, gx - 120)} ${mid - 6} L${gx} ${mid - 6}`);
    gloss.setAttribute('opacity', maxIX > 100 ? .65 : 0);
  }
  function spawnSteam(x) {
    const s = document.createElement('i');
    s.className = 'steam';
    s.style.left = x + 'px'; s.style.top = '42%';
    ironStage.appendChild(s);
    s.animate(
      [{ transform: 'translate(0,0) scale(1)', opacity: .9 },
       { transform: `translate(${(Math.random() - .5) * 30}px,-75px) scale(3)`, opacity: 0 }],
      { duration: 850 }
    ).onfinish = () => s.remove();
  }
  ironEl.addEventListener('pointerdown', (e) => {
    ironDrag = true;
    ironEl.setPointerCapture(e.pointerId);
  });
  ironEl.addEventListener('pointerup', () => { ironDrag = false; });
  ironEl.addEventListener('pointermove', (e) => {
    if (!ironDrag) return;
    const r = ironStage.getBoundingClientRect();
    ix = clamp(e.clientX - r.left, 30, r.width - 14);
    ironEl.style.left = ix + 'px';
    if (ix > maxIX) {
      maxIX = ix;
      sfx.steam();
      if (Math.random() < .42) spawnSteam(ix);
    }
    const f = maxIX / r.width;
    words3.forEach((w, i) => {
      const shouldOn = f > (i + 1) * .28;
      if (shouldOn && wordsLit <= i) {
        wordsLit = i + 1;
        sfx.chordNote(i);
      }
      w.classList.toggle('on', shouldOn);
    });
    if (f > .88 && !ironDone) {
      ironDone = true;
      document.getElementById('pair').classList.add('on');
      document.getElementById('ironAfter').classList.add('on');
      document.getElementById('ironHint').textContent = '✨ Идеально гладко!';
      document.getElementById('ironHint').classList.remove('pulse');
      unlockGate(5);
    }
  });

  /* ==================== СЦЕНА 9A: ДОМ И ШНУРОК (GATE 6) ==================== */
  const kino = document.getElementById('kino');
  const room = document.getElementById('room');
  const darkEl = document.getElementById('dark');
  const cord = document.getElementById('cord');
  const cordStr = document.getElementById('cordStr');
  const cordBead = document.getElementById('cordBead');
  const cordHint = document.getElementById('cordHint');
  let cordDrag = false, cordY0 = 0, roomLit = false, cordLastDy = 0;

  cordBead.addEventListener('pointerdown', (e) => {
    if (roomLit) return;
    cordDrag = true;
    cordY0 = e.clientY;
    cordLastDy = 0;
    cordBead.setPointerCapture(e.pointerId);
  });
  cordBead.addEventListener('pointermove', (e) => {
    if (!cordDrag || roomLit) return;
    const dy = clamp(e.clientY - cordY0, 0, 120);
    cordStr.style.height = `calc(34vh + ${dy}px)`;
    if (dy - cordLastDy > 18) { cordLastDy = dy; sfx.cordPull(); }
    if (dy > 62) {
      roomLit = true;
      cordDrag = false;
      sfx.lampSwitch();
      vib(40);
      kino.classList.add('lit');
      room.classList.add('lit');
      cordHint.classList.remove('show');
      cordStr.style.transition = 'height .5s cubic-bezier(.3,1.8,.5,1)';
      cordStr.style.height = '34vh';
      unlockGate(6);
    }
  });
  cordBead.addEventListener('pointerup', () => {
    if (!cordDrag) return;
    cordDrag = false;
    cordStr.style.transition = 'height .4s cubic-bezier(.3,1.8,.5,1)';
    cordStr.style.height = '34vh';
    setTimeout(() => { cordStr.style.transition = ''; }, 420);
  });

  /* ==================== СЦЕНА 9B: ПОПКОРН (GATE 7) ==================== */
  const pan = document.getElementById('pan');
  const popCountEl = document.getElementById('popCount');
  const bucketFill = document.getElementById('bucketFill');
  let popped = 0;
  const POP_GOAL = 15;

  function initPopcorn() {
    if (pan.querySelector('.kernel')) return;
    for (let i = 0; i < 20; i++) {
      const k = document.createElement('button');
      k.type = 'button';
      k.className = 'kernel';
      k.style.left = (8 + Math.random() * 80) + '%';
      k.style.top = (6 + Math.random() * 48) + '%';
      k.addEventListener('pointerdown', () => {
        if (k.dataset.done) return;
        k.dataset.done = '1';
        const r = k.getBoundingClientRect();
        k.remove();
        sfx.pop();
        vib(15);
        const p = document.createElement('i');
        p.className = 'puff';
        p.style.left = r.left + 'px'; p.style.top = r.top + 'px';
        document.body.appendChild(p);
        p.animate(
          [{ transform: 'scale(.4) translate(0,0)', opacity: 1 },
           { transform: `scale(1.2) translate(${(Math.random() - .5) * 90}px,-90px) rotate(180deg)`, opacity: 1, offset: .5 },
           { transform: `scale(.9) translate(${(Math.random() - .5) * 60}px,120px) rotate(360deg)`, opacity: 0 }],
          { duration: 750, easing: 'ease-out' }
        ).onfinish = () => p.remove();

        popped = Math.min(POP_GOAL, popped + 1);
        popCountEl.textContent = `${popped} / ${POP_GOAL}`;
        bucketFill.style.height = (popped / POP_GOAL * 42) + 'px';
        if (popped >= POP_GOAL) {
          document.getElementById('popHint').textContent = '🍿 Попкорн готов! Листай к билету';
          document.getElementById('popHint').classList.remove('pulse');
          unlockGate(7);
        }
      });
      pan.appendChild(k);
    }
  }
  gateHooks[6] = () => initPopcorn();

  /* ==================== СЦЕНА 9C: БИЛЕТ В КИНО (GATE 8) ==================== */
  const stub = document.getElementById('stub');
  let stubDrag = false, stubX0 = 0, stubTorn = false, stubLastDx = 0;
  stub.addEventListener('pointerdown', (e) => {
    if (stubTorn) return;
    stubDrag = true;
    stubX0 = e.clientX;
    stubLastDx = 0;
    stub.setPointerCapture(e.pointerId);
  });
  stub.addEventListener('pointermove', (e) => {
    if (!stubDrag || stubTorn) return;
    const dx = clamp(e.clientX - stubX0, 0, 140);
    stub.style.transform = `translateX(${dx}px) rotate(${dx * .15}deg)`;
    if (dx - stubLastDx > 16) { stubLastDx = dx; sfx.sliderTick(); }
    if (dx > 72) {
      stubTorn = true;
      stubDrag = false;
      sfx.tear();
      vib(35);
      stub.style.transition = 'transform .6s ease-in, opacity .6s';
      stub.style.transform = 'translate(220px, 80px) rotate(38deg)';
      stub.style.opacity = 0;
      document.getElementById('tearHint').classList.add('hidden');
      document.getElementById('tearTxt').classList.add('show');
      unlockGate(8);
    }
  });
  stub.addEventListener('pointerup', () => {
    if (!stubDrag || stubTorn) return;
    stubDrag = false;
    stub.style.transition = 'transform .3s';
    stub.style.transform = '';
    setTimeout(() => { stub.style.transition = ''; }, 320);
  });

  /* ==================== СЦЕНА 10: ФЕН ЗАЖАТЬ И ТАЩИТЬ К СВЕЧАМ (GATE 9) ==================== */
  const cakeStage = document.getElementById('cakeStage');
  const candlesBox = document.getElementById('candles');
  const flames = [];
  for (let i = 0; i < 18; i++) {
    const c = document.createElement('div');
    c.className = 'candle';
    const f = document.createElement('div');
    f.className = 'flame';
    c.appendChild(f);
    candlesBox.appendChild(c);
    flames.push({ el: f, hp: 1 });
  }
  const dryerWrap = document.getElementById('dryerWrap');
  const dryer = document.getElementById('dryer');
  const airG = document.getElementById('airG');
  let blowing = false, candlesOut = false;

  function placeDryer(x, y) {
    const r = cakeStage.getBoundingClientRect();
    const nx = clamp(x - r.left, 44, r.width - 44);
    const ny = clamp(y - r.top, 110, r.height - 54);
    dryerWrap.style.left = nx + 'px';
    dryerWrap.style.top = ny + 'px';
  }
  function resetDryerPos() {
    dryerWrap.style.left = '50%';
    dryerWrap.style.top = '350px';
  }

  dryerWrap.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    if (candlesOut) return;
    blowing = true;
    dryerWrap.classList.add('drag');
    dryer.classList.add('on');
    dryerWrap.setPointerCapture(e.pointerId);
    placeDryer(e.clientX, e.clientY);
    sfx.dryer(true, 0);
  });
  dryerWrap.addEventListener('pointermove', (e) => {
    if (!blowing || candlesOut) return;
    placeDryer(e.clientX, e.clientY);
  });
  const stopBlow = () => {
    if (!blowing) return;
    blowing = false;
    dryerWrap.classList.remove('drag');
    dryer.classList.remove('on');
    sfx.dryer(false);
    resetDryerPos();
  };
  ['pointerup', 'pointercancel'].forEach((ev) => dryerWrap.addEventListener(ev, stopBlow));
  dryerWrap.addEventListener('contextmenu', (e) => e.preventDefault());

  function spawnAir() {
    const l = document.createElementNS(NS, 'path');
    const y = 28 + Math.random() * 38;
    l.setAttribute('d', `M152 ${y} q10 -6 20 0`);
    l.setAttribute('stroke', '#b76e79');
    l.setAttribute('stroke-width', '3');
    l.setAttribute('fill', 'none');
    l.setAttribute('stroke-linecap', 'round');
    airG.appendChild(l);
    l.animate(
      [{ transform: 'translateX(0)', opacity: .85 }, { transform: 'translateX(65px)', opacity: 0 }],
      { duration: 340 }
    ).onfinish = () => l.remove();
  }

  function updateCandles() {
    if (unlockedGate < 8 || candlesOut) return;
    if (blowing) {
      if (Math.random() < .5) spawnAir();
      const dr = dryerWrap.getBoundingClientRect();
      // Сопло фена направлено вверх (верхний центр #dryerWrap)
      const nozX = dr.left + dr.width / 2;
      const nozY = dr.top + 8;
      let maxProx = 0;

      flames.forEach((f) => {
        if (f.hp <= 0) return;
        const fr = f.el.getBoundingClientRect();
        const fx = fr.left + fr.width / 2;
        const fy = fr.top + fr.height / 2;
        const dx = fx - nozX;
        const dy = nozY - fy; // > 0, если свеча выше сопла фена
        // Поток воздуха бьёт конусом вверх от сопла
        if (dy > -35 && dy < 200 && Math.abs(dx) < 95) {
          const prox = clamp(1 - Math.hypot(dx * 1.15, Math.max(0, dy - 35) * .75) / 140);
          if (prox > maxProx) maxProx = prox;
          if (prox > .08) {
            f.hp -= (.012 + prox * .045);
            const lean = (dx >= 0 ? 1 : -1) * (15 + prox * 32);
            f.el.style.rotate = `${lean}deg`;
            f.el.style.scale = `${.35 + f.hp * .65}`;
            if (f.hp <= 0) {
              f.el.classList.add('out');
              sfx.candleOut();
              vib(14);
              const s = document.createElement('div');
              s.className = 'smoke';
              f.el.parentElement.appendChild(s);
              setTimeout(() => s.remove(), 1200);
            }
          }
        } else {
          f.hp = Math.min(1, f.hp + .004);
          f.el.style.rotate = '';
          f.el.style.scale = '';
        }
      });

      sfx.dryer(true, maxProx);
      if (maxProx > .3 && Math.random() < .18) vib(6);

      if (flames.every((f) => f.hp <= 0)) {
        candlesOut = true;
        stopBlow();
        document.getElementById('cakeWish').classList.add('show');
        document.getElementById('dryerHint').textContent = '✨ Все 18 свечей погасли!';
        document.getElementById('dryerHint').classList.remove('pulse');
        burstConfetti(45);
        unlockGate(9);
      }
    } else {
      flames.forEach((f) => {
        if (f.hp > 0) {
          f.hp = Math.min(1, f.hp + .006);
          f.el.style.rotate = '';
          f.el.style.scale = '';
        }
      });
    }
  }

  /* ==================== СЦЕНА 11: ПОЛАРОИДЫ (GATE 10) ==================== */
  const polPhotos = [
    { src: 'assets/family/mama-salon.jpg', pos: '50% 12%' },
    { src: 'assets/family/mama-mountains.jpg', pos: '50% 20%' },
    { src: 'assets/family/mama-street.jpg', pos: '50% 12%' },
    { src: 'assets/family/mama-white.jpg', pos: '50% 4%' },
    { src: 'assets/family/mama-cinema.jpg', pos: '50% 14%' },
    { src: 'assets/family/mama-selfie.jpg', pos: '50% 18%' }
  ];
  const polStack = document.getElementById('polStack');
  const polCounter = document.getElementById('polCounter');
  const polReset = document.getElementById('polReset');
  let polLeft = polPhotos.length, polDone = false;

  function buildPolaroids() {
    polStack.innerHTML = '';
    polLeft = polPhotos.length;
    polCounter.textContent = `Свайпни фото (осталось ${polLeft})`;
    polReset.classList.remove('show');
    [...polPhotos].reverse().forEach(({ src, pos }, idx) => {
      const card = document.createElement('div');
      card.className = 'pol';
      const rot = (idx - 2.5) * 3.5;
      card.style.transform = `rotate(${rot}deg) translateY(${idx * 2}px)`;
      card.innerHTML = `<img src="${src}" style="object-position:${pos}" alt="" loading="lazy">`;
      let dx = 0, dy = 0, sx = 0, sy = 0, drag = false;

      card.addEventListener('pointerdown', (e) => {
        drag = true; sx = e.clientX; sy = e.clientY;
        card.classList.add('drag');
        card.setPointerCapture(e.pointerId);
      });
      card.addEventListener('pointermove', (e) => {
        if (!drag) return;
        dx = e.clientX - sx; dy = e.clientY - sy;
        card.style.transform = `translate(${dx}px,${dy}px) rotate(${rot + dx * .08}deg)`;
      });
      card.addEventListener('pointerup', () => {
        if (!drag) return;
        drag = false;
        card.classList.remove('drag');
        if (Math.abs(dx) > 85) {
          const dir = dx > 0 ? 1 : -1;
          card.style.transform = `translate(${dir * 130}vw,${dy}px) rotate(${dir * 35}deg)`;
          card.style.opacity = 0;
          sfx.cardSwipe();
          vib(15);
          setTimeout(() => card.remove(), 500);
          polLeft--;
          if (polLeft > 0) {
            polCounter.textContent = `Свайпни фото (осталось ${polLeft})`;
          } else {
            polCounter.textContent = '✨ Все моменты просмотрены!';
            polReset.classList.add('show');
            if (!polDone) {
              polDone = true;
              unlockGate(10);
            }
          }
        } else {
          card.style.transform = `rotate(${rot}deg) translateY(${idx * 2}px)`;
        }
      });
      polStack.appendChild(card);
    });
  }
  buildPolaroids();
  polReset.addEventListener('click', () => { sfx.cardSwipe(); buildPolaroids(); });

  /* ==================== СЦЕНА 12: ПИСЬМО, ВСТРЯСКА, КОНФЕТТИ ==================== */
  const letterLines = [...document.querySelectorAll('#letter .ln')];

  function burstConfetti(count = 70) {
    const items = ['✂️', '🪮', '❤️', '💰', '🌸', '✨', '💛'];
    for (let i = 0; i < count; i++) {
      const c = document.createElement('i');
      c.className = 'conf';
      c.textContent = items[i % items.length];
      c.style.left = Math.random() * 100 + 'vw';
      document.body.appendChild(c);
      c.animate(
        [{ transform: 'translateY(0) rotate(0deg)', opacity: 1 },
         { transform: `translate(${(Math.random() - .5) * 180}px, 112vh) rotate(${Math.random() * 720}deg)`, opacity: .85 }],
        { duration: 2200 + Math.random() * 2000, delay: Math.random() * 700, easing: 'ease-in' }
      ).onfinish = () => c.remove();
    }
    sfx.confetti();
    vib([30, 40, 30]);
  }

  document.getElementById('shakeBtn').addEventListener('click', () => {
    if (typeof DeviceMotionEvent !== 'undefined' && typeof DeviceMotionEvent.requestPermission === 'function') {
      DeviceMotionEvent.requestPermission().catch(() => {});
    }
    burstConfetti(80);
  });

  let lastShake = 0;
  addEventListener('devicemotion', (e) => {
    if (unlockedGate < 10) return;
    const a = e.accelerationIncludingGravity;
    if (!a) return;
    const mag = Math.hypot(a.x || 0, a.y || 0, a.z || 0);
    if (mag > 22 && performance.now() - lastShake > 1500) {
      lastShake = performance.now();
      burstConfetti(80);
    }
  });

  document.getElementById('replayBtn').addEventListener('click', () => {
    scrollTo({ top: 0, behavior: 'instant' });
    location.reload();
  });

  /* ==================== ГЛАВНЫЙ ЦИКЛ СКРОЛЛА И АНИМАЦИЙ ==================== */
  const arch = document.getElementById('arch');
  const archImg = arch.querySelector('img');
  const scis = document.getElementById('scis');
  const combT = document.getElementById('combT');
  const nightSections = [...document.querySelectorAll('[data-night="1"]')];
  let lastY = scrollY, vel = 0, scrollSfxAccum = 0;

  function frame(t) {
    const y = scrollY, H = innerHeight;
    const docH = Math.max(1, document.documentElement.scrollHeight - H);
    const dy = y - lastY;
    vel += (dy - vel) * .15;
    lastY = y;
    const agit = 1 + Math.min(4, Math.abs(vel) / 12);

    // Звук скролла: мягкая пентатоническая струна каждые ~115px прокрутки
    if (introDone && Math.abs(dy) > 0.5) {
      scrollSfxAccum += dy;
      if (Math.abs(scrollSfxAccum) >= 115) {
        sfx.scrollNote(scrollSfxAccum > 0 ? 1 : -1, Math.abs(vel));
        scrollSfxAccum = 0;
      }
    }

    // 1. Волны в герое
    if (y < H * 1.6) {
      const W = wv.clientWidth, WH = wv.clientHeight;
      if (W && WH) {
        wv.setAttribute('viewBox', `0 0 ${W} ${WH}`);
        wpaths.forEach((o) => {
          let d = '';
          for (let x = -20; x <= W + 20; x += 22) {
            const yy = o.y * WH + Math.sin(x / 160 + t / 1400 + o.ph) * o.a * agit +
              Math.sin(x / 70 + t / 700) * o.a * .25 * agit + y * .25 * o.y;
            d += (x < 0 ? 'M' : 'L') + x + ' ' + yy.toFixed(1);
          }
          o.p.setAttribute('d', d);
        });
      }
      const hp = clamp(y / (H * .82));
      arch.style.transform = `translateY(${y * .32}px) scale(${1 - hp * .14})`;
      archImg.style.transform = `scale(${1 + hp * .28})`;
      letters.forEach((s) => {
        s.style.transform = `translate(${s.dataset.dx * hp}px,${s.dataset.dy * hp}px) rotate(${s.dataset.r * hp}deg)`;
      });
      title.style.opacity = 1 - hp * 1.15;
    }

    // 2. Боковая прядь прогресса
    const stageFrac = (unlockedGate + clamp(y / docH)) / (TOTAL_GATES + 1);
    progP.style.strokeDashoffset = progLen * (1 - clamp(stageFrac));

    // 3. Плавающие инструменты
    const open = Math.sin(y / 90) * 12;
    scis.querySelector('#bladeA').setAttribute('transform', `rotate(${open} 50 45)`);
    scis.querySelector('#bladeB').setAttribute('transform', `rotate(${-open} 50 45)`);
    scis.style.transform = `translateY(${Math.sin(y / 400) * 55}px)`;
    combT.style.transform = `translate(${(y * .06) % (innerWidth * .65)}px,${Math.cos(y / 350) * 40}px) rotate(${-18 + Math.sin(y / 280) * 14}deg)`;

    // 4. Таймлайн + звук на каждую новую бусину
    if (unlockedGate >= 2) {
      const tr = track.getBoundingClientRect();
      const tf = clamp((H * .6 - tr.top) / tr.height);
      tlpath.style.strokeDashoffset = tlLen * (1 - tf);
      let maxLit = -1;
      evEls.forEach((el) => {
        const on = tf >= +el.dataset.f;
        el.classList.toggle('on', on);
        if (on && +el.dataset.idx > maxLit) maxLit = +el.dataset.idx;
      });
      if (maxLit > lastLitBead) {
        lastLitBead = maxLit;
        sfx.bead(maxLit);
      }

      // 5. Горизонтальная галерея работ + звук при окрашивании в центре
      const wr = worksSec.getBoundingClientRect();
      const wp = clamp(-wr.top / Math.max(1, wr.height - H));
      const maxX = Math.max(0, strip.scrollWidth - innerWidth);
      strip.style.transform = `translateX(${-wp * maxX}px)`;
      let centeredIdx = -1;
      workCards.forEach((c, idx) => {
        const cr = c.getBoundingClientRect();
        const cx = cr.left + cr.width / 2;
        const dist = Math.abs(cx - innerWidth / 2) / (innerWidth * .44);
        const g = clamp(dist);
        if (g < .22 && wr.top <= 0 && wr.bottom >= H) centeredIdx = idx;
        c.querySelector('img').style.filter = `grayscale(${g}) brightness(${1 - g * .08})`;
        c.style.transform = `scale(${1 - g * .11}) rotate(${(cx - innerWidth / 2) / innerWidth * 5.5}deg)`;
        c.querySelector('.ph').style.setProperty('--gl', (100 - (1 - g) * 100) + '%');
      });
      if (centeredIdx !== -1 && centeredIdx !== lastCenteredWork) {
        lastCenteredWork = centeredIdx;
        sfx.colorWash();
      }
    }

    // 6. Утюжок
    drawIronStrand(t);

    // 7. Ночной режим и затемнение комнаты в Сцене 9
    let inNight = false;
    if (unlockedGate >= 5) {
      for (const ns of nightSections) {
        if (ns.classList.contains('gated-hidden')) continue;
        const r = ns.getBoundingClientRect();
        if (r.top < H * .55 && r.bottom > H * .35) { inNight = true; break; }
      }
      const kr = kino.getBoundingClientRect();
      const kp = clamp(-kr.top / Math.max(1, kr.height - H));
      if (!roomLit) {
        darkEl.style.opacity = clamp(kp * 1.45, 0, .92);
        const showCord = kp > .38;
        cord.classList.toggle('show', showCord);
        cordHint.classList.toggle('show', showCord);
      }
    }
    document.body.classList.toggle('night', inNight);
    document.body.style.backgroundColor = inNight ? '#2a1623' : '';

    // 8. Свечи
    updateCandles();

    // 9. Письмо проявляется построчно
    if (unlockedGate >= 10) {
      letterLines.forEach((ln) => {
        const r = ln.getBoundingClientRect();
        const p = clamp((H * .88 - r.top) / (H * .28));
        ln.style.opacity = p;
        ln.style.transform = `translateY(${(1 - p) * 22}px)`;
      });
    }

    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
})();
