import { useEffect, useMemo, useRef, useState } from "react";
import mammoth from "mammoth";
import "./styles.css";

const FONT_STORAGE_KEY = "ccde_font_settings";
const WRONG_STORAGE_KEY = "ccde_wrong_answers";
const DEFAULT_FONT_SIZE = 20;
const MIN_FONT_SIZE = 12;
const MAX_FONT_SIZE = 32;
const LETTERS = ["A", "B", "C", "D", "E", "F"];

const QUESTION_RE = /^(\d+)[.,、]\s*(.*)$/;
const OPTION_RE = /^([A-F])[.,、]\s*(.*)$/i;
const ANSWER_RE = /^Answer[:\s]+([A-F]+)$/i;

function readJsonStorage(key, fallback) {
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) {
      return fallback;
    }
    const parsed = JSON.parse(raw);
    return parsed ?? fallback;
  } catch {
    return fallback;
  }
}

function clamp(num, min, max) {
  return Math.min(max, Math.max(min, num));
}

function normalizeText(text) {
  return (text || "").replace(/\u00a0/g, " ").trim();
}

function appendUniqueImages(target, images) {
  for (const src of images) {
    if (src && !target.includes(src)) {
      target.push(src);
    }
  }
}

function extractBlocksFromHtml(html) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, "text/html");
  const blocks = [];
  const blockTags = new Set(["p", "li", "h1", "h2", "h3", "h4", "h5", "h6"]);

  function walkElement(element) {
    const tag = element.tagName.toLowerCase();

    if (tag === "img") {
      const src = element.getAttribute("src") || "";
      if (src) {
        blocks.push({ text: "", images: [src] });
      }
      return;
    }

    if (blockTags.has(tag)) {
      const text = normalizeText(element.textContent);
      const images = Array.from(element.querySelectorAll("img"))
        .map((img) => img.getAttribute("src") || "")
        .filter(Boolean);
      if (text || images.length > 0) {
        blocks.push({ text, images });
      }
      return;
    }

    const children = Array.from(element.children);
    if (children.length === 0) {
      const text = normalizeText(element.textContent);
      if (text) {
        blocks.push({ text, images: [] });
      }
      return;
    }

    for (const child of children) {
      walkElement(child);
    }
  }

  for (const node of Array.from(doc.body.childNodes)) {
    if (node.nodeType === 3) {
      const text = normalizeText(node.textContent);
      if (text) {
        blocks.push({ text, images: [] });
      }
      continue;
    }

    if (node.nodeType === 1) {
      walkElement(node);
    }
  }

  return blocks;
}

function parseQuestionsFromHtml(html) {
  const blocks = extractBlocksFromHtml(html);
  const questions = [];

  let currentText = "";
  let currentOptions = {};
  let currentImages = [];
  let currentNumber = null;
  let currentAnswer = null;

  function flushCurrentQuestion() {
    if (currentNumber !== null && Object.keys(currentOptions).length > 0 && currentAnswer) {
      questions.push({
        number: currentNumber,
        text: currentText.trim(),
        options: { ...currentOptions },
        answer: currentAnswer.toUpperCase().split("").sort().join(""),
        images: [...currentImages]
      });
    }
  }

  for (const block of blocks) {
    const text = normalizeText(block.text);
    const images = block.images || [];

    const qMatch = text.match(QUESTION_RE);
    if (qMatch) {
      flushCurrentQuestion();
      currentNumber = Number(qMatch[1]);
      currentText = qMatch[2] || "";
      currentOptions = {};
      currentImages = [];
      currentAnswer = null;
      appendUniqueImages(currentImages, images);
      continue;
    }

    const optionMatch = text.match(OPTION_RE);
    if (optionMatch) {
      const letter = optionMatch[1].toUpperCase();
      currentOptions[letter] = optionMatch[2] || "";
      appendUniqueImages(currentImages, images);
      continue;
    }

    const answerMatch = text.match(ANSWER_RE);
    if (answerMatch) {
      currentAnswer = answerMatch[1].toUpperCase();
      continue;
    }

    if (currentNumber !== null) {
      appendUniqueImages(currentImages, images);
      if (text && Object.keys(currentOptions).length === 0) {
        currentText = currentText ? `${currentText}\n${text}` : text;
      }
    }
  }

  flushCurrentQuestion();

  return questions;
}

