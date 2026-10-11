import { Composer, Context, InlineKeyboard } from 'grammy';
import Hook, { IHook } from '../../models/hook';
import { disconnectRepo, mentionUser, repoLink } from './utils';

const NO_INTEGRATIONS_TEXT =
    'No repositories are connected to this chat. Use /new to connect one.';
const NOT_ALLOWED_TEXT =
    'Only chat admins and the user who connected this repository can manage it.';
const NOT_FOUND_TEXT = 'This integration no longer exists.';

const hookName = (hook: IHook) =>
    hook.repo ?? `Unknown repository (hook ${hook.hook_id})`;

const hookLabel = (hook: IHook) =>
    hook.thread_id
        ? `${hookName(hook)} · topic ${hook.thread_id}`
        : hookName(hook);

const hookTitle = (hook: IHook) =>
    hook.repo ? repoLink(hook.repo) : hookName(hook);

const webhooksSettingsLink = (repo: string) =>
    `<a href="https://github.com/${repo}/settings/hooks">webhook settings</a>`;

const buildList = async (chatId: number, notice?: string) => {
    const hooks = await Hook.find({ chat_id: chatId }).sort({ createdAt: 1 });
    const prefix = notice ? `${notice}\n\n` : '';

    if (hooks.length === 0) {
        return { text: prefix + NO_INTEGRATIONS_TEXT };
    }

    const keyboard = new InlineKeyboard();
    for (const hook of hooks) {
        keyboard.text(hookLabel(hook), `integration:${hook.hook_id}`).row();
    }
    keyboard.text('Close', 'integrations:close');

    return {
        text: `${prefix}Repositories connected to this chat (${hooks.length}). Choose one to manage it:`,
        reply_markup: keyboard,
    };
};

const canManage = async (ctx: Context, hook: IHook) => {
    if (!ctx.chat || !ctx.from) {
        return false;
    }

    if (ctx.chat.type === 'private' || hook.user_id === ctx.from.id) {
        return true;
    }

    try {
        const member = await ctx.getChatMember(ctx.from.id);
        return member.status === 'creator' || member.status === 'administrator';
    } catch (error) {
        console.error(error);
        return false;
    }
};

const describeConnector = async (ctx: Context, userId: number) => {
    try {
        const member = await ctx.getChatMember(userId);
        return mentionUser(member.user);
    } catch {
        return `<a href="tg://user?id=${userId}">user ${userId}</a>`;
    }
};

const editOptions = {
    parse_mode: 'HTML',
    link_preview_options: { is_disabled: true },
} as const;

const composer = new Composer();

composer.command('integrations', async ctx => {
    const { text, reply_markup } = await buildList(ctx.chat.id);
    await ctx.reply(text, { ...editOptions, reply_markup });
});

composer.callbackQuery('integrations:list', async ctx => {
    if (!ctx.chat) {
        return ctx.answerCallbackQuery();
    }

    const { text, reply_markup } = await buildList(ctx.chat.id);
    await ctx.answerCallbackQuery();
    await ctx.editMessageText(text, { ...editOptions, reply_markup });
});

composer.callbackQuery('integrations:close', async ctx => {
    await ctx.answerCallbackQuery();
    await ctx.deleteMessage();
});

// Every action on a single integration looks up the hook within the current chat and checks permissions first.
const hookAction = (
    action: string,
    handler: (ctx: Context, hook: IHook) => Promise<unknown>,
) =>
    composer.callbackQuery(
        new RegExp(`^integration${action ? `:${action}` : ''}:(\\d+)$`),
        async ctx => {
            if (!ctx.chat) {
                return ctx.answerCallbackQuery();
            }

            const hook = await Hook.findOne({
                chat_id: ctx.chat.id,
                hook_id: Number(ctx.match![1]),
            });

            if (!hook) {
                const { text, reply_markup } = await buildList(ctx.chat.id);
                await ctx.answerCallbackQuery({ text: NOT_FOUND_TEXT });
                await ctx.editMessageText(text, {
                    ...editOptions,
                    reply_markup,
                });
                return;
            }

            if (!(await canManage(ctx, hook))) {
                await ctx.answerCallbackQuery({
                    text: NOT_ALLOWED_TEXT,
                    show_alert: true,
                });
                return;
            }

            await handler(ctx, hook);
        },
    );

hookAction('', async (ctx, hook) => {
    const lines = [`<b>${hookTitle(hook)}</b>`];

    if (hook.thread_id) {
        lines.push(`Topic: ${hook.thread_id}`);
    }
    if (hook.user_id) {
        lines.push(
            `Connected by: ${await describeConnector(ctx, hook.user_id)}`,
        );
    }
    lines.push(`Connected on: ${hook.createdAt.toISOString().slice(0, 10)}`);

    const keyboard = new InlineKeyboard()
        .text('🗑 Remove', `integration:remove:${hook.hook_id}`)
        .row()
        .text('« Back', 'integrations:list');

    await ctx.answerCallbackQuery();
    await ctx.editMessageText(lines.join('\n'), {
        ...editOptions,
        reply_markup: keyboard,
    });
});

hookAction('remove', async (ctx, hook) => {
    const keyboard = new InlineKeyboard()
        .text('Yes, remove it', `integration:confirm:${hook.hook_id}`)
        .row()
        .text('« Back', `integration:${hook.hook_id}`);

    await ctx.answerCallbackQuery();
    await ctx.editMessageText(
        `Remove ${hookTitle(hook)} from this chat? Notifications will stop and its webhook will be deleted from GitHub.`,
        { ...editOptions, reply_markup: keyboard },
    );
});

hookAction('confirm', async (ctx, hook) => {
    const deletedOnGitHub = await disconnectRepo(hook, ctx.from!.id);

    let notice = `${mentionUser(ctx.from!)} removed ${hookTitle(hook)} from this chat.`;
    if (!deletedOnGitHub) {
        notice += hook.repo
            ? ` The webhook couldn't be deleted from GitHub, so delete it manually in the repository's ${webhooksSettingsLink(hook.repo)}.`
            : " The webhook couldn't be deleted from GitHub, so delete it manually in the repository's webhook settings.";
    }

    const { text, reply_markup } = await buildList(ctx.chat!.id, notice);
    await ctx.answerCallbackQuery({ text: 'Removed' });
    await ctx.editMessageText(text, { ...editOptions, reply_markup });
});

export default composer;
