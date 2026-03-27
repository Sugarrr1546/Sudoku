import {
  BOARD_SIZE,
  DIFFICULTIES,
  checkAgainstSolution,
  cloneBoard,
  countFilledCells,
  createGame,
  getConflicts,
  isSolved,
} from "./logic.mjs";

const boardElement = document.querySelector("#board");
const timerElement = document.querySelector("#timer");
const progressElement = document.querySelector("#progress");
const messageElement = document.querySelector("#message");
const difficultySelect = document.querySelector("#difficulty-select");
const difficultyLabel = document.querySelector("#difficulty-label");
const newGameButton = document.querySelector("#new-game-button");
const resetButton = document.querySelector("#reset-button");
const solveButton = document.querySelector("#solve-button");
const noteButton = document.querySelector("#note-button");
const hintButton = document.querySelector("#hint-button");
const checkButton = document.querySelector("#check-button");
const eraseButton = document.querySelector("#erase-button");
const padElement = document.querySelector("#number-pad");

const NUMBER_PAD_VALUES = [1, 2, 3, 4, 5, 6, 7, 8, 9];

let timerId = null;
let flashTimeoutId = null;

let state = createEmptyState();

createNumberPad();
bindEvents();
startNewGame(difficultySelect.value);

function createEmptyState() {
  return {
    difficulty: "medium",
    puzzle: [],
    solution: [],
    board: [],
    fixed: new Set(),
    notes: createEmptyNotes(),
    selected: 0,
    noteMode: false,
    incorrect: new Set(),
    status: "idle",
    outcome: null,
    startedAt: 0,
    finishedAt: 0,
    isBusy: false,
  };
}

function createEmptyNotes() {
  return Array.from({ length: BOARD_SIZE * BOARD_SIZE }, () => new Set());
}

function bindEvents() {
  boardElement.addEventListener("click", (event) => {
    const cell = event.target.closest(".cell");
    if (!cell || state.isBusy) {
      return;
    }

    state.selected = Number(cell.dataset.index);
    render();
  });

  document.addEventListener("keydown", handleKeydown);

  difficultySelect.addEventListener("change", () => {
    startNewGame(difficultySelect.value);
  });

  newGameButton.addEventListener("click", () => {
    startNewGame(difficultySelect.value);
  });

  resetButton.addEventListener("click", resetBoard);
  solveButton.addEventListener("click", revealSolution);
  noteButton.addEventListener("click", toggleNoteMode);
  hintButton.addEventListener("click", applyHint);
  checkButton.addEventListener("click", checkBoard);
  eraseButton.addEventListener("click", () => applyValue(0));
}

async function startNewGame(difficulty = "medium") {
  stopTimer();
  clearIncorrectFlash();

  state = {
    ...createEmptyState(),
    difficulty,
    isBusy: true,
    status: "loading",
  };

  setMessage("正在生成新的数独题目...");
  timerElement.textContent = "00:00";
  progressElement.textContent = "0/81";
  difficultyLabel.textContent = DIFFICULTIES[difficulty]?.label ?? DIFFICULTIES.medium.label;
  renderBoard([]);
  syncControls();

  await nextPaint();

  const game = createGame(difficulty);
  const fixed = new Set();

  game.puzzle.forEach((row, rowIndex) => {
    row.forEach((value, colIndex) => {
      if (value !== 0) {
        fixed.add(toIndex(rowIndex, colIndex));
      }
    });
  });

  state = {
    difficulty: game.difficulty,
    puzzle: game.puzzle,
    solution: game.solution,
    board: cloneBoard(game.puzzle),
    fixed,
    notes: createEmptyNotes(),
    selected: findFirstEditableCell(game.puzzle),
    noteMode: false,
    incorrect: new Set(),
    status: "playing",
    outcome: null,
    startedAt: Date.now(),
    finishedAt: 0,
    isBusy: false,
  };

  difficultySelect.value = game.difficulty;
  startTimer();
  setMessage("新题准备好了，开始解题吧。");
  render();
}

function resetBoard() {
  if (!state.puzzle.length || state.isBusy) {
    return;
  }

  clearIncorrectFlash();
  state = {
    ...state,
    board: cloneBoard(state.puzzle),
    notes: createEmptyNotes(),
    incorrect: new Set(),
    status: "playing",
    outcome: null,
    startedAt: Date.now(),
    finishedAt: 0,
  };
  startTimer();
  setMessage("棋盘已重置。");
  render();
}