function shuffleArray(array) {
  const copy = [...array];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function sortLetters(list) {
  return [...list].sort();
}

function prepareQuestion(question) {
  const optionItems = Object.entries(question.options);
  const shuffledItems = shuffleArray(optionItems);
  const newLetters = LETTERS.slice(0, shuffledItems.length);

  const shuffledOptions = {};
  const optionMapping = {};
  const reverseMapping = {};

  shuffledItems.forEach(([originalLetter, optionText], index) => {
    const newLetter = newLetters[index];
    shuffledOptions[newLetter] = optionText;
    optionMapping[newLetter] = originalLetter;
    reverseMapping[originalLetter] = newLetter;
  });

  const shuffledAnswer = sortLetters(
    question.answer.split("").map((letter) => reverseMapping[letter]).filter(Boolean)
  ).join("");

  return {
    ...question,
    isMultipleChoice: question.answer.length > 1,
    shuffledOptions,
    optionMapping,
    reverseMapping,
    shuffledAnswer
  };
}

function sampleQuestions(questions, count) {
  return shuffleArray(questions).slice(0, count);
}

function computeSequentialMaxCount(sortedQuestions, startNumber) {
  if (sortedQuestions.length === 0) {
    return 1;
  }

  let startIdx = 0;
  for (let i = 0; i < sortedQuestions.length; i += 1) {
    if (sortedQuestions[i].number >= startNumber) {
      startIdx = i;
      break;
    }
  }

  return Math.max(1, sortedQuestions.length - startIdx);
}

function OptionItem({ questionType, letter, text, checked, disabled, onChange, fontSize }) {
  return (
    <label className={`option-card ${checked ? "selected" : ""} ${disabled ? "disabled" : ""}`}>
      <input
        type={questionType === "multi" ? "checkbox" : "radio"}
        name="quiz-option"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(letter, event.target.checked)}
      />
      <span style={{ fontSize: `${fontSize}px` }}>
        {letter}. {text}
      </span>
    </label>
  );
}

function SettingsModal({
  visible,
  onClose,
  onStart,
  settings,
  setSettings,
  totalQuestions,
  maxQuestionNumber,
  sortedQuestions
}) {
  if (!visible) {
    return null;
  }

  const sequentialMax =
    settings.mode === "sequential"
      ? computeSequentialMaxCount(sortedQuestions, settings.startQuestion)
      : totalQuestions;

  const safeTotal = Math.max(1, totalQuestions);

  function updateMode(mode) {
    setSettings((prev) => {
      const next = { ...prev, mode };
      const maxCount = mode === "sequential" ? computeSequentialMaxCount(sortedQuestions, next.startQuestion) : safeTotal;
      next.numQuestions = clamp(next.numQuestions, 1, maxCount);
      return next;
    });
  }

  function updateNumQuestions(value) {
    setSettings((prev) => {
      const maxCount = prev.mode === "sequential" ? computeSequentialMaxCount(sortedQuestions, prev.startQuestion) : safeTotal;
      return {
        ...prev,
        numQuestions: clamp(Number(value) || 1, 1, maxCount)
      };
    });
  }

  function updateStartQuestion(value) {
    setSettings((prev) => {
      const nextStart = clamp(Number(value) || 1, 1, Math.max(1, maxQuestionNumber));
      const maxCount = computeSequentialMaxCount(sortedQuestions, nextStart);
      return {
        ...prev,
        startQuestion: nextStart,
        numQuestions: clamp(prev.numQuestions, 1, maxCount)
      };
    });
  }

  return (
    <div className="modal-backdrop">
      <div className="modal-card">
        <h2>练习设置</h2>

        <div className="settings-row">
          <span>练习模式:</span>
          <label>
            <input
              type="radio"
              name="mode"
              checked={settings.mode === "random"}
              onChange={() => updateMode("random")}
            />
            随机模式
          </label>
          <label>
            <input
              type="radio"
              name="mode"
              checked={settings.mode === "sequential"}
              onChange={() => updateMode("sequential")}
            />
            顺序模式
          </label>
        </div>

        <div className="settings-row">
          <span>练习题目数量:</span>
          <input
            type="number"
            min={1}
            max={settings.mode === "sequential" ? sequentialMax : safeTotal}
            value={settings.numQuestions}
            onChange={(event) => updateNumQuestions(event.target.value)}
          />
        </div>

        <div className="quick-buttons">
          <button type="button" onClick={() => updateNumQuestions(Math.min(50, settings.mode === "sequential" ? sequentialMax : safeTotal))}>
            50题
          </button>
          <button type="button" onClick={() => updateNumQuestions(Math.min(100, settings.mode === "sequential" ? sequentialMax : safeTotal))}>
            100题
          </button>
          <button type="button" onClick={() => updateNumQuestions(settings.mode === "sequential" ? sequentialMax : safeTotal)}>
            全部({settings.mode === "sequential" ? sequentialMax : safeTotal}题)
          </button>
        </div>

        {settings.mode === "sequential" && (
          <div className="settings-row">
            <span>起始题号:</span>
            <input
              type="number"
              min={1}
              max={Math.max(1, maxQuestionNumber)}
              value={settings.startQuestion}
              onChange={(event) => updateStartQuestion(event.target.value)}
            />
            <small>原始题号范围: 1-{Math.max(1, maxQuestionNumber)}</small>
          </div>
        )}

        <div className="modal-actions">
          <button type="button" className="secondary" onClick={onClose}>
            取消
          </button>
          <button type="button" className="primary" onClick={onStart}>
            开始练习
          </button>
        </div>
      </div>
    </div>
  );
}

