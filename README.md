# Multiplayer Chess

Chess in the browser with three ways to play:

- **Online**: create a game, send your friend a link, and play from two different computers. No accounts, no sign-up.
- **Pass & play**: two players on one screen, with an optional clock.
- **Vs bot**: 11 bots from Beginner to World Boss. Pick your colour and clock.

It is a plain website (HTML, CSS and JavaScript). There is no server code to run.

## Put it online with GitHub Pages (free)

You need this once, so your friend has a link to open.

1. Unzip this folder.
2. On GitHub, click **+** then **New repository**. Name it `chess`, set it to **Public**, and click **Create repository**.
3. On the new empty repository page, click **uploading an existing file**.
4. Drag in everything that is *inside* the unzipped folder (`index.html`, `css`, `js`, `vendor`, `tests`, `README.md`). `index.html` must end up at the top level of the repository, not inside another folder. Click **Commit changes**.
5. Go to **Settings**, then **Pages**. Under *Build and deployment*, set **Source** to *Deploy from a branch*, choose branch **main** and folder **/ (root)**, then **Save**.
6. After a minute or two the address appears at the top of that Pages screen. It looks like `https://YOUR-USERNAME.github.io/chess/`.
7. Open it, stay on the **Online** tab, choose your colour and clock, and click **Create game & get link**. Send the link to your friend. When they open it, the game starts.

Any static host works too (Netlify, Cloudflare Pages, Vercel). Just upload the same files.

Opening `index.html` straight from your computer works for Pass & play and Vs bot. Online play needs the hosted version, because the link has to be a web address your friend can open.

## How online play works

- You click **Create game**. Your browser registers a short game code with the free public [PeerJS](https://peerjs.com) matchmaking server.
- Your friend opens the link, which carries that code. Their browser asks the matchmaking server how to reach yours, and then the two browsers talk **directly** to each other.
- Moves, the clock, draw offers and rematches all travel between the two browsers. Nothing is stored anywhere.
- If your friend refreshes, they rejoin from the same link and the board comes back. If **you** refresh, the page offers to resume your game. Clocks pause while either of you is disconnected.
- A game holds exactly two players. A third person opening the link is told the game is full.

### Good to know

- Both players need to be online at the same time.
- The matchmaking server is free and public, so there is no guarantee it is always up. If it is down, online play will say it can't connect. Pass & play and Vs bot are unaffected.
- A few strict networks (some offices and schools) block direct connections. PeerJS tries relay servers as a fallback, which helps in most cases but not all.
- Your two browsers can see each other's IP address. This is normal for direct connections.
- The repository and page are public. Game codes are random and a game only takes two players, so strangers can't join yours unless they get your link.

## Rules

All piece moves, check, checkmate and stalemate, castling, en passant, and pawn promotion (you choose the piece). Draws by stalemate, not enough pieces, threefold repetition, and 50 moves without a capture or pawn move. With a clock, it starts after White's first move and running out of time loses.

## Checking that it works

The rules and the bots have automated tests you can run with [Node.js](https://nodejs.org):

```bash
node tests/perft.js   # counts every legal move sequence from reference positions and compares with published totals
node tests/ai.js      # bots find mates, win material, and stay within their time limits
```

## Files

| File | What it does |
| --- | --- |
| `index.html`, `css/style.css` | Page and styling |
| `js/engine.js` | Chess rules (no screen code, so it is testable) |
| `js/ai.js` | The bots |
| `js/net.js` | Online connection (wraps PeerJS) |
| `js/app.js` | Board, clocks, modes and online game logic |
| `vendor/peerjs.min.js` | PeerJS 1.5.5 (MIT licence, see `vendor/PEERJS-LICENSE.txt`) |
