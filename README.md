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

**The link never changes.** It is saved in your browser, so every time you click Create game you get the same link. Send it to your friend once and keep it in your chat. Whenever you open the page and click Create game, the same link works again. (Use "Use a brand new link instead" if you ever want a fresh one. Anyone with the link can join while you are waiting, so only share it with people you trust.)

**Reactions:** when a queen is captured, both players see a big face, a caption and falling emojis. Online, the row of sticker buttons under the controls sends a reaction to your friend's screen.

Any static host works too (Netlify, Cloudflare Pages, Vercel). Just upload the same files.

Opening `index.html` straight from your computer works for Pass & play and Vs bot. Online play needs the hosted version, because the link has to be a web address your friend can open.

## Won't connect? Use Direct mode (same Wi-Fi, no server)

Normal online play needs the free PeerJS matchmaking server on the internet. If the link just says "Connecting", open **Won't connect? Play directly on the same Wi-Fi** on the Online tab:

1. One player clicks **I'll host**, then **Copy code**, and sends the code to the other player (WhatsApp works).
2. The other player clicks **I'll join**, pastes the code, clicks **Make reply code**, then copies the reply and sends it back.
3. The host pastes the reply and clicks **Connect**. The game starts.

This uses no server at all, so it works even when the matchmaking server is down. You need a new pair of codes for each session, but rematches inside a session don't need new codes. It needs both devices on the same normal Wi-Fi. Guest or public Wi-Fi often blocks devices from seeing each other.

**Test my connection** (in the same section) checks the game library, the matchmaking server and your network, and says which one is the problem.

## Metered (works even on networks that block everything else)

Some networks, such as company networks, block every way two browsers can connect to each other, including relays. Ordinary secure websites still work there, so the game can send its moves through Metered's messaging server instead. Chess sends only a few small messages a minute.

1. At metered.ca, open **Realtime Messaging**, then **Keys**, then **Create key**. Choose type **Publishable**, with **Subscribe** and **Publish** switched on.
2. Copy the key. It starts with `pk_live_`.
3. Open `js/config.js` in your repo, click the pencil icon, and paste the key between the quotes on the line `window.CHESS_REALTIME_KEY = "";`. Commit.
4. Wait a minute, press Ctrl+F5, and run **Test my connection**. You want `OK Metered messaging works`.

With this key set, online games always go through Metered. Your link, refreshes, rematches, draw offers and stickers all work the same way. The key is visible in your public repo; the worst someone can do is use up your free allowance, and you can delete it and make a new one in the dashboard.

## Relay (fixes "won't connect" on the same Wi-Fi)

If **Test my connection** shows no `relay` in "Address types found", and two computers on the same Wi-Fi won't connect, your router is blocking them from reaching each other. A relay server carries the game around that block. The free public relays built into the game may be down, so you can add your own free one:

1. Sign up for a free account at metered.ca and create a TURN server app. The free plan is plenty for chess, which sends tiny messages.
2. In the dashboard, find the TURN credentials API address. It looks like
   `https://YOUR-APP-NAME.metered.live/api/v1/turn/credentials?apiKey=YOUR_API_KEY`
3. Open `js/config.js` in your GitHub repo (click the pencil icon to edit) and paste it between the quotes:
   `window.CHESS_TURN_API_URL = "https://...";`
   Then click **Commit changes**.
4. Wait a minute, refresh the game with Ctrl+F5, and run **Test my connection** again. You want to see `OK Relay key works` and `relay` in the address types.

The key is visible to anyone who looks at your repo. The worst someone can do with it is use up your free relay allowance, and you can delete and regenerate it in the metered.ca dashboard.

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
| `js/net.js` | Online connection (wraps PeerJS) and Direct mode |
| `js/config.js` | Optional relay setting (see Relay) |
| `js/app.js` | Board, clocks, modes and online game logic |
| `vendor/peerjs.min.js` | PeerJS 1.5.5 (MIT licence, see `vendor/PEERJS-LICENSE.txt`) |
| `vendor/metered-realtime.min.js` | Metered Realtime SDK 1.2.1 (MIT licence, see `vendor/METERED-REALTIME-LICENSE.txt`) |
