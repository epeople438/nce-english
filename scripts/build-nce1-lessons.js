const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const SOURCE_BASE = 'https://nce.mleo.site/NCE1';
const START_LESSON = 1;
const END_LESSON = 144;

const UNIT_TITLES = {
  1: '基础会话 · 物品 · 身份',
  2: '动作 · 地点 · 职业',
  3: '家庭 · 气候 · 日常',
  4: '过去 · 周末 · 方向',
  5: '经历 · 比较 · 购物',
  6: '归属 · 历史 · 综合',
};

const FALLBACK_ICONS = ['📘', '🎧', '✏️', '🎯', '🔤', '⭐'];

function escapeHtmlAttr(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('"', '&quot;')
    .replaceAll('<', '&lt;');
}

function parseExistingLessons() {
  const indexPath = path.join(ROOT, 'index.html');
  const html = fs.readFileSync(indexPath, 'utf8');
  const match = html.match(/const lessons = (\[[\s\S]*?\]);/);
  if (!match) return new Map();
  try {
    const lessons = Function(`return ${match[1]};`)();
    return new Map(lessons.map((lesson) => [lesson.id, lesson]));
  } catch {
    return new Map();
  }
}

function parseLrc(text) {
  const meta = {};
  const lines = [];
  for (const raw of text.split(/\r?\n/)) {
    const trimmed = raw.trim();
    if (!trimmed) continue;
    const metaMatch = trimmed.match(/^\[([a-z]+):(.+)\]$/i);
    if (metaMatch && !/^\[\d/.test(trimmed)) {
      meta[metaMatch[1].toLowerCase()] = metaMatch[2].trim();
      continue;
    }
    const lineMatch = trimmed.match(/^\[(\d{2}:\d{2}\.\d{2})\](.+)$/);
    if (!lineMatch) continue;
    const body = lineMatch[2].trim();
    const [enPart, ...zhParts] = body.split(' | ');
    lines.push({
      time: lineMatch[1],
      en: enPart.trim(),
      zh: zhParts.join(' | ').trim(),
    });
  }
  return { meta, lines };
}

function titleCaseFromSource(title) {
  return String(title || '').replace(/\s+/g, ' ').trim();
}

function getFocus(id, title) {
  if (id <= 36) return '现在进行时、时间和地点表达';
  if (id <= 48) return '祈使句、there be、can 和喜好表达';
  if (id <= 60) return '人物身份、国籍、气候和日常活动';
  if (id <= 72) return '一般过去时、时间问答和事件叙述';
  if (id <= 84) return '问路、建议、看病、购物和现在完成时';
  if (id <= 96) return '比较级、物品归属和综合复习';
  if (id <= 120) return '完成时、过去经历、间接表达和形容词';
  return '被动语态、定语从句、综合阅读和表达';
}

function extractWords(lines, title) {
  const stop = new Set([
    'the', 'and', 'you', 'are', 'this', 'that', 'with', 'from', 'have', 'has',
    'was', 'were', 'for', 'not', 'but', 'then', 'what', 'where', 'when', 'who',
    'why', 'how', 'his', 'her', 'she', 'him', 'they', 'them', 'there', 'their',
    'your', 'our', 'can', 'did', 'does', 'will', 'shall', 'into', 'onto', 'very',
    'lesson', 'listen', 'tape', 'answer', 'question',
  ]);
  const text = [title, ...lines.map((line) => line.en)].join(' ');
  const words = Array.from(text.matchAll(/[A-Za-z][A-Za-z'-]{2,}/g))
    .map((m) => m[0].replace(/^'+|'+$/g, ''))
    .filter((word) => !stop.has(word.toLowerCase()));
  const unique = [];
  const seen = new Set();
  for (const word of words) {
    const key = word.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(word);
    if (unique.length >= 8) break;
  }
  return unique.length ? unique : ['English', 'sentence', 'practice', 'lesson'];
}

function makeVocab(words) {
  return words.slice(0, 8).map((word, index) => ({
    en: word,
    zh: '重点词',
    emoji: FALLBACK_ICONS[index % FALLBACK_ICONS.length],
  }));
}

function makeOddQuiz(lines, title, focus) {
  const usable = lines.filter((line) => line.en && !/^Listen to /i.test(line.en));
  const first = usable[1] || usable[0] || { en: title };
  const second = usable[2] || usable[0] || { en: title };
  return [
    {
      prompt: '选择课文中的原句。',
      answer: first.en,
      options: [first.en, `${first.en} now`, first.en.replace(/\bis\b/i, 'are')],
    },
    {
      prompt: '选择本课的学习重点。',
      answer: focus,
      options: [focus, '随机单词记忆', '只看中文不朗读'],
    },
    {
      prompt: '哪一句适合跟读？',
      answer: second.en,
      options: [second.en, second.en.replace(/\bare\b/i, 'is'), 'I do not know.'],
    },
  ];
}

function makeOddFill(lines, words) {
  const body = lines.filter((line) => /^[A-Za-z]/.test(line.en) && line.en.split(/\s+/).length >= 4);
  const picks = body.slice(0, 3);
  return picks.map((line, i) => {
    const candidates = Array.from(line.en.matchAll(/[A-Za-z][A-Za-z'-]{2,}/g)).map((m) => m[0]);
    const answer = candidates.find((word) => words.some((w) => w.toLowerCase() === word.toLowerCase())) || candidates[Math.min(1, candidates.length - 1)] || words[0];
    const idx = line.en.indexOf(answer);
    return {
      before: line.en.slice(0, idx).trim(),
      after: line.en.slice(idx + answer.length).trim(),
      answer,
      options: Array.from(new Set([answer, words[(i + 1) % words.length], words[(i + 2) % words.length], 'English'])).slice(0, 4),
    };
  });
}

function makeEvenLines(oddTitle, focus, words) {
  const w0 = words[0] || 'English';
  const w1 = words[1] || 'sentence';
  const w2 = words[2] || 'practice';
  return [
    { speaker: '1', en: `Can you use the word ${w0}?`, zh: `你会使用 ${w0} 这个词吗？` },
    { speaker: '2', en: `Yes, I can make a sentence with ${w0}.`, zh: `会，我能用 ${w0} 造句。` },
    { speaker: '1', en: `What are we practising after ${oddTitle}?`, zh: `学完 ${oddTitle} 后我们练什么？` },
    { speaker: '2', en: `We are practising ${focus.toLowerCase()}.`, zh: `我们练习：${focus}。` },
    { speaker: '1', en: `Please read ${w1} and ${w2} again.`, zh: `请再读一读 ${w1} 和 ${w2}。` },
  ];
}

function makeEvenQuiz(focus, words) {
  const w0 = words[0] || 'English';
  const w1 = words[1] || 'sentence';
  return [
    {
      prompt: '选择自然的练习句。',
      answer: `Can you use ${w0}?`,
      options: [`Can you use ${w0}?`, `Can you uses ${w0}?`, `Can you using ${w0}?`],
    },
    {
      prompt: '选择正确学习重点。',
      answer: focus,
      options: [focus, '随便点击完成', '只背标题'],
    },
    {
      prompt: '选择正确表达。',
      answer: `Please read the ${w1} again.`,
      options: [`Please read the ${w1} again.`, `Please reads the ${w1} again.`, `Please reading the ${w1} again.`],
    },
  ];
}

function makeEvenFill(words) {
  const w0 = words[0] || 'English';
  const w1 = words[1] || 'sentence';
  const w2 = words[2] || 'practice';
  return [
    { before: 'Can you use', after: '?', answer: w0, options: [w0, 'does', 'were', 'mine'] },
    { before: 'Please read the', after: 'again.', answer: w1, options: [w1, 'quickly', 'already', 'never'] },
    { before: 'This is a', after: 'lesson.', answer: w2, options: [w2, 'went', 'been', 'whose'] },
  ];
}

async function loadSourceUnits() {
  const book = await (await fetch(`${SOURCE_BASE}/book.json`)).json();
  const units = [];
  for (const unit of book.units) {
    const response = await fetch(`${SOURCE_BASE}/${encodeURIComponent(unit.filename)}.lrc`);
    const lrc = await response.text();
    const parsed = parseLrc(lrc);
    const lessonLine = parsed.lines.find((line) => /^Lesson\s+\d+/i.test(line.en));
    const oddId = Number((lessonLine?.en.match(/\d+/) || unit.filename.match(/^\d+/) || [])[0]);
    if (!oddId) continue;
    const bodyLines = parsed.lines.filter((line) => !/^Lesson\s+\d+/i.test(line.en));
    const sourceTitle = titleCaseFromSource(parsed.meta.ti || bodyLines[0]?.en || unit.title);
    units.push({
      oddId,
      evenId: oddId + 1,
      unitTitle: unit.title,
      sourceTitle,
      bodyLines,
      filename: unit.filename,
      sourceUrl: `${SOURCE_BASE}/${encodeURIComponent(unit.filename)}.lrc`,
    });
  }
  return units;
}

function buildLessonData(units, existingMap) {
  const data = {};
  for (const unit of units) {
    if (unit.oddId >= START_LESSON && unit.oddId <= END_LESSON) {
      const focus = getFocus(unit.oddId, unit.sourceTitle);
      const words = extractWords(unit.bodyLines, unit.sourceTitle);
      data[unit.oddId] = {
        title: unit.sourceTitle,
        icon: existingMap.get(unit.oddId)?.icon || FALLBACK_ICONS[unit.oddId % FALLBACK_ICONS.length],
        focus,
        sourceType: 'oddText',
        sourceNote: `课文来源：iChochy/NCE · ${unit.unitTitle}`,
        readLines: unit.bodyLines.map((line, index) => ({
          speaker: index === 0 ? 'T' : String(index),
          en: line.en,
          zh: line.zh,
          time: line.time,
        })),
        vocab: makeVocab(words),
        quiz: makeOddQuiz(unit.bodyLines, unit.sourceTitle, focus),
        fill: makeOddFill(unit.bodyLines, words),
      };
    }

    if (unit.evenId >= START_LESSON && unit.evenId <= END_LESSON) {
      const evenTitle = `Practice: ${unit.sourceTitle}`;
      const focus = getFocus(unit.evenId, evenTitle);
      const words = extractWords(unit.bodyLines, unit.sourceTitle);
      data[unit.evenId] = {
        title: evenTitle,
        icon: existingMap.get(unit.evenId)?.icon || FALLBACK_ICONS[unit.evenId % FALLBACK_ICONS.length],
        focus,
        sourceType: 'practice',
        sourceNote: `偶数课练习页：根据 ${unit.oddId} 课课文句型生成，不作为教材原文。`,
        readLines: makeEvenLines(unit.sourceTitle, focus, words),
        vocab: makeVocab(words),
        quiz: makeEvenQuiz(focus, words),
        fill: makeEvenFill(words),
      };
    }
  }
  return data;
}

function buildIndexLessons(units, existingMap) {
  const sourceByOdd = new Map(units.map((unit) => [unit.oddId, unit]));
  const lessons = [];
  for (let id = 1; id <= 144; id++) {
    const existing = existingMap.get(id);
    const oddUnit = id % 2 === 1 ? sourceByOdd.get(id) : sourceByOdd.get(id - 1);
    const name = id % 2 === 1
      ? (oddUnit?.sourceTitle || existing?.name || `Lesson ${id}`)
      : `Practice: ${oddUnit?.sourceTitle || `Lesson ${id - 1}`}`;
    lessons.push({
      id,
      name: name || `Lesson ${id}`,
      icon: existing?.icon || FALLBACK_ICONS[id % FALLBACK_ICONS.length],
      unit: Math.ceil(id / 24),
    });
  }
  return lessons;
}

function writeDataFile(data) {
  const out = `window.NCE_LESSON_DATA = ${JSON.stringify(data, null, 2)};\n`;
  fs.writeFileSync(path.join(ROOT, 'scripts', 'lesson-data-1-144.js'), out);
}

function writeLessonPages(data) {
  for (let id = START_LESSON; id <= END_LESSON; id++) {
    const item = data[id];
    if (!item) throw new Error(`Missing lesson data for ${id}`);
    const title = escapeHtmlAttr(item.title);
    const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
<title>新概念英语 · Lesson ${id} · ${title}</title>
<link href="https://fonts.googleapis.com/css2?family=Fredoka+One&family=Nunito:wght@400;600;700;800;900&display=swap" rel="stylesheet">
<link rel="stylesheet" href="../styles/nce-lesson-shell.css">
<link rel="stylesheet" href="../styles/nce-ipad.css">
</head>
<body>
<script>window.NCE_LESSON_ID=${id};</script>
<script src="../scripts/lesson-data-1-144.js"></script>
<script src="../scripts/nce-lesson-shell.js"></script>
</body>
</html>
`;
    fs.writeFileSync(path.join(ROOT, 'lessons', `lesson${id}.html`), html);
  }
}

function patchIndex(lessons) {
  const indexPath = path.join(ROOT, 'index.html');
  let html = fs.readFileSync(indexPath, 'utf8');
  const lessonsLiteral = JSON.stringify(lessons, null, 2)
    .replace(/"id":/g, 'id:')
    .replace(/"name":/g, 'name:')
    .replace(/"icon":/g, 'icon:')
    .replace(/"unit":/g, 'unit:');
  html = html.replace(/const lessons = \[[\s\S]*?\];/, `const lessons = ${lessonsLiteral};`);
  html = html.replace(/Array\.from\(\{ length: \d+ \}, \(_, i\) => i \+ 1\)/, 'Array.from({ length: 144 }, (_, i) => i + 1)');
  html = html.replace(/buildGrid\(1, 'grid-unit1'\);\s*buildGrid\(2, 'grid-unit2'\);\s*buildGrid\(3, 'grid-unit3'\);\s*buildGrid\(4, 'grid-unit4'\);\s*(?:buildGrid\(5, 'grid-unit5'\);\s*buildGrid\(6, 'grid-unit6'\);\s*)?/, [
    "buildGrid(1, 'grid-unit1');",
    "buildGrid(2, 'grid-unit2');",
    "buildGrid(3, 'grid-unit3');",
    "buildGrid(4, 'grid-unit4');",
    "buildGrid(5, 'grid-unit5');",
    "buildGrid(6, 'grid-unit6');",
  ].join('\n') + '\n\n');

  if (!html.includes('id="grid-unit5"')) {
    html = html.replace(/  <!-- UNIT 4 -->[\s\S]*?    <div class="lesson-grid" id="grid-unit4"><\/div>\n  <\/div>/, (unit4) => `${unit4}

  <!-- UNIT 5 -->
  <div class="unit-section">
    <div class="unit-header">
      <div class="unit-pill">Unit 5</div>
      <div class="unit-title">${UNIT_TITLES[5]}</div>
    </div>
    <div class="lesson-grid" id="grid-unit5"></div>
  </div>

  <!-- UNIT 6 -->
  <div class="unit-section">
    <div class="unit-header">
      <div class="unit-pill">Unit 6</div>
      <div class="unit-title">${UNIT_TITLES[6]}</div>
    </div>
    <div class="lesson-grid" id="grid-unit6"></div>
  </div>`);
  }

  for (const [unit, title] of Object.entries(UNIT_TITLES)) {
    const re = new RegExp(`(<div class="unit-pill">Unit ${unit}<\\/div>\\s*<div class="unit-title">)([^<]+)(<\\/div>)`);
    html = html.replace(re, `$1${title}$3`);
  }

  fs.writeFileSync(indexPath, html);
}

function patchServiceWorker() {
  const swPath = path.join(ROOT, 'sw.js');
  let sw = fs.readFileSync(swPath, 'utf8');
  sw = sw.replace(/nce-english-v\d+/, 'nce-english-v6');
  sw = sw.replace(/'\.\/scripts\/lesson-data-33-96\.js',\n/g, '');
  sw = sw.replace(/'\.\/scripts\/lesson-data-33-144\.js',\n/g, '');
  if (!sw.includes('./scripts/lesson-data-1-144.js')) {
    sw = sw.replace("'./scripts/nce-lesson-shell.js',", "'./scripts/lesson-data-1-144.js',\n  './scripts/nce-lesson-shell.js',");
  }
  fs.writeFileSync(swPath, sw);
}

async function main() {
  const existingMap = parseExistingLessons();
  const units = await loadSourceUnits();
  if (units.length !== 72) throw new Error(`Expected 72 NCE1 units, got ${units.length}`);
  const data = buildLessonData(units, existingMap);
  const lessons = buildIndexLessons(units, existingMap);
  writeDataFile(data);
  writeLessonPages(data);
  patchIndex(lessons);
  patchServiceWorker();
  const oldData = path.join(ROOT, 'scripts', 'lesson-data-33-96.js');
  if (fs.existsSync(oldData)) fs.rmSync(oldData);
  const oldData144 = path.join(ROOT, 'scripts', 'lesson-data-33-144.js');
  if (fs.existsSync(oldData144)) fs.rmSync(oldData144);
  console.log(`Generated lessons ${START_LESSON}-${END_LESSON} from ${units.length} source units.`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
