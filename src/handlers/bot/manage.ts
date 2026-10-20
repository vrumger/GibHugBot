import { Composer, Context, InlineKeyboard } from 'grammy';
import escapeHtml from '@youtwitface/escape-html';
import Hook, { IHook } from '../../models/hook';
import {
    adminOnly,
    disconnectRepo,
    isAdmin,
    mentionUser,
    NOT_ADMIN_TEXT,
    repoLink,
} from './utils';

const NO_INTEGRATIONS_TEXT =
    'No repositories are connected to this chat. Use /new to connect one.';
const NOT_FOUND_TEXT = 'This integration no longer exists.';

const PAGE_SIZE = 8;

const hookName = (hook: IHook) =>
    hook.repo ?? `Unknown repository (hook ${hook.hook_id})`;

const topicName = (hook: IHook) => hook.topic_name ?? `Topic ${hook.thread_id}`;

const hookLabel = (hook: IHook) =>
    hook.thread_id ? `${hookName(hook)} · ${topicName(hook)}` : hookName(hook);

const hookTitle = (hook: IHook) =>
    hook.repo ? repoLink(hook.repo) : hookName(hook);

const webhooksSettingsLink = (repo: string) =>
    `<a href="https://github.com/${repo}/settings/hooks">webhook settings</a>`;

const buildList = async (chatId: number, page = 0, notice?: string) => {
    const prefix = notice ? `${notice}\n\n` : '';
    const total = await Hook.countDocuments({ chat_id: chatId });

    if (total === 0) {
        return { text: prefix + NO_INTEGRATIONS_TEXT };
    }

    // Clamp in case integrations were removed since the page was shown.
    const pageCount = Math.ceil(total / PAGE_SIZE);
    const currentPage = Math.min(Math.max(page, 0), pageCount - 1);

    const hooks = await Hook.find({ chat_id: chatId })
        .sort({ createdAt: 1, _id: 1 })
        .skip(currentPage * PAGE_SIZE)
        .limit(PAGE_SIZE);

    const keyboard = new InlineKeyboard();
    for (const hook of hooks) {
        keyboard
            .text(hookLabel(hook), `integration:${hook.hook_id}:${currentPage}`)
            .row();
    }

    if (pageCount > 1) {
        if (currentPage > 0) {
            keyboard.text('‹', `integrations:list:${currentPage - 1}`);
        }
        keyboard.text(`${currentPage + 1}/${pageCount}`, 'integrations:noop');
        if (currentPage < pageCount - 1) {
            keyboard.text('›', `integrations:list:${currentPage + 1}`);
        }
        keyboard.row();
    }
    keyboard.text('Close', 'integrations:close');

    return {
        text: `${prefix}Repositories connected to this chat (${total}). Choose one to manage it:`,
        reply_markup: keyboard,
    };
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

composer.command('integrations', adminOnly, async ctx => {
    const { text, reply_markup } = await buildList(ctx.chat.id);
    await ctx.reply(text, { ...editOptions, reply_markup });
});

composer.callbackQuery(
    /^integrations:list(?::(\d+))?$/,
    adminOnly,
    async ctx => {
        if (!ctx.chat) {
            return ctx.answerCallbackQuery();
        }

        const { text, reply_markup } = await buildList(
            ctx.chat.id,
            Number(ctx.match![1] ?? 0),
        );
        await ctx.answerCallbackQuery();
        await ctx.editMessageText(text, { ...editOptions, reply_markup });
    },
);

composer.callbackQuery('integrations:noop', ctx => ctx.answerCallbackQuery());

composer.callbackQuery('integrations:close', adminOnly, async ctx => {
    await ctx.answerCallbackQuery();
    await ctx.deleteMessage();
});

const hookAction = (
    action: string,
    handler: (ctx: Context, hook: IHook, page: number) => Promise<unknown>,
) =>
    composer.callbackQuery(
        new RegExp(
            `^integration${action ? `:${action}` : ''}:(\\d+)(?::(\\d+))?$`,
        ),
        async ctx => {
            if (!ctx.chat) {
                return ctx.answerCallbackQuery();
            }

            if (!(await isAdmin(ctx))) {
                await ctx.answerCallbackQuery({
                    text: NOT_ADMIN_TEXT,
                    show_alert: true,
                });
                return;
            }

            const page = Number(ctx.match![2] ?? 0);
            const hook = await Hook.findOne({
                chat_id: ctx.chat.id,
                hook_id: Number(ctx.match![1]),
            });

            if (!hook) {
                const { text, reply_markup } = await buildList(
                    ctx.chat.id,
                    page,
                );
                await ctx.answerCallbackQuery({ text: NOT_FOUND_TEXT });
                await ctx.editMessageText(text, {
                    ...editOptions,
                    reply_markup,
                });
                return;
            }

            await handler(ctx, hook, page);
        },
    );

hookAction('', async (ctx, hook, page) => {
    const lines = [`<b>${hookTitle(hook)}</b>`];

    if (hook.thread_id) {
        lines.push(`Topic: ${escapeHtml(topicName(hook))}`);
    }
    if (hook.user_id) {
        lines.push(
            `Connected by: ${await describeConnector(ctx, hook.user_id)}`,
        );
    }
    lines.push(`Connected on: ${hook.createdAt.toISOString().slice(0, 10)}`);

    const keyboard = new InlineKeyboard()
        .text('🗑 Remove', `integration:remove:${hook.hook_id}:${page}`)
        .row()
        .text('« Back', `integrations:list:${page}`);

    await ctx.answerCallbackQuery();
    await ctx.editMessageText(lines.join('\n'), {
        ...editOptions,
        reply_markup: keyboard,
    });
});

hookAction('remove', async (ctx, hook, page) => {
    const keyboard = new InlineKeyboard()
        .text('Yes, remove it', `integration:confirm:${hook.hook_id}:${page}`)
        .row()
        .text('« Back', `integration:${hook.hook_id}:${page}`);

    await ctx.answerCallbackQuery();
    await ctx.editMessageText(
        `Remove ${hookTitle(hook)} from this chat? Notifications will stop and its webhook will be deleted from GitHub.`,
        { ...editOptions, reply_markup: keyboard },
    );
});

hookAction('confirm', async (ctx, hook, page) => {
    const deletedOnGitHub = await disconnectRepo(hook, ctx.from!.id);

    let notice = `${mentionUser(ctx.from!)} removed ${hookTitle(hook)} from this chat.`;
    if (!deletedOnGitHub) {
        notice += hook.repo
            ? ` The webhook couldn't be deleted from GitHub, so delete it manually in the repository's ${webhooksSettingsLink(hook.repo)}.`
            : " The webhook couldn't be deleted from GitHub, so delete it manually in the repository's webhook settings.";
    }

    const { text, reply_markup } = await buildList(ctx.chat!.id, page, notice);
    await ctx.answerCallbackQuery({ text: 'Removed' });
    await ctx.editMessageText(text, { ...editOptions, reply_markup });
});

export default composer;
