/* =============================================================
   AI Study Helper — script.js
   ⚠️  Replace WORKER_URL below with your Cloudflare Worker URL!
   ============================================================= */

const WORKER_URL =
  "https://educational-webapp.christianaguilar2171.workers.dev/generate";

/* ── STATE ────────────────────────────────────────────────────────────── */
let currentData = null;
let fcIndex = 0;
let quizAnswered = 0;
let quizScore = 0;
let quizTotal = 0;
let loaderStepTimer = null;
let nextQuizId = 11; // tracks next quiz ID for "more" requests

/* ── MAIN GENERATE ────────────────────────────────────────────────────── */
async function generate() {
  const topic = document.getElementById("topic").value.trim();
  const grade = document.getElementById("grade").value;

  if (!topic || topic.length < 2) {
    return showError("Please enter a topic (at least 2 characters).");
  }
  if (!grade) {
    return showError("Please select your grade level.");
  }

  hideError();
  showLoader();
  setBtn(true);

  try {
    const res = await fetch(WORKER_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ topic, grade: parseInt(grade) }),
    });

    const data = await res.json();

    if (!res.ok) throw new Error(data.error || `Server error (${res.status})`);
    if (data.parseError)
      throw new Error(
        "The AI returned an unexpected format. Please try again.",
      );
    if (!data.summary || !data.flashcards || !data.quiz)
      throw new Error("Incomplete data from AI. Please try again.");

    currentData = data;
    nextQuizId = data.quiz.length + 1;

    hideLoader();
    renderResults(data);
  } catch (err) {
    hideLoader();
    showError(err.message || "Something went wrong. Please try again.");
  } finally {
    setBtn(false);
  }
}

/* ── LOAD MORE ────────────────────────────────────────────────────────── */
async function loadMore(type) {
  if (!currentData) return;

  const topic = currentData.topic;
  const grade = currentData.grade;
  const btn = document.getElementById(
    type === "flashcards" ? "moreFcBtn" : "moreQuizBtn",
  );

  btn.disabled = true;
  btn.textContent = "⏳ Loading more…";

  try {
    const res = await fetch(WORKER_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ topic, grade, more: true, startId: nextQuizId }),
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Failed to load more.");
    if (data.parseError) throw new Error("Unexpected AI format. Try again.");

    // Append new flashcards
    if (data.flashcards && data.flashcards.length > 0) {
      currentData.flashcards.push(...data.flashcards);
      appendFlashcards(data.flashcards);
    }

    // Append new quiz questions
    if (data.quiz && data.quiz.length > 0) {
      currentData.quiz.push(...data.quiz);
      quizTotal += data.quiz.length;
      nextQuizId += data.quiz.length;
      appendQuizQuestions(data.quiz);
    }
  } catch (err) {
    showError(err.message || "Could not load more. Please try again.");
  } finally {
    btn.disabled = false;
    btn.textContent = "➕ Load More";
  }
}

/* ── RENDER ALL RESULTS ───────────────────────────────────────────────── */
function renderResults(data) {
  document.getElementById("topicBadge").textContent =
    `📖 ${data.topic} — Grade ${data.grade}`;
  document.getElementById("summaryText").textContent = data.summary;

  renderFlashcards(data.flashcards);
  renderQuiz(data.quiz);

  const resultsEl = document.getElementById("results");
  resultsEl.classList.add("visible");
  resultsEl.scrollIntoView({ behavior: "smooth", block: "start" });
}

/* ── FLASHCARDS ───────────────────────────────────────────────────────── */
function renderFlashcards(cards) {
  fcIndex = 0;

  const isMobile = window.innerWidth < 600;
  const fcSingle = document.getElementById("fcSingle");
  const fcGrid = document.getElementById("fcGrid");

  if (isMobile) {
    fcSingle.classList.remove("hidden");
    fcGrid.classList.add("hidden");
    document.getElementById("fcTotal").textContent = cards.length;
    updateFcCard(cards);
  } else {
    fcSingle.classList.add("hidden");
    fcGrid.classList.remove("hidden");
    fcGrid.innerHTML = "";
    cards.forEach((c) => fcGrid.appendChild(makeFlashcardEl(c)));
  }
}

function appendFlashcards(newCards) {
  const isMobile = window.innerWidth < 600;

  if (isMobile) {
    document.getElementById("fcTotal").textContent =
      currentData.flashcards.length;
    document.getElementById("fcNext").disabled = false;
  } else {
    newCards.forEach((c) => {
      const el = makeFlashcardEl(c);
      el.style.animation = "fadeUp .4s ease both";
      document.getElementById("fcGrid").appendChild(el);
    });
  }
}

