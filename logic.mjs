export const BOARD_SIZE = 9;
export const BOX_SIZE = 3;
export const DIGITS = Object.freeze([1, 2, 3, 4, 5, 6, 7, 8, 9]);

export const DIFFICULTIES = Object.freeze({
  easy: { label: "简单", blanks: 38, attempts: 5 },
  medium: { label: "中等", blanks: 46, attempts: 6 },
  hard: { label: "困难", blanks: 52, attempts: 7 },
});

export function createGame(difficulty = "medium", random = Math.random) {
  const level = DIFFICULTIES[difficulty] ? difficulty : "medium";
  const config = DIFFICULTIES[level];
  let bestResult = null;

  for (let attempt = 0; attempt < config.attempts; attempt += 1) {
    const solution = createSolvedBoard(random);
    const { puzzle, removed } = carvePuzzle(solution, config.blanks, random);
    const result = {
      difficulty: level,
      puzzle,
      solution,
      removed,
      givens: BOARD_SIZE * BOARD_SIZE - removed,
    };

    if (!bestResult || removed > bestResult.removed) {
      bestResult = result;
    }

    if (removed >= config.blanks) {
      return result;
    }
  }

  return bestResult;
}

export function createSolvedBoard(random = Math.random) {
  const digits = shuffle([...DIGITS], random);
  const rows = buildAxisOrder(random);
  const cols = buildAxisOrder(random);

  return rows.map((row) =>
    cols.map((col) => digits[pattern(row, col)])
  );
}

export function solveBoard(board) {
  const workingBoard = cloneBoard(board);
  const solved = solveMutable(workingBoard);
  return solved ? workingBoard : null;
}

export function countSolutions(board, limit = 2) {
  const workingBoard = cloneBoard(board);
  return countSolutionsMutable(workingBoard, limit);
}

export function cloneBoard(board) {
  return board.map((row) => [...row]);
}

export function countFilledCells(board) {
  return board.reduce(
    (total, row) => total + row.reduce((rowTotal, value) => rowTotal + (value === 0 ? 0 : 1), 0),
    0
  );
}

export function getCandidates(board, row, col) {
  if (board[row][col] !== 0) {
    return [];
  }

  return DIGITS.filter((value) => isPlacementValid(board, row, col, value));
}

export function isPlacementValid(board, row, col, value) {
  for (let index = 0; index < BOARD_SIZE; index += 1) {
    if (board[row][index] === value || board[index][col] === value) {
      return false;
    }
  }

  const boxRowStart = Math.floor(row / BOX_SIZE) * BOX_SIZE;
  const boxColStart = Math.floor(col / BOX_SIZE) * BOX_SIZE;

  for (let rowOffset = 0; rowOffset < BOX_SIZE; rowOffset += 1) {
    for (let colOffset = 0; colOffset < BOX_SIZE; colOffset += 1) {
      if (board[boxRowStart + rowOffset][boxColStart + colOffset] === value) {
        return false;
      }
    }
  }

  return true;
}

export function getConflicts(board) {
  const conflicts = new Set();

  for (let row = 0; row < BOARD_SIZE; row += 1) {
    collectUnitConflicts(
      board[row].map((value, col) => ({ value, index: toIndex(row, col) })),
      conflicts
    );
  }

  for (let col = 0; col < BOARD_SIZE; col += 1) {
    collectUnitConflicts(
      board.map((row, rowIndex) => ({ value: row[col], index: toIndex(rowIndex, col) })),
      conflicts
    );
  }

  for (let boxRow = 0; boxRow < BOARD_SIZE; boxRow += BOX_SIZE) {
    for (let boxCol = 0; boxCol < BOARD_SIZE; boxCol += BOX_SIZE) {
      const cells = [];
      for (let rowOffset = 0; rowOffset < BOX_SIZE; rowOffset += 1) {
        for (let colOffset = 0; colOffset < BOX_SIZE; colOffset += 1) {
          const row = boxRow + rowOffset;
          const col = boxCol + colOffset;
          cells.push({ value: board[row][col], index: toIndex(row, col) });
        }
      }
      collectUnitConflicts(cells, conflicts);
    }
  }

  return conflicts;
}