function WrongAnswersModal({ visible, wrongAnswers, onClose, onClear, fontSize }) {
  if (!visible) {
    return null;
  }

  return (
    <div className="modal-backdrop">
      <div className="modal-card modal-large">
        <h2>错题本 ({wrongAnswers.length} 题)</h2>

        {wrongAnswers.length === 0 ? (
          <p>错题本中还没有题目。</p>
        ) : (
          <div className="wrong-list" style={{ fontSize: `${fontSize}px` }}>
            {wrongAnswers.map((record) => (
              <article key={record.original_number} className="wrong-item">
                <div className="wrong-item-header">
                  <strong>原题号: {record.original_number}</strong>
                  {record.is_multiple_choice ? <span>【多选题】</span> : null}
                </div>
                <p className="wrong-question">题目: {record.question_text}</p>
                <div className="wrong-options">
                  {Object.keys(record.options)
                    .sort()
                    .map((letter) => (
                      <div key={letter}>
                        {letter}. {record.options[letter]}
                      </div>
                    ))}
                </div>
                <p>正确答案: {record.correct_answer}</p>
                <p>你的答案: {record.user_answer || "(未作答)"}</p>
                <p>答错时间: {new Date(record.timestamp).toLocaleString()}</p>
              </article>
            ))}
          </div>
        )}

        <div className="modal-actions">
          <button type="button" className="danger" onClick={onClear} disabled={wrongAnswers.length === 0}>
            清空错题本
          </button>
          <button type="button" className="secondary" onClick={onClose}>
            关闭
          </button>
        </div>
      </div>
    </div>
  );
}

function FinalResultModal({ visible, total, score, wrongCount, onClose }) {
  if (!visible) {
    return null;
  }

  const percentage = total > 0 ? (score / total) * 100 : 0;

  return (
    <div className="modal-backdrop">
      <div className="modal-card">
        <h2>练习完成</h2>
        <p>总题数: {total}</p>
        <p>正确数: {score}</p>
        <p>正确率: {percentage.toFixed(1)}%</p>
        <p>错题本中共有 {wrongCount} 道题目</p>
        <div className="modal-actions">
          <button type="button" className="primary" onClick={onClose}>
            确定
          </button>
        </div>
      </div>
    </div>
  );
}

