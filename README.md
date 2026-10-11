# GibHugBot

A Telegram bot that sends GitHub repository notifications to your chats.

Connect your GitHub account, pick a repository, and the bot sets up a webhook that posts updates to the chat.

## Features

- 🔨 **Pushes**: new commits with links and authors
- 🐛 **Issues**: newly opened issues
- 💬 **Issue comments**: new comments on issues and pull requests
- 🔌 **Pull requests**: newly opened pull requests

## Usage

1. Send `/start` to the bot in a private chat and open the link to authorize it with GitHub.
2. In any chat where the bot is present, send `/new` and pick a repository from the list, or tap **Search** to find one.
3. You can also connect a repository from any chat with inline mode: type `@<bot username> search <query>` and select a repository.

You need admin access to a repository to connect it, because the bot creates a webhook on it.

## Self-hosting

### Requirements

- Node.js 18 or later
- MongoDB
- A Telegram bot token from [@BotFather](https://t.me/BotFather), with inline mode enabled
- A [GitHub OAuth app](https://github.com/settings/developers)
- A public HTTPS URL that points to the server

### GitHub OAuth app

Set the app's **Authorization callback URL** to:

```
<GITHUB_WEBHOOK_DOMAIN>/github/callback
```

### Configuration

Create a `.env` file in the project root:

```env
BOT_TOKEN=123456:ABC-DEF...
MONGO_URI=mongodb://localhost:27017/gibhugbot
GITHUB_CLIENT_ID=your_client_id
GITHUB_CLIENT_SECRET=your_client_secret
GITHUB_WEBHOOK_DOMAIN=https://example.com
PORT=8000
```

| Variable                | Description                                                          | Default |
| ----------------------- | -------------------------------------------------------------------- | ------- |
| `BOT_TOKEN`             | Telegram bot token                                                   | —       |
| `MONGO_URI`             | MongoDB connection string                                            | —       |
| `GITHUB_CLIENT_ID`      | GitHub OAuth app client ID                                           | —       |
| `GITHUB_CLIENT_SECRET`  | GitHub OAuth app client secret                                       | —       |
| `GITHUB_WEBHOOK_DOMAIN` | Public base URL of the server, used for OAuth callbacks and webhooks | —       |
| `PORT`                  | Port for the HTTP server                                             | `8000`  |

### Running

```sh
npm install
npm run build
npm start
```

For development, run the TypeScript sources directly:

```sh
npm run dev
```

### Scripts

| Script          | Description                    |
| --------------- | ------------------------------ |
| `npm run dev`   | Run the bot with `ts-node`     |
| `npm run build` | Compile TypeScript to `build/` |
| `npm start`     | Run the compiled bot           |
| `npm test`      | Type-check the project         |
| `npm run lint`  | Lint the source with ESLint    |

## License

[AGPL-3.0](LICENSE)
