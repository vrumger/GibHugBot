import { Bot } from 'grammy';
import { apiThrottler } from '@grammyjs/transformer-throttler';
import env from './env';
import botHandlers from './handlers/bot';

const bot = new Bot(env.BOT_TOKEN);

bot.catch(err => {
    console.error(`Error while handling update ${err.ctx.update.update_id}:`);
    console.error(err.error);
});

bot.api.config.use(apiThrottler());

bot.use(botHandlers);

const groupCommands = [
    { command: 'new', description: 'Connect a GitHub repository to this chat' },
    {
        command: 'integrations',
        description: 'Manage repositories connected to this chat',
    },
    {
        command: 'export',
        description: 'Export the repositories connected to this chat',
    },
    {
        command: 'import',
        description: 'Connect repositories exported from another chat',
    },
];

// Group commands are only shown to admins, since they manage the chat's integrations.
export const setCommands = () =>
    Promise.all([
        bot.api.setMyCommands(
            [
                {
                    command: 'start',
                    description: 'Connect your GitHub account',
                },
                ...groupCommands,
            ],
            { scope: { type: 'all_private_chats' } },
        ),
        bot.api.setMyCommands(groupCommands, {
            scope: { type: 'all_chat_administrators' },
        }),
    ]);

export default bot;