export default function App() {
  const [questions, setQuestions] = useState([]);
  const [quizQuestions, setQuizQuestions] = useState([]);
  const [sourceFileName, setSourceFileName] = useState("");

  const [currentIndex, setCurrentIndex] = useState(0);
  const [score, setScore] = useState(0);
  const [answersState, setAnswersState] = useState({});
  const [draftSelections, setDraftSelections] = useState({});
  const [warning, setWarning] = useState("");

  const [wrongAnswers, setWrongAnswers] = useState(() => readJsonStorage(WRONG_STORAGE_KEY, []));
  const [fontSize, setFontSize] = useState(() => {
    const saved = readJsonStorage(FONT_STORAGE_KEY, { font_size: DEFAULT_FONT_SIZE });
    return clamp(Number(saved.font_size) || DEFAULT_FONT_SIZE, MIN_FONT_SIZE, MAX_FONT_SIZE);
  });

  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [isDragging, setIsDragging] = useState(false);

  const [showSettings, setShowSettings] = useState(false);
  const [showWrongModal, setShowWrongModal] = useState(false);
  const [showFinalModal, setShowFinalModal] = useState(false);

  const [settings, setSettings] = useState({
    mode: "random",
    numQuestions: 100,
    startQuestion: 1
  });

  const autoNextTimerRef = useRef(null);
  const dragDepthRef = useRef(0);

  const sortedQuestions = useMemo(() => [...questions].sort((a, b) => a.number - b.number), [questions]);
  const maxQuestionNumber = sortedQuestions.length > 0 ? sortedQuestions[sortedQuestions.length - 1].number : 0;
  const answeredCount = Object.keys(answersState).length;

  const currentQuestion = quizQuestions[currentIndex] || null;
  const currentResult = answersState[currentIndex] || null;
  const currentSelected = draftSelections[currentIndex] || currentResult?.selected || [];

  const progressPercent = quizQuestions.length > 0 ? Math.round((answeredCount / quizQuestions.length) * 100) : 0;

  useEffect(() => {
    window.localStorage.setItem(FONT_STORAGE_KEY, JSON.stringify({ font_size: fontSize }));
  }, [fontSize]);

  useEffect(() => {
    window.localStorage.setItem(WRONG_STORAGE_KEY, JSON.stringify(wrongAnswers));
  }, [wrongAnswers]);

  useEffect(() => {
    if (quizQuestions.length > 0 && answeredCount === quizQuestions.length) {
      setShowFinalModal(true);
    }
  }, [answeredCount, quizQuestions.length]);

  useEffect(
    () => () => {
      if (autoNextTimerRef.current) {
        clearTimeout(autoNextTimerRef.current);
      }
    },
    []
  );

  function resetRunState() {
    setCurrentIndex(0);
    setScore(0);
    setAnswersState({});
    setDraftSelections({});
    setWarning("");
    setShowFinalModal(false);
  }

  function upsertWrongAnswer(question, userAnswerOriginal) {
    const record = {
      original_number: question.number,
      question_text: question.text,
      options: question.options,
      correct_answer: question.answer,
      user_answer: userAnswerOriginal,
      is_multiple_choice: question.isMultipleChoice,
      timestamp: new Date().toISOString()
    };

    setWrongAnswers((prev) => {
      const index = prev.findIndex((item) => item.original_number === record.original_number);
      if (index >= 0) {
        const next = [...prev];
        next[index] = record;
        return next;
      }
      return [...prev, record];
    });
  }

  async function loadDocxFile(file) {
    setLoading(true);
    setLoadError("");

    try {
      if (!file.name.toLowerCase().endsWith(".docx")) {
        throw new Error("请上传 .docx 文件。");
      }

      const arrayBuffer = await file.arrayBuffer();
      const result = await mammoth.convertToHtml(
        { arrayBuffer },
        {
          convertImage: mammoth.images.imgElement(async (image) => {
            const base64 = await image.read("base64");
            return {
              src: `data:${image.contentType};base64,${base64}`
            };
          })
        }
      );

      const parsedQuestions = parseQuestionsFromHtml(result.value);
      if (parsedQuestions.length === 0) {
        throw new Error("未解析到题目，请确认题库格式与原 Python 版本一致。");
      }

      setQuestions(parsedQuestions);
      setSourceFileName(file.name);
      setSettings({
        mode: "random",
        numQuestions: Math.min(100, parsedQuestions.length),
        startQuestion: 1
      });
      setShowSettings(true);
      setQuizQuestions([]);
      resetRunState();
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "解析题库失败。");
    } finally {
      setLoading(false);
      dragDepthRef.current = 0;
      setIsDragging(false);
    }
  }

  async function handleFileUpload(event) {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }
    await loadDocxFile(file);
    event.target.value = "";
  }

  function handleDragOver(event) {
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
    if (!isDragging) {
      setIsDragging(true);
    }
  }

  function handleDragEnter(event) {
    event.preventDefault();
    dragDepthRef.current += 1;
    if (!isDragging) {
      setIsDragging(true);
    }
  }

  function handleDragLeave(event) {
    event.preventDefault();
    dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
    if (dragDepthRef.current === 0) {
      setIsDragging(false);
    }
  }

  async function handleDrop(event) {
    event.preventDefault();
    dragDepthRef.current = 0;
    setIsDragging(false);
    const file = event.dataTransfer.files?.[0];
    if (!file) {
      return;
    }
    await loadDocxFile(file);
  }

  function startQuiz() {
    if (questions.length === 0) {
      return;
    }

    const mode = settings.mode;
    const startQuestion = clamp(Number(settings.startQuestion) || 1, 1, Math.max(1, maxQuestionNumber));

    let selectedQuestions = [];
    if (mode === "sequential") {
      let startIdx = 0;
      for (let i = 0; i < sortedQuestions.length; i += 1) {
        if (sortedQuestions[i].number >= startQuestion) {
          startIdx = i;
          break;
        }
      }

      const maxCount = Math.max(1, sortedQuestions.length - startIdx);
      const count = clamp(Number(settings.numQuestions) || 1, 1, maxCount);
      selectedQuestions = sortedQuestions.slice(startIdx, startIdx + count);
    } else {
      const count = clamp(Number(settings.numQuestions) || 1, 1, questions.length);
      selectedQuestions = sampleQuestions(questions, count);
    }

    const prepared = selectedQuestions.map(prepareQuestion);
    setQuizQuestions(prepared);
    resetRunState();
    setShowSettings(false);
  }

  function changeOption(letter, checked) {
    if (!currentQuestion || currentResult) {
      return;
    }

    setWarning("");

    setDraftSelections((prev) => {
      const existing = prev[currentIndex] || [];
      let next = existing;

      if (currentQuestion.isMultipleChoice) {
        if (checked) {
          next = sortLetters(Array.from(new Set([...existing, letter])));
        } else {
          next = existing.filter((item) => item !== letter);
        }
      } else {
        next = checked ? [letter] : [];
      }

      return {
        ...prev,
        [currentIndex]: next
      };
    });
  }

  function submitAnswer() {
    if (!currentQuestion || currentResult) {
      return;
    }

    const selected = sortLetters(draftSelections[currentIndex] || []);

    if (selected.length === 0) {
      setWarning("请先选择答案。");
      return;
    }

    if (currentQuestion.isMultipleChoice && selected.length !== currentQuestion.answer.length) {
      setWarning(`这是多选题，需要选择 ${currentQuestion.answer.length} 个答案，你选择了 ${selected.length} 个。`);
      return;
    }

    const userAnswerShuffled = selected.join("");
    const userAnswerOriginal = sortLetters(
      selected.map((letter) => currentQuestion.optionMapping[letter] || letter)
    ).join("");

    const isCorrect = userAnswerShuffled === currentQuestion.shuffledAnswer;

    setAnswersState((prev) => ({
      ...prev,
      [currentIndex]: {
        selected,
        isCorrect,
        userAnswerShuffled,
        userAnswerOriginal
      }
    }));

    if (isCorrect) {
      setScore((prev) => prev + 1);
    } else {
      upsertWrongAnswer(currentQuestion, userAnswerOriginal);
    }

    setWarning("");

    if (isCorrect && currentIndex < quizQuestions.length - 1) {
      if (autoNextTimerRef.current) {
        clearTimeout(autoNextTimerRef.current);
      }
      autoNextTimerRef.current = setTimeout(() => {
        setCurrentIndex((prev) => Math.min(prev + 1, quizQuestions.length - 1));
      }, 500);
    }
  }

  function clearWrongAnswers() {
    const confirmed = window.confirm("确定要清空错题本吗？此操作不可恢复。");
    if (confirmed) {
      setWrongAnswers([]);
      setShowWrongModal(false);
    }
  }

  function restartQuiz() {
    if (questions.length === 0) {
      return;
    }
    setShowSettings(true);
  }

  const questionTypeLabel = currentQuestion
    ? currentQuestion.isMultipleChoice
      ? `【多选题 - 请选择 ${currentQuestion.answer.length} 个答案】`
      : "【单选题】"
    : "";

  const typeClass = currentQuestion?.isMultipleChoice ? "type-multi" : "type-single";

  const resultText = currentResult
    ? currentResult.isCorrect
      ? "✓ 回答正确！"
      : `✗ 回答错误！\n你的答案: ${currentResult.userAnswerShuffled} (原选项: ${currentResult.userAnswerOriginal || "(未作答)"})\n正确答案: ${currentQuestion?.shuffledAnswer || ""} (原选项: ${currentQuestion?.answer || ""})`
    : "";

  return (
    <div className="app-shell" style={{ "--base-size": fontSize }}>
      <header className="top-panel card">
        <div className="stats-grid">
          <div>进度: {answeredCount}/{quizQuestions.length || 0}</div>
          <div>得分: {answeredCount > 0 ? `${score}/${answeredCount}` : "0"}</div>
          <div>错题本: {wrongAnswers.length} 题</div>
          <div className="source-file">题库文件: {sourceFileName || "未加载"}</div>
        </div>

        <div className="toolbar-actions">
          <button
            type="button"
            className="tool-btn"
            onClick={() => setFontSize((prev) => clamp(prev - 2, MIN_FONT_SIZE, MAX_FONT_SIZE))}
          >
            A-
          </button>
          <span className="font-size-tag">字号: {fontSize}</span>
          <button
            type="button"
            className="tool-btn"
            onClick={() => setFontSize((prev) => clamp(prev + 2, MIN_FONT_SIZE, MAX_FONT_SIZE))}
          >
            A+
          </button>
          <button type="button" className="secondary" onClick={restartQuiz} disabled={questions.length === 0}>
            重新开始
          </button>
          <button type="button" className="secondary" onClick={() => setShowWrongModal(true)}>
            查看错题
          </button>
        </div>

        <div className="progress-track" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progressPercent}>
          <div className="progress-fill" style={{ width: `${progressPercent}%` }} />
        </div>
      </header>

      <section className="card loader-card">
        <h1>CCDE 题库练习 (React Web)</h1>
        <p>上传 `.docx` 题库后即可开始练习，支持 iPhone 和 Mac 浏览器。</p>
        <div
          className={`upload-zone ${isDragging ? "dragging" : ""}`}
          onDragOver={handleDragOver}
          onDragEnter={handleDragEnter}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
        >
          <label className="upload-btn">
            <input type="file" accept=".docx" onChange={handleFileUpload} disabled={loading} />
            {loading ? "正在解析题库..." : "选择题库 DOCX"}
          </label>
          <p className="drag-tip">或将 .docx 文件拖拽到这里</p>
        </div>
        {loadError ? <p className="error-text">{loadError}</p> : null}
      </section>

      {quizQuestions.length > 0 && currentQuestion ? (
        <section className="card question-card">
          <div className="question-meta">
            <div className="question-number">第 {currentIndex + 1} 题 (原题号: {currentQuestion.number})</div>
            <div className={`question-type ${typeClass}`}>{questionTypeLabel}</div>
          </div>

          <pre className="question-text">{currentQuestion.text}</pre>

          {currentQuestion.images.length > 0 ? (
            <div className="question-images">
              {currentQuestion.images.map((src, index) => (
                <img key={`${currentQuestion.number}-${index}`} src={src} alt={`question-${currentQuestion.number}-${index}`} />
              ))}
            </div>
          ) : null}

          <div className="options-wrap">
            {Object.keys(currentQuestion.shuffledOptions)
              .sort()
              .map((letter) => (
                <OptionItem
                  key={letter}
                  questionType={currentQuestion.isMultipleChoice ? "multi" : "single"}
                  letter={letter}
                  text={currentQuestion.shuffledOptions[letter]}
                  checked={currentSelected.includes(letter)}
                  disabled={Boolean(currentResult)}
                  onChange={changeOption}
                  fontSize={fontSize}
                />
              ))}
          </div>

          {warning ? <div className="warning-text">{warning}</div> : null}

          {currentResult ? (
            <pre className={`result-text ${currentResult.isCorrect ? "result-correct" : "result-wrong"}`}>{resultText}</pre>
          ) : null}

          <div className="bottom-actions">
            <button
              type="button"
              className="secondary"
              onClick={() => {
                setCurrentIndex((prev) => Math.max(prev - 1, 0));
                setWarning("");
              }}
              disabled={currentIndex <= 0}
            >
              上一题
            </button>

            <button type="button" className="primary" onClick={submitAnswer} disabled={Boolean(currentResult)}>
              提交答案
            </button>

            <button
              type="button"
              className="secondary"
              onClick={() => {
                setCurrentIndex((prev) => Math.min(prev + 1, quizQuestions.length - 1));
                setWarning("");
              }}
              disabled={currentIndex >= quizQuestions.length - 1}
            >
              下一题
            </button>
          </div>
        </section>
      ) : null}

      <SettingsModal
        visible={showSettings}
        onClose={() => setShowSettings(false)}
        onStart={startQuiz}
        settings={settings}
        setSettings={setSettings}
        totalQuestions={questions.length}
        maxQuestionNumber={maxQuestionNumber}
        sortedQuestions={sortedQuestions}
      />

      <WrongAnswersModal
        visible={showWrongModal}
        wrongAnswers={wrongAnswers}
        onClose={() => setShowWrongModal(false)}
        onClear={clearWrongAnswers}
        fontSize={fontSize}
      />

      <FinalResultModal
        visible={showFinalModal}
        total={quizQuestions.length}
        score={score}
        wrongCount={wrongAnswers.length}
        onClose={() => setShowFinalModal(false)}
      />
    </div>
  );
}
