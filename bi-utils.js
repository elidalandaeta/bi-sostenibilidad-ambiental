/* bi-utils.js — Shared utilities for the BI Course platform */

// ─── STORAGE ────────────────────────────────────────────────────────────────
const BiStorage = {
  KEY: 'bi_course_progress',
  get() {
    try {
      return JSON.parse(localStorage.getItem(this.KEY)) || {
        completed: [], scores: {}, notes: {}, startDate: null, lastVisited: null
      };
    } catch { return { completed: [], scores: {}, notes: {}, startDate: null, lastVisited: null }; }
  },
  save(data) {
    try { localStorage.setItem(this.KEY, JSON.stringify(data)); } catch {}
  },
  completeDay(dayNum, score) {
    const d = this.get();
    if (!d.completed.includes(dayNum)) d.completed.push(dayNum);
    d.scores[dayNum] = score;
    d.lastVisited = dayNum;
    if (!d.startDate) d.startDate = new Date().toISOString().slice(0,10);
    this.save(d);
  },
  saveNote(dayNum, sectionId, text) {
    const d = this.get();
    if (!d.notes[dayNum]) d.notes[dayNum] = {};
    d.notes[dayNum][sectionId] = text;
    this.save(d);
  },
  getNote(dayNum, sectionId) {
    const d = this.get();
    return (d.notes[dayNum] && d.notes[dayNum][sectionId]) || '';
  },
  isCompleted(dayNum) { return this.get().completed.includes(dayNum); },
  getScore(dayNum) { return this.get().scores[dayNum] ?? null; }
};

// ─── TIMER ──────────────────────────────────────────────────────────────────
class SessionTimer {
  constructor(totalSeconds = 3600) {
    this.total = totalSeconds;
    this.remaining = totalSeconds;
    this.running = false;
    this.interval = null;
    this.callbacks = { tick: [], warn: [], danger: [], end: [] };
  }
  on(event, cb) { if (this.callbacks[event]) this.callbacks[event].push(cb); return this; }
  fire(event) { (this.callbacks[event] || []).forEach(cb => cb(this)); }
  start() {
    if (this.running) return;
    this.running = true;
    this.interval = setInterval(() => {
      if (this.remaining <= 0) { this.stop(); this.fire('end'); return; }
      this.remaining--;
      this.fire('tick');
      if (this.remaining === 1200) this.fire('warn');
      if (this.remaining === 300) this.fire('danger');
    }, 1000);
  }
  pause() { this.running = false; clearInterval(this.interval); }
  toggle() { this.running ? this.pause() : this.start(); }
  stop() { this.running = false; clearInterval(this.interval); }
  format() {
    const m = Math.floor(this.remaining / 60).toString().padStart(2,'0');
    const s = (this.remaining % 60).toString().padStart(2,'0');
    return `${m}:${s}`;
  }
  pct() { return this.remaining / this.total; }
}

// ─── RING TIMER UI ───────────────────────────────────────────────────────────
function initTimerRing(containerId, timer) {
  const el = document.getElementById(containerId);
  if (!el) return;
  const R = 28, C = 2 * Math.PI * R;
  el.innerHTML = `
    <div class="timer-ring" title="Tiempo de sesión · Clic para pausar/reanudar" style="cursor:pointer">
      <svg width="72" height="72" viewBox="0 0 72 72">
        <circle class="timer-track" cx="36" cy="36" r="${R}"/>
        <circle class="timer-progress" id="timer-arc" cx="36" cy="36" r="${R}"
          stroke-dasharray="${C}" stroke-dashoffset="0"/>
      </svg>
      <div class="timer-text">
        <span id="timer-display">${timer.format()}</span>
        <small id="timer-label">min</small>
      </div>
    </div>`;
  const arc = document.getElementById('timer-arc');
  const display = document.getElementById('timer-display');
  const ring = el.querySelector('.timer-ring');
  ring.addEventListener('click', () => {
    timer.toggle();
    ring.title = timer.running ? 'Clic para pausar' : 'Clic para reanudar';
  });
  timer.on('tick', t => {
    display.textContent = t.format();
    arc.style.strokeDashoffset = C * (1 - t.pct());
  }).on('warn', () => { arc.classList.add('warn'); })
    .on('danger', () => { arc.classList.remove('warn'); arc.classList.add('danger'); });
}

