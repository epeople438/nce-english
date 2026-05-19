(function () {
  const lessonId = window.NCE_LESSON_ID;
  const data = window.NCE_LESSON_DATA && window.NCE_LESSON_DATA[lessonId];
  const totalStages = 4;
  let starsEarned = 0;
  let readDone = new Set();
  let quizAnswered = 0;
  let fillAnswered = 0;
  let readingAll = false;
  let fullTextRead = false;

  if (!data) {
    document.body.innerHTML = '<main class="stage active"><div class="card">Lesson data is missing.</div></main>';
    return;
  }

  const $ = (selector) => document.querySelector(selector);
  const $$ = (selector) => Array.from(document.querySelectorAll(selector));

  function speak(text, rate = .9, cancelCurrent = true) {
    return new Promise((resolve) => {
      if (!text || !window.speechSynthesis) {
        resolve();
        return;
      }
      if (cancelCurrent) speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.lang = 'en-US';
      u.rate = rate;
      u.pitch = 1.03;
      const timeout = setTimeout(resolve, Math.min(9000, Math.max(1200, text.split(/\s+/).length * 520)));
      const done = () => {
        clearTimeout(timeout);
        resolve();
      };
      u.onend = done;
      u.onerror = done;
      speechSynthesis.speak(u);
    });
  }

  function escapeHtml(value) {
    return String(value)
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;');
  }

  function shuffle(items) {
    const arr = [...items];
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  function setStars(n) {
    starsEarned = Math.max(starsEarned, n);
    for (let i = 1; i <= totalStages; i++) {
      const star = $(`#star${i}`);
      if (star) star.classList.toggle('lit', i <= starsEarned);
    }
  }

  function goStage(n) {
    if (n !== 1 && window.speechSynthesis) {
      readingAll = false;
      speechSynthesis.cancel();
    }
    $$('.stage').forEach((stage) => stage.classList.remove('active'));
    $(`#stage${n}`).classList.add('active');
    const pct = n <= totalStages ? (n - 1) * 25 : 100;
    $('#progressBar').style.width = `${pct}%`;
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function toast(message) {
    const t = $('#toast');
    t.textContent = message;
    t.classList.add('show');
    clearTimeout(toast.timer);
    toast.timer = setTimeout(() => t.classList.remove('show'), 1700);
  }

  function buildShell() {
    document.title = `新概念英语 · Lesson ${lessonId} · ${data.title}`;
    document.body.innerHTML = `
      <nav class="top-nav">
        <a class="back-btn" href="../index.html">←</a>
        <div class="nav-copy">
          <div class="nav-title">Lesson ${lessonId} · ${escapeHtml(data.title)}</div>
          <div class="nav-sub">新概念英语第一册</div>
        </div>
        <div class="star-row">
          <span class="star-icon" id="star1">⭐</span>
          <span class="star-icon" id="star2">⭐</span>
          <span class="star-icon" id="star3">⭐</span>
          <span class="star-icon" id="star4">⭐</span>
        </div>
      </nav>
      <div class="progress-wrap"><div class="progress-bar" id="progressBar"></div></div>
      <div id="toast"></div>

      <section class="stage active" id="stage0">
        <div class="hero-card">
          <div class="hero-top">
            <div class="hero-icon">${data.icon || '📘'}</div>
            <div>
              <h1 class="hero-title">Lesson ${lessonId}</h1>
              <div class="hero-subtitle">${escapeHtml(data.title)}</div>
            </div>
          </div>
          <div class="focus-box">${escapeHtml(data.focus)}</div>
          <div class="task-row">
            <span class="task-chip">🎧 读课文</span>
            <span class="task-chip">🔤 认单词</span>
            <span class="task-chip">🎯 句型游戏</span>
            <span class="task-chip">✏️ 填空</span>
          </div>
          <div class="btn-row"><button class="btn btn-primary" id="startBtn">开始学习 →</button></div>
        </div>
      </section>

      <section class="stage" id="stage1">
        <div class="stage-label"><div class="stage-num">1</div><div class="stage-title">读课文</div></div>
        <div id="sourceNote"></div>
        <div class="card read-card" id="readCard"><div class="line-list" id="readLines"></div></div>
        <div class="btn-row">
          <button class="btn btn-primary" id="readAllBtn">全文朗读</button>
          <button class="btn btn-next" id="readNext" disabled>下一关 →</button>
        </div>
      </section>

      <section class="stage" id="stage2">
        <div class="stage-label"><div class="stage-num">2</div><div class="stage-title">认单词</div></div>
        <div class="vocab-grid" id="vocabGrid"></div>
        <div class="btn-row"><button class="btn btn-next" id="vocabNext">下一关 →</button></div>
      </section>

      <section class="stage" id="stage3">
        <div class="stage-label"><div class="stage-num">3</div><div class="stage-title">句型游戏</div></div>
        <div class="score-strip" id="quizDots"></div>
        <div class="quiz-area" id="quizArea"></div>
        <div class="btn-row"><button class="btn btn-next" id="quizNext" disabled>下一关 →</button></div>
      </section>

      <section class="stage" id="stage4">
        <div class="stage-label"><div class="stage-num">4</div><div class="stage-title">填空挑战</div></div>
        <div class="score-strip" id="fillDots"></div>
        <div class="quiz-area" id="fillArea"></div>
        <div class="btn-row"><button class="btn btn-next" id="finishBtn" disabled>完成本课 🎉</button></div>
      </section>

      <section class="stage" id="stage5">
        <div class="card finish-card">
          <span class="finish-emoji">🏆</span>
          <div class="finish-title">Lesson ${lessonId} 完成！</div>
          <div class="finish-sub">${escapeHtml(data.title)}</div>
          <div class="finish-stars">⭐⭐⭐⭐</div>
          <div class="focus-box">${escapeHtml(data.focus)}</div>
          <div class="btn-row">
            <a class="btn btn-muted" href="../index.html">回主页</a>
            <button class="btn btn-primary" id="restartBtn">再学一次</button>
          </div>
        </div>
      </section>
    `;

    $('#startBtn').onclick = () => goStage(1);
    $('#readAllBtn').onclick = playFullText;
    $('#readNext').onclick = () => { setStars(1); goStage(2); };
    $('#vocabNext').onclick = () => { setStars(2); goStage(3); };
    $('#quizNext').onclick = () => { setStars(3); goStage(4); };
    $('#finishBtn').onclick = finishLesson;
    $('#restartBtn').onclick = restart;
  }

  function renderReadLines() {
    const lines = data.readLines || [];
    if (data.sourceNote) {
      $('#sourceNote').innerHTML = `
        <div class="note-card">
          ${escapeHtml(data.sourceNote)}
        </div>`;
    }

    $('#readLines').innerHTML = lines.map((line, i) => `
      <div class="read-line" data-read="${i}">
        <div class="line-speaker">${escapeHtml(line.speaker || (i + 1))}</div>
        <div>
          <div class="line-en">${escapeHtml(line.en)}</div>
          <div class="line-zh">${escapeHtml(line.zh || '')}</div>
        </div>
      </div>
    `).join('');

    $$('.read-line').forEach((el) => {
      el.onclick = (event) => {
        event.stopPropagation();
        const i = Number(el.dataset.read);
        if (fullTextRead) {
          playSingleLine(i);
        } else {
          playFullText();
        }
      };
    });
    $('#readCard').onclick = () => {
      if (!fullTextRead) playFullText();
    };

    if (!lines.length) $('#readNext').disabled = false;
  }

  async function playFullText() {
    const lines = data.readLines || [];
    if (!lines.length || readingAll) return;

    readingAll = true;
    readDone = new Set();
    $('#readNext').disabled = true;
    $('#readAllBtn').disabled = true;
    $('#readAllBtn').textContent = '朗读中...';
    $$('.read-line').forEach((line) => line.classList.remove('done', 'active'));
    if (window.speechSynthesis) speechSynthesis.cancel();

    for (let i = 0; i < lines.length && readingAll; i++) {
      const el = $(`[data-read="${i}"]`);
      if (el) {
        el.classList.add('active');
        el.scrollIntoView({ block: 'center', behavior: 'smooth' });
      }
      await speak(lines[i].speak || lines[i].en, .9, false);
      readDone.add(i);
      if (el) {
        el.classList.remove('active');
        el.classList.add('done');
      }
    }

    readingAll = false;
    $('#readAllBtn').disabled = false;
    $('#readAllBtn').textContent = '再朗读一遍';
    if (readDone.size >= lines.length) {
      fullTextRead = true;
      $('#readNext').disabled = false;
      toast('全文朗读完成');
    }
  }

  async function playSingleLine(i) {
    const lines = data.readLines || [];
    const line = lines[i];
    if (!line || readingAll) return;

    if (window.speechSynthesis) speechSynthesis.cancel();
    const el = $(`[data-read="${i}"]`);
    $$('.read-line').forEach((item) => item.classList.remove('active'));
    if (el) {
      el.classList.add('active', 'done');
    }
    await speak(line.speak || line.en, .9, false);
    if (el) {
      el.classList.remove('active');
      el.classList.add('done');
    }
  }

  function renderVocab() {
    $('#vocabGrid').innerHTML = (data.vocab || []).map((word, i) => `
      <div class="vocab-card" data-vocab="${i}">
        <span class="vocab-emoji">${word.emoji || '🔤'}</span>
        <div class="vocab-en">${escapeHtml(word.en)}</div>
        <div class="vocab-zh">${escapeHtml(word.zh || '')}</div>
      </div>
    `).join('');

    $$('.vocab-card').forEach((el) => {
      el.onclick = () => {
        const item = data.vocab[Number(el.dataset.vocab)];
        $$('.vocab-card').forEach((card) => card.classList.remove('playing'));
        el.classList.add('playing');
        speak(item.en);
        setTimeout(() => el.classList.remove('playing'), 900);
      };
    });
  }

  function renderQuiz() {
    const items = data.quiz || [];
    $('#quizDots').innerHTML = items.map((_, i) => `<span class="score-dot" id="quizDot${i}"></span>`).join('');
    $('#quizArea').innerHTML = items.map((q, i) => `
      <div class="quiz-card" data-quiz-card="${i}">
        <div class="quiz-prompt">${escapeHtml(q.prompt)}</div>
        <div class="option-grid">
          ${shuffle(q.options).map((opt) => `<button class="option-btn" data-quiz="${i}" data-answer="${escapeHtml(opt)}">${escapeHtml(opt)}</button>`).join('')}
        </div>
      </div>
    `).join('');

    $$('#quizArea .option-btn').forEach((btn) => {
      btn.onclick = () => {
        const i = Number(btn.dataset.quiz);
        const card = $(`[data-quiz-card="${i}"]`);
        if (card.dataset.answered) return;
        card.dataset.answered = 'true';
        const ok = btn.dataset.answer === items[i].answer;
        btn.classList.add(ok ? 'correct' : 'wrong');
        if (!ok) {
          card.querySelectorAll('.option-btn').forEach((opt) => {
            if (opt.dataset.answer === items[i].answer) opt.classList.add('correct');
          });
        }
        card.querySelectorAll('.option-btn').forEach((opt) => opt.disabled = true);
        $(`#quizDot${i}`).classList.add(ok ? 'good' : 'bad');
        quizAnswered += 1;
        speak(items[i].answer);
        if (quizAnswered >= items.length) $('#quizNext').disabled = false;
      };
    });
  }

  function renderFill() {
    const items = data.fill || [];
    $('#fillDots').innerHTML = items.map((_, i) => `<span class="score-dot" id="fillDot${i}"></span>`).join('');
    $('#fillArea').innerHTML = items.map((q, i) => `
      <div class="quiz-card" data-fill-card="${i}">
        <div class="fill-sentence">${escapeHtml(q.before)} <span class="blank">?</span> ${escapeHtml(q.after)}</div>
        <div class="option-grid">
          ${shuffle(q.options).map((opt) => `<button class="option-btn" data-fill="${i}" data-answer="${escapeHtml(opt)}">${escapeHtml(opt)}</button>`).join('')}
        </div>
      </div>
    `).join('');

    $$('#fillArea .option-btn').forEach((btn) => {
      btn.onclick = () => {
        const i = Number(btn.dataset.fill);
        const card = $(`[data-fill-card="${i}"]`);
        if (card.dataset.answered) return;
        card.dataset.answered = 'true';
        const ok = btn.dataset.answer === items[i].answer;
        btn.classList.add(ok ? 'correct' : 'wrong');
        if (!ok) {
          card.querySelectorAll('.option-btn').forEach((opt) => {
            if (opt.dataset.answer === items[i].answer) opt.classList.add('correct');
          });
        }
        card.querySelector('.blank').textContent = items[i].answer;
        card.querySelectorAll('.option-btn').forEach((opt) => opt.disabled = true);
        $(`#fillDot${i}`).classList.add(ok ? 'good' : 'bad');
        fillAnswered += 1;
        speak(`${items[i].before} ${items[i].answer} ${items[i].after}`);
        if (fillAnswered >= items.length) $('#finishBtn').disabled = false;
      };
    });
  }

  function saveProgress() {
    try {
      const p = JSON.parse(localStorage.getItem('nce_progress') || '{}');
      const prev = p[lessonId] || {};
      p[lessonId] = {
        stars: Math.max(4, prev.stars || 0),
        completed: true,
        date: new Date().toISOString()
      };
      localStorage.setItem('nce_progress', JSON.stringify(p));
    } catch (e) {}
  }

  function confetti() {
    const colors = ['#ff7043', '#ffca28', '#66bb6a', '#26c6da', '#ab47bc'];
    for (let i = 0; i < 48; i++) {
      const el = document.createElement('div');
      el.className = 'confetti';
      const size = 6 + Math.random() * 8;
      el.style.cssText = `left:${Math.random() * 100}vw;background:${colors[i % colors.length]};width:${size}px;height:${size}px;animation-duration:${1.8 + Math.random() * 2.4}s;`;
      document.body.appendChild(el);
      setTimeout(() => el.remove(), 4500);
    }
  }

  function finishLesson() {
    setStars(4);
    saveProgress();
    confetti();
    goStage(5);
  }

  function restart() {
    readDone = new Set();
    quizAnswered = 0;
    fillAnswered = 0;
    starsEarned = 0;
    readingAll = false;
    fullTextRead = false;
    if (window.speechSynthesis) speechSynthesis.cancel();
    buildShell();
    renderAll();
    goStage(0);
  }

  function renderAll() {
    renderReadLines();
    renderVocab();
    renderQuiz();
    renderFill();
    $('#progressBar').style.width = '0%';
  }

  window.NCE_goStage = goStage;
  buildShell();
  renderAll();
})();