function makeFlashcardEl(c) {
  const div = document.createElement("div");
  div.className = "flashcard";
  div.innerHTML = `
    <div class="flashcard-inner">
      <div class="flashcard-front">
        <div class="card-label">Term</div>
        <div class="term">${esc(c.term)}</div>
        <div class="flip-hint">tap to flip ↩</div>
      </div>
      <div class="flashcard-back">${esc(c.definition)}</div>
    </div>`;
  div.addEventListener("click", () => div.classList.toggle("flipped"));
  return div;
}

function updateFcCard(cards) {
  const c = cards[fcIndex];
  document.getElementById("fcTerm").textContent = c.term;
  document.getElementById("fcDef").textContent = c.definition;
  document.getElementById("fcCurrent").textContent = fcIndex + 1;
  document.getElementById("fcTotal").textContent = cards.length;
  document.getElementById("fcCard").classList.remove("flipped");
  document.getElementById("fcPrev").disabled = fcIndex === 0;
  document.getElementById("fcNext").disabled = fcIndex === cards.length - 1;
}

function flipCard() {
  document.getElementById("fcCard").classList.toggle("flipped");
}

function fcNav(dir) {
  if (!currentData) return;
  const cards = currentData.flashcards;
  fcIndex = Math.max(0, Math.min(cards.length - 1, fcIndex + dir));
  updateFcCard(cards);
}

/* ── QUIZ ─────────────────────────────────────────────────────────────── */

/** Sort: Multiple Choice first, then Identification */
function sortQuestions(questions) {
  const mc = questions.filter((q) => q.type === "multiple_choice");
  const id = questions.filter((q) => q.type !== "multiple_choice");
  return [...mc, ...id];
}

/** Renders questions with a category divider header between groups */
function buildQuizWithCategories(list, sorted) {
  let lastType = null;
  sorted.forEach((q, i) => {
    const type =
      q.type === "multiple_choice" ? "multiple_choice" : "identification";

    if (type !== lastType) {
      const header = document.createElement("div");
      header.className = "quiz-category-header";
      if (type === "multiple_choice") {
        header.innerHTML = `
          <div class="quiz-cat-icon" style="background:var(--violet-l);color:var(--violet)">🔘</div>
          <div>
            <div class="quiz-cat-title">Multiple Choice</div>
            <div class="quiz-cat-sub">Select the best answer from the options</div>
          </div>`;
      } else {
        header.innerHTML = `
          <div class="quiz-cat-icon" style="background:var(--teal-l);color:var(--teal)">✏️</div>
          <div>
            <div class="quiz-cat-title">Identification</div>
            <div class="quiz-cat-sub">Type the correct word or phrase</div>
          </div>`;
      }
      list.appendChild(header);
      lastType = type;
    }

    list.appendChild(makeQuizEl(q, i));
  });
}

function renderQuiz(questions) {
  quizAnswered = 0;
  quizScore = 0;

  const sorted = sortQuestions(questions);
  quizTotal = sorted.length;

  document.getElementById("scoreCard").classList.add("hidden");
  const list = document.getElementById("quizList");
  list.innerHTML = "";
  buildQuizWithCategories(list, sorted);
}

function appendQuizQuestions(newQuestions) {
  // Re-render full sorted list so categories stay correct
  document.getElementById("scoreCard").classList.add("hidden");
  const allSorted = sortQuestions(currentData.quiz);
  const list = document.getElementById("quizList");
  list.innerHTML = "";
  buildQuizWithCategories(list, allSorted);
}

function makeQuizEl(q, index) {
  const item = document.createElement("div");
  item.className = "quiz-item";
  item.id = `qi-${q.id}`;

  let answerHTML = "";
  if (q.type === "multiple_choice") {
    const choicesHTML = q.choices
      .map(
        (ch) => `
      <button class="choice-btn"
        onclick="checkMC(this,'${esc(q.answer)}',${q.id},'${esc(q.explanation)}')">
        ${esc(ch)}
      </button>`,
      )
      .join("");
    answerHTML = `<div class="choices-list">${choicesHTML}</div>`;
  } else {
    // Identification — simple type-and-check, no AI grading
    answerHTML = `
      <div class="id-wrap">
        <input class="id-input" id="id-input-${q.id}"
          placeholder="Type your answer…"
          onkeydown="if(event.key==='Enter') checkID(${q.id},'${esc(q.answer)}')"
        />
        <button class="btn-check" id="btn-check-${q.id}"
          onclick="checkID(${q.id},'${esc(q.answer)}')">
          Check ✓
        </button>
      </div>`;
  }

  item.innerHTML = `
    <div class="quiz-meta">
      <div class="quiz-num">${index + 1}</div>
    </div>
    <div class="quiz-question">${esc(q.question)}</div>
    ${answerHTML}
    <div class="explanation" id="exp-${q.id}">
      <strong>💡 Explanation:</strong> ${esc(q.explanation)}
    </div>`;

  return item;
}

