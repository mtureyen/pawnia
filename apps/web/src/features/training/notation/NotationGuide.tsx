/** The rules of chess notation in plain words, for someone who has never read a score sheet. */
export function NotationGuide() {
  return (
    <section className="stats-section notation-guide" aria-label="How notation works">
      <h2>How notation works</h2>
      <dl>
        <dt>Squares</dt>
        <dd>
          Every square has a name: its file (column) <b>a</b> to <b>h</b>, from White’s left to
          right, then its rank (row) <b>1</b> to <b>8</b>, counted from White’s side. White’s king
          starts on e1, Black’s on e8. Seen from Black, the board is turned: h1 is at the top left.
        </dd>
        <dt>Pieces</dt>
        <dd>
          <b>K</b> king, <b>Q</b> queen, <b>R</b> rook, <b>B</b> bishop, <b>N</b> knight (K is taken
          by the king). A pawn has no letter.
        </dd>
        <dt>A move</dt>
        <dd>
          The piece’s letter, then the square it goes to: <b>Nf3</b> is a knight going to f3,{' '}
          <b>e4</b> a pawn going to e4. Where the piece came from is left out when it’s clear.
        </dd>
        <dt>
          Taking: <b>x</b>
        </dt>
        <dd>
          An <b>x</b> before the square: <b>Bxe5</b> is a bishop taking on e5. A pawn capture starts
          with the file the pawn came from: <b>exd5</b> is the e-pawn taking on d5. Taking en
          passant is written the same way.
        </dd>
        <dt>
          Check <b>+</b> and mate <b>#</b>
        </dt>
        <dd>
          <b>+</b> at the end of a move that gives check, as in <b>Bb5+</b>; <b>#</b> for checkmate,
          as in <b>Qh4#</b>.
        </dd>
        <dt>
          Castling <b>O-O</b> and <b>O-O-O</b>
        </dt>
        <dd>
          <b>O-O</b> castles short, on the king’s side (the king goes to g1 or g8); <b>O-O-O</b>{' '}
          castles long, on the queen’s side (to c1 or c8). Some books write zeros: 0-0.
        </dd>
        <dt>
          Promotion <b>=Q</b>
        </dt>
        <dd>
          A pawn reaching the last rank becomes another piece, written after an <b>=</b>:{' '}
          <b>e8=Q</b> makes a queen, <b>exd8=N+</b> takes on d8, becomes a knight and gives check.
        </dd>
        <dt>Which piece?</dt>
        <dd>
          When two pieces of the same kind can go to the same square, the move says which one: the
          file it comes from (<b>Nbd2</b>: the knight from the b-file), or the rank when both stand
          on one file (<b>R1e3</b>: the rook from rank 1), or both in the rare case neither is
          enough (<b>Qh4e1</b>).
        </dd>
        <dt>Move numbers</dt>
        <dd>
          <b>1. e4 e5 2. Nf3</b>: the number counts a move of each side. <b>2... Nc6</b> is Black’s
          second move. Signs like <b>!</b> (good) and <b>?</b> (a mistake) are comments, not part of
          the move.
        </dd>
      </dl>
    </section>
  )
}