export function checkAgainstSolution(board, solution) {
  const wrongCells = [];

  for (let row = 0; row < BOARD_SIZE; row += 1) {
    for (let col = 0; col < BOARD_SIZE; col += 1) {
      const value = board[row][col];
      if (value !== 0 && value !== solution[row][col]) {
        wrongCells.push(toIndex(row, col));
      }
    }
  }

  return wrongCells;
}

export function isSolved(board, solution) {
  return checkAgainstSolution(board, solution).length === 0 && countFilledCells(board) === BOARD_SIZE * BOARD_SIZE;
}

function carvePuzzle(solution, targetBlanks, random) {
  const puzzle = cloneBoard(solution);
  const positions = shuffle(
    Array.from({ length: BOARD_SIZE * BOARD_SIZE }, (_, index) => index),
    random
  );
  let removed = 0;

  for (const index of positions) {
    if (removed >= targetBlanks) {
      break;
    }

    const row = Math.floor(index / BOARD_SIZE);
    const col = index % BOARD_SIZE;
    const value = puzzle[row][col];

    if (value === 0) {
      continue;
    }

    puzzle[row][col] = 0;
    if (countSolutionsMutable(cloneBoard(puzzle), 2) !== 1) {
      puzzle[row][col] = value;
      continue;
    }

    removed += 1;
  }

  return { puzzle, removed };
}

function solveMutable(board) {
  const target = findBestEmptyCell(board);
  if (!target) {
    return true;
  }

  for (const candidate of target.candidates) {
    board[target.row][target.col] = candidate;
    if (solveMutable(board)) {
      return true;
    }
  }

  board[target.row][target.col] = 0;
  return false;
}

function countSolutionsMutable(board, limit) {
  const target = findBestEmptyCell(board);
  if (!target) {
    return 1;
  }

  let total = 0;

  for (const candidate of target.candidates) {
    board[target.row][target.col] = candidate;
    total += countSolutionsMutable(board, limit - total);
    if (total >= limit) {
      board[target.row][target.col] = 0;
      return total;
    }
  }

  board[target.row][target.col] = 0;
  return total;
}

function findBestEmptyCell(board) {
  let bestCell = null;

  for (let row = 0; row < BOARD_SIZE; row += 1) {
    for (let col = 0; col < BOARD_SIZE; col += 1) {
      if (board[row][col] !== 0) {
        continue;
      }

      const candidates = getCandidates(board, row, col);
      if (candidates.length === 0) {
        return { row, col, candidates };
      }

      if (!bestCell || candidates.length < bestCell.candidates.length) {
        bestCell = { row, col, candidates };
      }
    }
  }

  return bestCell;
}

function collectUnitConflicts(cells, conflicts) {
  const groups = new Map();

  for (const cell of cells) {
    if (cell.value === 0) {
      continue;
    }

    const group = groups.get(cell.value) ?? [];
    group.push(cell.index);
    groups.set(cell.value, group);
  }

  groups.forEach((indices) => {
    if (indices.length < 2) {
      return;
    }

    indices.forEach((index) => conflicts.add(index));
  });
}

function buildAxisOrder(random) {
  return shuffle([0, 1, 2], random).flatMap((group) =>
    shuffle([0, 1, 2], random).map((offset) => group * BOX_SIZE + offset)
  );
}

function pattern(row, col) {
  return (BOX_SIZE * (row % BOX_SIZE) + Math.floor(row / BOX_SIZE) + col) % BOARD_SIZE;
}

function shuffle(values, random) {
  const result = [...values];

  for (let index = result.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    [result[index], result[swapIndex]] = [result[swapIndex], result[index]];
  }

  return result;
}

function toIndex(row, col) {
  return row * BOARD_SIZE + col;
}