function checkMC(btn, correctAnswer, id, explanation) {
  const item = document.getElementById(`qi-${id}`);
  if (item.classList.contains("correct") || item.classList.contains("wrong"))
    return;

  const isCorrect = btn.textContent.trim() === correctAnswer.trim();

  item.querySelectorAll(".choice-btn").forEach((b) => {
    b.disabled = true;
    if (b.textContent.trim() === correctAnswer.trim())
      b.classList.add("reveal-correct");
  });

  if (isCorrect) {
    btn.classList.add("chosen-correct");
    item.classList.add("correct");
    quizScore++;
  } else {
    btn.classList.add("chosen-wrong");
    item.classList.add("wrong");
  }

  showExplanation(id);
  tallyAnswer();
}

/* ── CHECK IDENTIFICATION ─────────────────────────────────────────────── */
function checkID(id, correctAnswer) {
  const input = document.getElementById(`id-input-${id}`);
  const item = document.getElementById(`qi-${id}`);
  const checkBtn = document.getElementById(`btn-check-${id}`);

  if (input.disabled) return;

  const userAns = input.value.trim().toLowerCase();
  const correct = correctAnswer.trim().toLowerCase();

  if (!userAns) {
    input.focus();
    return;
  }

  input.disabled = true;
  checkBtn.disabled = true;

  // Smart match: exact, or meaningful substring (min 3 chars)
  const isCorrect =
    userAns === correct ||
    (correct.includes(userAns) && userAns.length >= 3) ||
    (userAns.includes(correct) && correct.length >= 3);

  if (isCorrect) {
    input.classList.add("correct");
    item.classList.add("correct");
    quizScore++;
  } else {
    input.classList.add("wrong");
    item.classList.add("wrong");
    input.value = "";
    input.placeholder = `✗ Correct: ${correctAnswer}`;
  }

  showExplanation(id);
  tallyAnswer();
}

function showExplanation(id) {
  document.getElementById(`exp-${id}`).classList.add("visible");
}

function tallyAnswer() {
  quizAnswered++;
  if (quizAnswered === quizTotal) showScore();
}

function showScore() {
  const card = document.getElementById("scoreCard");
  const pct = quizScore / quizTotal;
  const msgs = [
    { t: 0.4, m: "Keep studying — you'll get there! 💪" },
    { t: 0.6, m: "Good effort! Review the explanations. 📖" },
    { t: 0.8, m: "Nice work! You know this topic well. 🌟" },
    { t: 1.1, m: "Perfect score! You're a star! 🏆" },
  ];
  const msg = msgs.find((x) => pct <= x.t)?.m || "Great job!";

  document.getElementById("scoreNum").textContent = `${quizScore}/${quizTotal}`;
  document.getElementById("scoreMsg").textContent = msg;
  card.classList.remove("hidden");
  card.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

/* ── LOADER ───────────────────────────────────────────────────────────── */
function showLoader() {
  document.getElementById("loader").classList.add("visible");
  let step = 0;
  const steps = ["step1", "step2", "step3"];
  steps.forEach((s) => document.getElementById(s).classList.remove("active"));
  document.getElementById("step1").classList.add("active");
  loaderStepTimer = setInterval(() => {
    step = (step + 1) % steps.length;
    steps.forEach((s) => document.getElementById(s).classList.remove("active"));
    document.getElementById(steps[step]).classList.add("active");
  }, 1800);
}

function hideLoader() {
  document.getElementById("loader").classList.remove("visible");
  clearInterval(loaderStepTimer);
}

/* ── UI HELPERS ───────────────────────────────────────────────────────── */
function showError(msg) {
  const banner = document.getElementById("errorBanner");
  document.getElementById("errorMsg").textContent = msg;
  banner.classList.add("visible");
  banner.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

function hideError() {
  document.getElementById("errorBanner").classList.remove("visible");
}

function setBtn(loading) {
  const btn = document.getElementById("generateBtn");
  const icon = document.getElementById("btnIcon");
  const text = document.getElementById("btnText");
  btn.disabled = loading;
  icon.textContent = loading ? "⏳" : "✨";
  text.textContent = loading ? "Generating…" : "Generate Study Material";
}

function restart() {
  document.getElementById("results").classList.remove("visible");
  document.getElementById("topic").value = "";
  document.getElementById("grade").value = "";
  document.getElementById("quizList").innerHTML = "";
  document.getElementById("fcGrid").innerHTML = "";
  currentData = null;
  nextQuizId = 11;
  quizAnswered = 0;
  quizScore = 0;
  quizTotal = 0;
  window.scrollTo({ top: 0, behavior: "smooth" });
}

/* ── UTILITY ──────────────────────────────────────────────────────────── */
function esc(str) {
  if (!str) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/* ── EVENT LISTENERS ──────────────────────────────────────────────────── */
document.getElementById("topic").addEventListener("keydown", (e) => {
  if (e.key === "Enter") generate();
});
