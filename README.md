# GibHugBot

A Telegram bot that sends GitHub repository notifications to your chats.

Connect your GitHub account, pick a repository, and the bot sets up a webhook that posts updates to the chat.

## Features

- 🔨 **Pushes**: new commits with links and authors
- 🐛 **Issues**: newly opened issues
- 💬 **Issue comments**: new comments on issues and pull requests
- 🔌 **Pull requests**: newly opened pull requests

Issue, comment, and pull request bodies are sent as Telegram [rich messages](https://core.telegram.org/bots/api#rich-messages), so their Markdown formatting (headings, lists, task lists, tables, code blocks, quotes, images, and more) is kept. Images wrapped in a link show the link in their caption, since Telegram doesn't support linked images. Telegram rejects a rich message if it can't fetch one of its images, so the bot then retries with the images shown as links. If Telegram still rejects the formatting, the bot sends the body as plain text instead.

Mentions (`@user`, `@org/team`), issue and pull request references (`#123`, `GH-123`, `owner/repo#123`), commit SHAs, URLs, and e-mail addresses link to GitHub, like they do on GitHub, instead of searching Telegram. This also applies to commit messages. Telegram can only stop detecting other hashtags, mentions, and commands in rich messages, so in commit messages and plain-text fallbacks other `#words` still search Telegram.

## Usage

1. Send `/start` to the bot in a private chat and open the link to authorize it with GitHub.
2. In any chat where the bot is present, send `/new` and pick a repository from the list, or tap **Search** to find one.
3. You can also connect a repository from any chat with inline mode: type `@<bot username> search <query>` and select a repository.

In groups with topics enabled, connect the repository from inside a topic and its notifications are posted to that topic.

When Telegram upgrades a group to a supergroup, the bot automatically moves all of its connected repositories to the new chat ID. If the bot missed the migration notice, it also handles Telegram's migration error by moving the repositories and retrying the failed API call once with the new ID. Existing GitHub webhooks are kept, so you don't need to reconnect them.

You need admin access to a repository to connect it, because the bot creates a webhook on it.

In groups, only chat admins can use the bot's commands (`/new`, `/integrations`, `/export`, `/import`) and connect repositories with inline mode.

### Managing integrations

Send `/integrations` in a chat to list the repositories connected to it. Pick a repository to see its details, or remove it. Removing a repository stops its notifications and deletes its webhook from GitHub.

In groups, only chat admins can manage integrations. In private chats, you can manage all of them.

Repositories connected to a topic are listed with the topic's name. Telegram doesn't let bots look up topics, so the bot learns a topic's name when it's created or renamed, or when the bot sees a message in it (such as `/new` or `/integrations`). Names are only stored for topics with connected repositories. Until the bot learns a name, the topic is shown by its ID.

The bot registers its commands with Telegram when it starts, so they appear in the `/` menu. In groups, only admins see them.

### Copying integrations to another chat

Send `/export` in a chat to get an `/import` command that lists its connected repositories. Copy it and send it in another chat (or topic) to connect the same repositories there. You can edit the list before sending it, or write your own: `/import` accepts repository names (`owner/repo`) or GitHub URLs, separated by spaces, commas, or new lines. You can also reply with `/import` to a message that contains a list.

If the list is too long for one message, `/export` sends it as a `repositories.txt` file instead. Forward the file to the other chat and reply to it with `/import`.

Importing creates a new webhook for each repository with your GitHub account, like `/new`, so you need admin access to them. Repositories are connected to the topic where you send `/import`, and repositories already connected to that topic are skipped.

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
| `npm test`      | Type-check and run tests       |
| `npm run lint`  | Lint the source with ESLint    |

## License

[AGPL-3.0](LICENSE)
