import test from "node:test";
import assert from "node:assert/strict";

import {
  BOARD_SIZE,
  checkAgainstSolution,
  countSolutions,
  createGame,
  createSolvedBoard,
  getConflicts,
  solveBoard,
} from "./logic.mjs";

test("createSolvedBoard returns a valid completed board", () => {
  const board = createSolvedBoard(() => 0.25);

  for (let row = 0; row < BOARD_SIZE; row += 1) {
    assert.deepEqual([...board[row]].sort(), [1, 2, 3, 4, 5, 6, 7, 8, 9]);
  }

  for (let col = 0; col < BOARD_SIZE; col += 1) {
    const values = board.map((row) => row[col]).sort();
    assert.deepEqual(values, [1, 2, 3, 4, 5, 6, 7, 8, 9]);
  }
});

test("createGame generates a puzzle with a unique solution", () => {
  const game = createGame("easy", () => Math.random());
  const solved = solveBoard(game.puzzle);

  assert.deepEqual(solved, game.solution);
  assert.equal(countSolutions(game.puzzle, 2), 1);
});

test("getConflicts marks repeated numbers in rows, columns, and boxes", () => {
  const board = [
    [5, 5, 0, 0, 0, 0, 0, 0, 0],
    [5, 0, 0, 0, 0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0, 0, 0, 0, 0],
  ];

  const conflicts = getConflicts(board);

  assert.equal(conflicts.has(0), true);
  assert.equal(conflicts.has(1), true);
  assert.equal(conflicts.has(9), true);
});

test("checkAgainstSolution only reports filled cells that are wrong", () => {
  const solution = createSolvedBoard(() => 0.4);
  const board = solution.map((row) => [...row]);

  board[0][0] = board[0][1];
  board[0][1] = 0;

  const wrong = checkAgainstSolution(board, solution);

  assert.deepEqual(wrong, [0]);
});