function revealSolution() {
  if (!state.board.length || state.isBusy) {
    return;
  }

  const shouldReveal = window.confirm("确定要直接查看答案吗？当前进度会结束。");
  if (!shouldReveal) {
    return;
  }

  clearIncorrectFlash();
  state = {
    ...state,
    board: cloneBoard(state.solution),
    notes: createEmptyNotes(),
    incorrect: new Set(),
    status: "completed",
    outcome: "revealed",
    finishedAt: Date.now(),
  };
  stopTimer();
  setMessage("答案已显示，你可以直接开始下一局。");
  render();
}

function toggleNoteMode() {
  if (!state.board.length || state.isBusy || state.status === "completed") {
    return;
  }

  state = {
    ...state,
    noteMode: !state.noteMode,
  };
  setMessage(state.noteMode ? "笔记模式已开启。" : "笔记模式已关闭。");
  render();
}

function applyHint() {
  if (!state.board.length || state.isBusy || state.status === "completed") {
    return;
  }

  const target = resolveHintTarget();
  if (target === null) {
    setMessage("当前没有可提示的空格了。");
    return;
  }

  const row = Math.floor(target / BOARD_SIZE);
  const col = target % BOARD_SIZE;
  const value = state.solution[row][col];

  state.notes[target].clear();
  state.board[row][col] = value;
  clearPeerNotes(target, value);
  state.selected = target;
  clearIncorrectFlash();

  if (finishIfSolved("已填入一个提示。")) {
    return;
  }

  setMessage("已填入一个提示。");
  render();
}

function checkBoard() {
  if (!state.board.length || state.isBusy) {
    return;
  }

  const wrongCells = checkAgainstSolution(state.board, state.solution);
  const filledCells = countFilledCells(state.board);

  clearIncorrectFlash();

  if (wrongCells.length === 0 && filledCells === BOARD_SIZE * BOARD_SIZE) {
    finishIfSolved("全部正确，解题完成。");
    return;
  }

  if (wrongCells.length === 0) {
    setMessage(`目前没有发现错误，还有 ${BOARD_SIZE * BOARD_SIZE - filledCells} 个空格待填写。`);
    render();
    return;
  }

  state = {
    ...state,
    incorrect: new Set(wrongCells),
  };
  render();
  setMessage(`发现 ${wrongCells.length} 个位置不对，再检查一下。`);

  flashTimeoutId = window.setTimeout(() => {
    clearIncorrectFlash();
    render();
  }, 1800);
}

function handleKeydown(event) {
  if (!state.board.length || state.isBusy) {
    return;
  }

  if (event.metaKey || event.ctrlKey || event.altKey || document.activeElement?.tagName === "SELECT") {
    return;
  }

  if (event.key >= "1" && event.key <= "9") {
    event.preventDefault();
    applyValue(Number(event.key));
    return;
  }

  if (event.key === "Backspace" || event.key === "Delete" || event.key === "0") {
    event.preventDefault();
    applyValue(0);
    return;
  }

  if (event.key === "n" || event.key === "N") {
    event.preventDefault();
    toggleNoteMode();
    return;
  }

  const offsetMap = {
    ArrowUp: -BOARD_SIZE,
    ArrowDown: BOARD_SIZE,
    ArrowLeft: -1,
    ArrowRight: 1,
  };

  if (!(event.key in offsetMap)) {
    return;
  }

  event.preventDefault();
  moveSelection(event.key, offsetMap[event.key]);
}

function moveSelection(key, offset) {
  let next = state.selected;

  if (key === "ArrowUp" && next >= BOARD_SIZE) {
    next += offset;
  }
  if (key === "ArrowDown" && next < BOARD_SIZE * (BOARD_SIZE - 1)) {
    next += offset;
  }
  if (key === "ArrowLeft" && next % BOARD_SIZE !== 0) {
    next += offset;
  }
  if (key === "ArrowRight" && next % BOARD_SIZE !== BOARD_SIZE - 1) {
    next += offset;
  }

  state = {
    ...state,
    selected: next,
  };
  render();
}

function applyValue(value) {
  if (state.status === "completed" || state.isBusy) {
    return;
  }

  const index = state.selected;
  if (state.fixed.has(index)) {
    setMessage("这个位置是题目给定数字，不能修改。");
    return;
  }

  const row = Math.floor(index / BOARD_SIZE);
  const col = index % BOARD_SIZE;

  clearIncorrectFlash();

  if (state.noteMode && value !== 0) {
    if (state.board[row][col] !== 0) {
      setMessage("笔记模式下只能在空格里记录候选数。");
      render();
      return;
    }

    toggleNote(index, value);
    setMessage(`已${state.notes[index].has(value) ? "添加" : "移除"}笔记 ${value}。`);
    render();
    return;
  }

  state.board[row][col] = value;
  state.notes[index].clear();

  if (value !== 0) {
    clearPeerNotes(index, value);
  }

  if (finishIfSolved(value === 0 ? "已清除当前格。": `已填写数字 ${value}。`)) {
    return;
  }

  setMessage(value === 0 ? "已清除当前格。" : `已填写数字 ${value}。`);
  render();
}

