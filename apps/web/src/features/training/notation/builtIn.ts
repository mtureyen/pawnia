/**
 * Positions for the moves part when the user has no games yet, or none with some kind of notation
 * (their games rarely have a promotion or two rooks on one file). Short and well known, and
 * between them every kind of notation: captures, checks and mate, castling on both sides,
 * promotion (to a queen and below), and which-piece letters by file and by rank.
 */
export const BUILT_IN_LINES: readonly { source: string; fen?: string; moves: string }[] = [
  {
    source: 'the Opera Game (Morphy, Paris 1858)',
    moves:
      'e4 e5 Nf3 d6 d4 Bg4 dxe5 Bxf3 Qxf3 dxe5 Bc4 Nf6 Qb3 Qe7 Nc3 c6 Bg5 b5 Nxb5 cxb5 Bxb5+ Nbd7 O-O-O Rd8 Rxd7 Rxd7 Rd1 Qe6 Bxd7+ Nxd7 Qb8+ Nxb8 Rd8#',
  },
  {
    source: 'the Ruy Lopez, Breyer Variation',
    moves:
      'e4 e5 Nf3 Nc6 Bb5 a6 Ba4 Nf6 O-O Be7 Re1 b5 Bb3 d6 c3 O-O h3 Nb8 d4 Nbd7 Nbd2 Bb7 Bc2 Re8 Nf1 Bf8 Ng3',
  },
  {
    source: 'Legall’s mate',
    moves: 'e4 e5 Nf3 d6 Bc4 Bg4 Nc3 g6 Nxe5 Bxd1 Bxf7+ Ke7 Nd5#',
  },
  {
    source: 'the Fool’s mate',
    moves: 'f3 e5 g4 Qh4#',
  },
  {
    source: 'the Saavedra position (1895)',
    fen: '8/8/1KP5/3r4/8/8/8/k7 w - - 0 1',
    moves: 'c7 Rd6+ Kb5 Rd5+ Kb4 Rd4+ Kb3 Rd3+ Kc2 Rd4 c8=R Ra4 Kb3',
  },
  {
    source: 'a queen race',
    fen: '8/1P6/8/8/8/k7/6p1/4K3 w - - 0 1',
    moves: 'b8=Q g1=Q+ Kd2 Qf2+ Kc3 Qe3+ Kc4',
  },
  {
    source: 'two rooks on one file',
    fen: '6k1/5ppp/8/R7/8/8/5PPP/R5K1 w - - 0 1',
    moves: 'R1a3 h6 Ra8+ Kh7 R3a7 g5 Rxf7+ Kg6',
  },
]
