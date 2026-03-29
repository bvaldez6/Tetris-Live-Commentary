from dataclasses import dataclass
from typing import List, Dict, Tuple, Optional

import cv2
import numpy as np


@dataclass
class TetrisState:
    board: List[List[int]]  # 0 = empty, 1 = filled
    current_piece: str = "Unknown"
    next_piece: str = "Unknown"
    lines_cleared: int = 0
    score: int = 0


class TetrisCommentaryEngine:
    def __init__(self) -> None:
        self.previous_state: Optional[TetrisState] = None

    def board_height(self, board: List[List[int]]) -> int:
        rows = len(board)
        for r in range(rows):
            if any(board[r]):
                return rows - r
        return 0

    def count_holes(self, board: List[List[int]]) -> int:
        holes = 0
        cols = len(board[0]) if board else 0
        rows = len(board)
        for c in range(cols):
            seen_block = False
            for r in range(rows):
                if board[r][c] == 1:
                    seen_block = True
                elif seen_block and board[r][c] == 0:
                    holes += 1
        return holes

    def stack_bumpiness(self, board: List[List[int]]) -> int:
        heights = []
        rows = len(board)
        cols = len(board[0]) if board else 0
        for c in range(cols):
            h = 0
            for r in range(rows):
                if board[r][c] == 1:
                    h = rows - r
                    break
            heights.append(h)
        return sum(abs(heights[i] - heights[i + 1]) for i in range(len(heights) - 1))

    def get_features(self, state: TetrisState) -> Dict[str, int | str]:
        return {
            "height": self.board_height(state.board),
            "holes": self.count_holes(state.board),
            "bumpiness": self.stack_bumpiness(state.board),
            "current_piece": state.current_piece,
            "next_piece": state.next_piece,
            "lines_cleared": state.lines_cleared,
            "score": state.score,
        }

    def detect_line_clear(self, current: TetrisState) -> int:
        if self.previous_state is None:
            return current.lines_cleared

        prev_filled = sum(sum(row) for row in self.previous_state.board)
        curr_filled = sum(sum(row) for row in current.board)

        # Very rough guess: if the filled count drops, a line clear likely happened.
        if curr_filled < prev_filled - 3:
            return 1
        return current.lines_cleared

    def generate_commentary(self, state: TetrisState) -> str:
        state.lines_cleared = self.detect_line_clear(state)
        f = self.get_features(state)

        height = int(f["height"])
        holes = int(f["holes"])
        bumpiness = int(f["bumpiness"])
        lines_cleared = int(f["lines_cleared"])
        current_piece = str(f["current_piece"])
        next_piece = str(f["next_piece"])

        comments: List[str] = []

        if lines_cleared >= 4:
            comments.append("A huge tetris clear just happened.")
        elif lines_cleared == 3:
            comments.append("That move clears three lines at once.")
        elif lines_cleared == 2:
            comments.append("A clean double line clear helps stabilize the board.")
        elif lines_cleared == 1:
            comments.append("A line clear just happened.")

        if height >= 16:
            comments.append("The stack is getting dangerously high.")
        elif height >= 10:
            comments.append("The board is in a moderate state right now.")
        else:
            comments.append("The board looks relatively safe.")

        if holes >= 6:
            comments.append("There are a lot of holes building up in the stack.")
        elif holes >= 2:
            comments.append("A few holes are starting to make placement trickier.")
        else:
            comments.append("The stack is fairly clean with very few holes.")

        if bumpiness >= 18:
            comments.append("The surface is rough, which could make the next move awkward.")
        elif bumpiness <= 6:
            comments.append("The top of the stack is nicely flattened out.")

        if current_piece == "I":
            comments.append("The I-piece gives a strong chance for a long clear.")
        elif current_piece == "T":
            comments.append("The T-piece offers flexible placement options.")
        elif current_piece in {"S", "Z"}:
            comments.append("This piece can be awkward if the surface is uneven.")

        comments.append(f"The current piece is {current_piece}, and the next piece is {next_piece}.")

        self.previous_state = state
        return " ".join(comments)


class TetrisImageParser:
    """
    Very simple screenshot-to-board parser.

    Assumptions:
    - The board position is known or easy to crop.
    - The screenshot uses a consistent layout.
    - Filled cells are visually brighter or more colorful than empty cells.
    """

    def __init__(
        self,
        rows: int = 20,
        cols: int = 10,
        filled_threshold: float = 40.0,
    ) -> None:
        self.rows = rows
        self.cols = cols
        self.filled_threshold = filled_threshold

    def load_image(self, image_path: str) -> np.ndarray:
        image = cv2.imread(image_path)
        if image is None:
            raise FileNotFoundError(f"Could not open image: {image_path}")
        return image

    def crop_board(
        self,
        image: np.ndarray,
        board_top_left: Tuple[int, int],
        board_bottom_right: Tuple[int, int],
    ) -> np.ndarray:
        x1, y1 = board_top_left
        x2, y2 = board_bottom_right
        return image[y1:y2, x1:x2]

    def cell_is_filled(self, cell: np.ndarray) -> int:
        gray = cv2.cvtColor(cell, cv2.COLOR_BGR2GRAY)
        mean_intensity = float(np.mean(gray))
        return 1 if mean_intensity > self.filled_threshold else 0

    def parse_board_from_crop(self, board_img: np.ndarray) -> List[List[int]]:
        h, w = board_img.shape[:2]
        cell_h = h / self.rows
        cell_w = w / self.cols

        board: List[List[int]] = []
        for r in range(self.rows):
            row_vals = []
            for c in range(self.cols):
                y1 = int(r * cell_h)
                y2 = int((r + 1) * cell_h)
                x1 = int(c * cell_w)
                x2 = int((c + 1) * cell_w)
                cell = board_img[y1:y2, x1:x2]
                row_vals.append(self.cell_is_filled(cell))
            board.append(row_vals)
        return board

    def parse_image(
        self,
        image_path: str,
        board_top_left: Tuple[int, int],
        board_bottom_right: Tuple[int, int],
        current_piece: str = "Unknown",
        next_piece: str = "Unknown",
        score: int = 0,
    ) -> TetrisState:
        image = self.load_image(image_path)
        board_crop = self.crop_board(image, board_top_left, board_bottom_right)
        board = self.parse_board_from_crop(board_crop)
        return TetrisState(
            board=board,
            current_piece=current_piece,
            next_piece=next_piece,
            score=score,
        )


def print_board(board: List[List[int]]) -> None:
    for row in board:
        print(" ".join(str(x) for x in row))


if __name__ == "__main__":
    # Example usage.
    # Replace these coordinates with the board location in your screenshot.
    image_path = "tetris_screenshot.png"
    board_top_left = (100, 50)
    board_bottom_right = (300, 450)

    parser = TetrisImageParser(rows=20, cols=10, filled_threshold=40.0)
    engine = TetrisCommentaryEngine()

    try:
        state = parser.parse_image(
            image_path=image_path,
            board_top_left=board_top_left,
            board_bottom_right=board_bottom_right,
            current_piece="Unknown",
            next_piece="Unknown",
            score=0,
        )

        print("Detected board matrix:")
        print_board(state.board)
        print()
        print("Generated commentary:")
        print(engine.generate_commentary(state))

    except FileNotFoundError as e:
        print(e)
        print("Add a screenshot named 'tetris_screenshot.png' and update the board coordinates.")