function toggleNote(index, value) {
  if (state.notes[index].has(value)) {
    state.notes[index].delete(value);
    return;
  }

  state.notes[index].add(value);
}

function clearPeerNotes(index, value) {
  for (const peer of getPeerIndices(index)) {
    state.notes[peer].delete(value);
  }
}

function resolveHintTarget() {
  const currentIndex = state.selected;
  const row = Math.floor(currentIndex / BOARD_SIZE);
  const col = currentIndex % BOARD_SIZE;

  if (!state.fixed.has(currentIndex) && state.board[row][col] === 0) {
    return currentIndex;
  }

  for (let index = 0; index < BOARD_SIZE * BOARD_SIZE; index += 1) {
    const nextRow = Math.floor(index / BOARD_SIZE);
    const nextCol = index % BOARD_SIZE;
    if (state.board[nextRow][nextCol] === 0) {
      return index;
    }
  }

  return null;
}

function finishIfSolved(progressMessage) {
  if (!isSolved(state.board, state.solution)) {
    return false;
  }

  const finishedAt = Date.now();
  state = {
    ...state,
    status: "completed",
    outcome: "win",
    finishedAt,
  };
  stopTimer();
  setMessage(`恭喜，数独完成，用时 ${formatDuration(finishedAt - state.startedAt)}。`);
  render();
  return true;
}

function render() {
  difficultyLabel.textContent = DIFFICULTIES[state.difficulty]?.label ?? DIFFICULTIES.medium.label;
  progressElement.textContent = `${countFilledCells(state.board)}/81`;
  renderBoard(state.board);
  syncControls();
  syncTimer();
}

function renderBoard(board) {
  boardElement.innerHTML = "";

  if (!board.length) {
    return;
  }

  const conflicts = getConflicts(board);
  const selectedValue = getCellValue(state.selected);
  const selectedRow = Math.floor(state.selected / BOARD_SIZE);
  const selectedCol = state.selected % BOARD_SIZE;
  const fragment = document.createDocumentFragment();

  for (let index = 0; index < BOARD_SIZE * BOARD_SIZE; index += 1) {
    const row = Math.floor(index / BOARD_SIZE);
    const col = index % BOARD_SIZE;
    const value = board[row][col];
    const button = document.createElement("button");

    button.type = "button";
    button.className = buildCellClassName({
      index,
      row,
      col,
      value,
      conflicts,
      selectedValue,
      selectedRow,
      selectedCol,
    });
    button.dataset.index = String(index);
    button.setAttribute("role", "gridcell");
    button.setAttribute(
      "aria-label",
      value === 0 ? `第 ${row + 1} 行第 ${col + 1} 列，空格` : `第 ${row + 1} 行第 ${col + 1} 列，数字 ${value}`
    );

    if (value === 0) {
      const notes = state.notes[index];
      if (notes.size > 0) {
        const notesGrid = document.createElement("span");
        notesGrid.className = "notes-grid";
        for (let digit = 1; digit <= 9; digit += 1) {
          const note = document.createElement("span");
          note.textContent = notes.has(digit) ? String(digit) : "";
          notesGrid.appendChild(note);
        }
        button.appendChild(notesGrid);
      }
    } else {
      const valueElement = document.createElement("span");
      valueElement.className = "cell-value";
      valueElement.textContent = String(value);
      button.appendChild(valueElement);
    }

    fragment.appendChild(button);
  }

  boardElement.appendChild(fragment);
}

function buildCellClassName({ index, row, col, value, conflicts, selectedValue, selectedRow, selectedCol }) {
  const classes = ["cell"];

  if (row % 3 === 0) {
    classes.push("cell--thick-top");
  }
  if (col % 3 === 0) {
    classes.push("cell--thick-left");
  }
  if (row === BOARD_SIZE - 1) {
    classes.push("cell--thick-bottom");
  }
  if (col === BOARD_SIZE - 1) {
    classes.push("cell--thick-right");
  }
  if (state.fixed.has(index)) {
    classes.push("cell--fixed");
  }
  if (index === state.selected) {
    classes.push("cell--selected");
  }
  if (row === selectedRow || col === selectedCol || sameBox(row, col, selectedRow, selectedCol)) {
    classes.push("cell--related");
  }
  if (selectedValue !== 0 && value === selectedValue) {
    classes.push("cell--matching");
  }
  if (conflicts.has(index)) {
    classes.push("cell--conflict");
  }
  if (state.incorrect.has(index)) {
    classes.push("cell--incorrect");
  }
  if (state.status === "completed") {
    classes.push("cell--completed");
  }

  return classes.join(" ");
}

