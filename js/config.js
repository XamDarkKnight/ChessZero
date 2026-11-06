/* config.js — optional relay settings for online play.
 * A relay lets two computers connect when the Wi-Fi blocks them from reaching each other.
 * Fill in ONE of the two options below (see README.md, section "Relay").
 */

// Option 1: paste the API address from metered.ca between the quotes, e.g.
// "https://YOUR-APP.metered.live/api/v1/turn/credentials?apiKey=YOUR_API_KEY"
window.CHESS_TURN_API_URL = "https://chesszero.metered.live/api/v1/turn/credentials?apiKey=7740ee272537b61d46952c22f6e9efc9e2f8";

// Option 2: paste the iceServers list from metered.ca's "configuration snippet" between the [ ].
// It is a list of { urls: ..., username: ..., credential: ... } entries.
window.CHESS_ICE_SERVERS = [

];

// Metered messaging key (works even on networks that block everything else).
// In metered.ca: Realtime Messaging -> Keys -> Create key -> type "Publishable",
// with Subscribe and Publish switched on. Paste the "pk_live_..." value between the quotes.
// When this is set, online games send moves through Metered's server instead of connecting the browsers directly.
window.CHESS_REALTIME_KEY = "";