// ─── SECTION SCROLL TRACKING ─────────────────────────────────────────────────
function initScrollTracking(sidebarItems) {
  const sections = Array.from(document.querySelectorAll('[data-section]'));
  if (!sections.length) return;
  const observer = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        const id = entry.target.dataset.section;
        document.querySelectorAll('.sidebar-item').forEach(si => {
          si.classList.toggle('active', si.dataset.target === id);
        });
      }
    });
  }, { threshold: 0.2, rootMargin: '-60px 0px -60% 0px' });
  sections.forEach(s => {
    s.classList.add('visible');
    observer.observe(s);
  });
  document.querySelectorAll('.sidebar-item').forEach(item => {
    item.addEventListener('click', () => {
      const target = document.querySelector(`[data-section="${item.dataset.target}"]`);
      if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  });
}

// ─── QUIZ ENGINE ─────────────────────────────────────────────────────────────
class QuizEngine {
  constructor(questions, containerId, onComplete) {
    this.qs = questions;
    this.container = document.getElementById(containerId);
    this.current = 0;
    this.score = 0;
    this.answered = false;
    this.onComplete = onComplete;
    this.render();
  }
  render() {
    if (this.current >= this.qs.length) { this.showResult(); return; }
    const q = this.qs[this.current];
    const letters = ['A','B','C','D'];
    this.container.innerHTML = `
      <div class="quiz-header">
        <span class="quiz-q-count">Pregunta ${this.current+1} de ${this.qs.length}</span>
        <div class="progress-dots">${this.qs.map((_,i)=>`<div class="progress-dot ${i<this.current?'completed':i===this.current?'current':''}"></div>`).join('')}</div>
      </div>
      <div class="quiz-question">${q.q}</div>
      <div class="quiz-options">
        ${q.opts.map((o,i)=>`
          <div class="quiz-option" data-idx="${i}">
            <div class="quiz-letter">${letters[i]}</div>
            <div class="quiz-option-text">${o}</div>
          </div>`).join('')}
      </div>
      <div class="quiz-feedback" id="qfeedback"></div>
      <div class="quiz-nav">
        <button class="btn btn-primary" id="qnext" style="display:none">
          ${this.current < this.qs.length-1 ? 'Siguiente pregunta →' : 'Ver resultado'}
        </button>
      </div>`;
    this.container.querySelectorAll('.quiz-option').forEach(opt => {
      opt.addEventListener('click', () => this.select(parseInt(opt.dataset.idx)));
    });
    document.getElementById('qnext')?.addEventListener('click', () => {
      this.current++; this.answered = false; this.render();
    });
  }
  select(idx) {
    if (this.answered) return;
    this.answered = true;
    const q = this.qs[this.current];
    const opts = this.container.querySelectorAll('.quiz-option');
    const fb = document.getElementById('qfeedback');
    if (idx === q.correct) {
      this.score++;
      opts[idx].classList.add('correct');
      fb.className = 'quiz-feedback correct show';
      fb.textContent = '✓ ' + q.explanation;
    } else {
      opts[idx].classList.add('incorrect');
      opts[q.correct].classList.add('show-correct');
      fb.className = 'quiz-feedback incorrect show';
      fb.textContent = '✗ La respuesta correcta es: ' + this.qs[this.current].opts[q.correct] + '. ' + q.explanation;
    }
    document.getElementById('qnext').style.display = 'flex';
  }
  showResult() {
    const pct = this.score / this.qs.length;
    const msgs = [
      { min:0, title:'Sigue practicando', msg:'Repasa las secciones del día y vuelve a intentar el quiz. ¡Cada intento es aprendizaje!', icon:'📖' },
      { min:0.6, title:'¡Buen trabajo!', msg:'Comprendiste los conceptos principales. Puedes avanzar al siguiente día.', icon:'👍' },
      { min:0.8, title:'¡Excelente!', msg:'Tienes muy buen manejo del tema. Estás lista para el siguiente día.', icon:'⭐' },
      { min:1, title:'¡Perfecto! 5/5', msg:'Dominaste completamente los conceptos del día. ¡Adelante!', icon:'🏆' },
    ];
    const m = [...msgs].reverse().find(x => pct >= x.min);
    this.container.innerHTML = `
      <div class="quiz-result">
        <div style="font-size:3.5rem;margin-bottom:12px">${m.icon}</div>
        <div class="quiz-score-circle" style="border-color:${pct>=0.6?'#22C55E':'#F59E0B'}">
          <div class="quiz-score-num">${this.score}</div>
          <div class="quiz-score-denom">de ${this.qs.length}</div>
        </div>
        <div class="quiz-result-title">${m.title}</div>
        <div class="quiz-result-msg">${m.msg}</div>
        ${pct < 0.6 ? `<button class="btn btn-ghost" onclick="location.reload()" style="margin-top:16px">↺ Reintentar quiz</button>` : ''}
      </div>`;
    if (this.onComplete) this.onComplete(this.score, this.qs.length);
  }
}

// ─── NOTES PERSISTENCE ────────────────────────────────────────────────────────
function initNotes(dayNum) {
  document.querySelectorAll('[data-note]').forEach(textarea => {
    const key = textarea.dataset.note;
    textarea.value = BiStorage.getNote(dayNum, key);
    textarea.addEventListener('input', () => BiStorage.saveNote(dayNum, key, textarea.value));
  });
}

// ─── COMPLETION BUTTON ────────────────────────────────────────────────────────
function initCompletion(dayNum, nextDayUrl) {
  const btn = document.getElementById('complete-btn');
  if (!btn) return;
  if (BiStorage.isCompleted(dayNum)) {
    btn.textContent = '✓ Día completado';
    btn.style.background = '#22C55E';
    btn.disabled = false;
  }
  btn.addEventListener('click', function() {
    const score = BiStorage.getScore(dayNum) ?? 0;
    BiStorage.completeDay(dayNum, score);
    btn.textContent = '✓ ¡Guardado!';
    btn.style.background = '#22C55E';
    setTimeout(() => {
      if (nextDayUrl) window.location.href = nextDayUrl;
    }, 1200);
  });
}

// ─── MARK COMPLETED ON QUIZ PASS ─────────────────────────────────────────────
function unlockCompletion(dayNum, score, total) {
  BiStorage.completeDay(dayNum, score);
  const btn = document.getElementById('complete-btn');
  if (btn && score / total >= 0.6) {
    btn.disabled = false;
    btn.style.animation = 'celebrationBounce 0.6s ease';
    setTimeout(() => btn.style.animation = '', 700);
  }
}
