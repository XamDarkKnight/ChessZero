# Chess Zeo

A browser chess game with local play and online multiplayer support using a WebSocket room server.

## Local development

1. Install dependencies:
   ```bash
   npm install
   ```

2. Run the WebSocket server:
   ```bash
   npm start
   ```

3. Open `index.html` in the browser or serve the folder with a static server.

## Online multiplayer

The client connects to a WebSocket server and supports room creation/joining.

### Client usage

- Enter the WebSocket server URL in the `Online Play` panel.
- Create a room or join an existing room code.
- The first player becomes White, the second player becomes Black.

## Deployment

This repository includes a GitHub Actions workflow for Azure Web App deployment.

### Required secrets

- `AZURE_WEBAPP_NAME`
- `AZURE_WEBAPP_PUBLISH_PROFILE`

### Steps

1. Push to `main`.
2. GitHub Actions will install dependencies and deploy the app to the configured Azure Web App.

## Notes

- The `server.js` file is the WebSocket backend for room synchronization.
- The client currently expects the server to support room and move messages in JSON.