function syncControls() {
  const disabled = state.isBusy;
  const ended = state.status === "completed";

  newGameButton.disabled = disabled;
  difficultySelect.disabled = disabled;
  resetButton.disabled = disabled || !state.board.length;
  solveButton.disabled = disabled || !state.board.length;
  noteButton.disabled = disabled || ended || !state.board.length;
  hintButton.disabled = disabled || ended || !state.board.length;
  checkButton.disabled = disabled || !state.board.length;
  eraseButton.disabled = disabled || ended || !state.board.length || state.fixed.has(state.selected);

  noteButton.textContent = `笔记模式：${state.noteMode ? "开" : "关"}`;
  noteButton.setAttribute("aria-pressed", state.noteMode ? "true" : "false");

  padElement.querySelectorAll("button").forEach((button) => {
    if (button.dataset.role === "clear") {
      button.disabled = disabled || ended || !state.board.length || state.fixed.has(state.selected);
      return;
    }

    button.disabled = disabled || ended || !state.board.length;
  });
}

function createNumberPad() {
  const fragment = document.createDocumentFragment();

  NUMBER_PAD_VALUES.forEach((value) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "pad-button";
    button.textContent = String(value);
    button.addEventListener("click", () => applyValue(value));
    fragment.appendChild(button);
  });

  const clearButton = document.createElement("button");
  clearButton.type = "button";
  clearButton.className = "pad-button pad-button--wide";
  clearButton.dataset.role = "clear";
  clearButton.textContent = "清空";
  clearButton.addEventListener("click", () => applyValue(0));
  fragment.appendChild(clearButton);

  padElement.appendChild(fragment);
}

function startTimer() {
  stopTimer();
  syncTimer();
  timerId = window.setInterval(syncTimer, 1000);
}

function stopTimer() {
  if (timerId !== null) {
    window.clearInterval(timerId);
    timerId = null;
  }
}

function syncTimer() {
  if (!state.startedAt) {
    timerElement.textContent = "00:00";
    return;
  }

  const reference = state.status === "completed" ? state.finishedAt : Date.now();
  timerElement.textContent = formatDuration(reference - state.startedAt);
}

function setMessage(message) {
  messageElement.textContent = message;
}

function formatDuration(durationMs) {
  const totalSeconds = Math.max(0, Math.floor(durationMs / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function findFirstEditableCell(board) {
  for (let index = 0; index < BOARD_SIZE * BOARD_SIZE; index += 1) {
    const row = Math.floor(index / BOARD_SIZE);
    const col = index % BOARD_SIZE;
    if (board[row][col] === 0) {
      return index;
    }
  }

  return 0;
}

function getCellValue(index) {
  if (!state.board.length) {
    return 0;
  }

  const row = Math.floor(index / BOARD_SIZE);
  const col = index % BOARD_SIZE;
  return state.board[row][col];
}

function getPeerIndices(index) {
  const row = Math.floor(index / BOARD_SIZE);
  const col = index % BOARD_SIZE;
  const peers = new Set();

  for (let pointer = 0; pointer < BOARD_SIZE; pointer += 1) {
    peers.add(toIndex(row, pointer));
    peers.add(toIndex(pointer, col));
  }

  const boxRowStart = Math.floor(row / 3) * 3;
  const boxColStart = Math.floor(col / 3) * 3;
  for (let rowOffset = 0; rowOffset < 3; rowOffset += 1) {
    for (let colOffset = 0; colOffset < 3; colOffset += 1) {
      peers.add(toIndex(boxRowStart + rowOffset, boxColStart + colOffset));
    }
  }

  peers.delete(index);
  return peers;
}

function sameBox(rowA, colA, rowB, colB) {
  return Math.floor(rowA / 3) === Math.floor(rowB / 3) && Math.floor(colA / 3) === Math.floor(colB / 3);
}

function clearIncorrectFlash() {
  if (flashTimeoutId !== null) {
    window.clearTimeout(flashTimeoutId);
    flashTimeoutId = null;
  }

  state = {
    ...state,
    incorrect: new Set(),
  };
}

function toIndex(row, col) {
  return row * BOARD_SIZE + col;
}

function nextPaint() {
  return new Promise((resolve) => window.requestAnimationFrame(() => resolve()));
}
