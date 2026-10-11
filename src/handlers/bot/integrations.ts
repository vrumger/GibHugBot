import { Composer, InlineKeyboard, InlineQueryResultBuilder } from 'grammy';
import type { User } from 'grammy/types';
import escapeHtml from '@youtwitface/escape-html';
import { Repo, listRepos } from '../../github';
import Token from '../../models/token';
import { getTopicName } from './topics';
import {
    connectRepo,
    getCachedRepos,
    getThreadId,
    mentionUser,
    repoLink,
} from './utils';

const RECENT_REPOS_LIMIT = 5;
const INLINE_RESULTS_LIMIT = 50;

const NOT_CONNECTED_TEXT = 'You need to connect your GitHub account first.';

// Inline results send this message, which is then picked up to connect the repo.
const connectMessage = (repo: string) => `🔗 Connecting ${repo} to this chat…`;
const CONNECT_MESSAGE_REGEX = /^🔗 Connecting (\S+) to this chat…$/;

const connectedText = (user: User, repo: string) =>
    `${mentionUser(user)} has connected ${repoLink(repo)} to this chat.`;

const connectFailedText = (repo: string) =>
    `Failed to connect ${repo}. Make sure you have admin access to it.`;

const composer = new Composer();

composer.command('new', async ctx => {
    if (!ctx.from) {
        return;
    }

    const userId = ctx.from.id;
    const token = await Token.findOne({ user_id: userId });

    if (!token) {
        await ctx.reply(
            `Please contact me to get set up: <a href="https://t.me/${ctx.me.username}?start=connect">@${ctx.me.username}</a>`,
            { parse_mode: 'HTML' },
        );
        return;
    }

    const repos = await listRepos(token.access_token, RECENT_REPOS_LIMIT);

    const keyboard = repos
        .reduce(
            (keyboard, repo) =>
                keyboard
                    .text(repo.full_name, `repo:${userId}:${repo.full_name}`)
                    .row(),
            new InlineKeyboard(),
        )
        .switchInlineCurrent('Search', 'search ');

    await ctx.reply('Choose a repo:', { reply_markup: keyboard });
});

composer.inlineQuery(/^search(?:\s+(.*))?$/is, async ctx => {
    const query = (ctx.match![1] ?? '').trim().toLowerCase();
    const token = await Token.findOne({ user_id: ctx.from.id });

    if (!token) {
        await ctx.answerInlineQuery([], {
            cache_time: 0,
            is_personal: true,
            button: {
                text: 'Connect your GitHub account',
                start_parameter: 'connect',
            },
        });
        return;
    }

    let repos: Repo[];
    try {
        repos = await getCachedRepos(ctx.from.id, token.access_token);
    } catch (error) {
        console.error(error);
        await ctx.answerInlineQuery([], { cache_time: 0, is_personal: true });
        return;
    }

    const matches = query
        ? repos.filter(repo => repo.full_name.toLowerCase().includes(query))
        : repos;

    const offset = Number(ctx.inlineQuery.offset) || 0;
    const nextOffset = offset + INLINE_RESULTS_LIMIT;

    const results = matches.slice(offset, nextOffset).map((repo, index) =>
        InlineQueryResultBuilder.article(
            String(offset + index),
            repo.full_name,
            {
                description: repo.description ?? undefined,
                thumbnail_url: repo.owner.avatar_url,
            },
        ).text(connectMessage(repo.full_name)),
    );

    await ctx.answerInlineQuery(results, {
        cache_time: 10,
        is_personal: true,
        next_offset: nextOffset < matches.length ? String(nextOffset) : '',
    });
});

composer
    .on('message:text')
    .filter(
        ctx =>
            ctx.msg.via_bot?.id === ctx.me.id &&
            !ctx.msg.forward_origin &&
            CONNECT_MESSAGE_REGEX.test(ctx.msg.text),
    )
    .use(async ctx => {
        const [, repo] = ctx.msg.text.match(CONNECT_MESSAGE_REGEX)!;
        const replyOptions = {
            parse_mode: 'HTML',
            link_preview_options: { is_disabled: true },
            reply_parameters: { message_id: ctx.msg.message_id },
        } as const;

        const token = await Token.findOne({ user_id: ctx.from.id });

        if (!token) {
            await ctx.reply(NOT_CONNECTED_TEXT, replyOptions);
            return;
        }

        const threadId = getThreadId(ctx.msg);
        const connected = await connectRepo(
            token.access_token,
            repo,
            ctx.from.id,
            ctx.chat.id,
            threadId,
            getTopicName(ctx.chat.id, threadId),
        );

        await ctx.reply(
            connected
                ? connectedText(ctx.from, repo)
                : escapeHtml(connectFailedText(repo)),
            replyOptions,
        );
    });

composer.callbackQuery(/^repo:(\d+):(.+)$/, async ctx => {
    const [, userId, repo] = ctx.match!;

    if (ctx.from.id !== Number(userId)) {
        await ctx.answerCallbackQuery({ text: "This isn't for you" });
        return;
    }

    const token = await Token.findOne({ user_id: ctx.from.id });

    if (!token) {
        await ctx.answerCallbackQuery({ text: NOT_CONNECTED_TEXT });
        return;
    }

    if (!ctx.chat) {
        await ctx.answerCallbackQuery({
            text: 'Unable to determine the chat.',
        });
        return;
    }

    const threadId = getThreadId(ctx.callbackQuery.message);
    const connected = await connectRepo(
        token.access_token,
        repo,
        ctx.from.id,
        ctx.chat.id,
        threadId,
        getTopicName(ctx.chat.id, threadId),
    );

    if (!connected) {
        await ctx.answerCallbackQuery({
            text: connectFailedText(repo),
            show_alert: true,
        });
        return;
    }

    await ctx.answerCallbackQuery();
    await ctx.editMessageText(connectedText(ctx.from, repo), {
        parse_mode: 'HTML',
    });
});

export default composer;
