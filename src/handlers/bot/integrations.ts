import { randomBytes } from 'crypto';
import { Composer, InlineKeyboard } from 'grammy';
import fetch from 'node-fetch';
import escapeHtml from '@youtwitface/escape-html';
import env from '../../env';
import Hook from '../../models/hook';
import Token from '../../models/token';

const base64 = (data: string) =>
    Buffer.from(data).toString('base64').replace(/=+$/, '');

const composer = new Composer();

composer.command('new', async ctx => {
    if (!ctx.from) {
        return;
    }

    const token = await Token.findOne({
        user_id: ctx.from.id,
    });

    if (!token) {
        await ctx.reply(
            `Please contact me to get set up: <a href="https://t.me/${ctx.me.username}?start=connect">@${ctx.me.username}</a>`,
            { parse_mode: 'HTML' },
        );
        return;
    }

    const request = await fetch(
        'https://api.github.com/user/repos?affiliation=owner,organization_member&sort=updated&per_page=5',
        {
            headers: {
                Accept: 'application/vnd.github.v3+json',
                Authorization: `token ${token.access_token}`,
            },
        },
    );
    const response = (await request.json()) as any[];

    const keyboard = response
        .reduce(
            (keyboard, repo) =>
                keyboard
                    .text(
                        repo.full_name,
                        `repo:${ctx.from.id}:${repo.full_name}`,
                    )
                    .row(),
            new InlineKeyboard(),
        )
        .switchInlineCurrent('Search', 'search ');

    await ctx.reply('Choose a repo:', {
        reply_markup: keyboard,
    });
});

composer.inlineQuery(/^search (.+)/i, async ctx => {
    const query = ctx.match![1];

    // TODO:

    await ctx.answerInlineQuery([]);
});

composer.callbackQuery(/^repo:(\d+):(.+)$/, async ctx => {
    const [, userId, repo] = ctx.match!;

    if (ctx.from.id !== Number(userId)) {
        await ctx.answerCallbackQuery({ text: "This isn't for you" });
        return;
    }

    const token = await Token.findOne({
        user_id: ctx.from.id,
    });

    if (!token) {
        await ctx.answerCallbackQuery({
            text: 'You need to connect your GitHub account first.',
        });
        return;
    }

    const secret = randomBytes(20).toString('hex');

    const request = await fetch(`https://api.github.com/repos/${repo}/hooks`, {
        method: 'POST',
        headers: {
            Accept: 'application/vnd.github.v3+json',
            Authorization: `token ${token.access_token}`,
        },
        body: JSON.stringify({
            name: 'web',
            events: ['push', 'issues', 'issue_comment', 'pull_request'],
            config: {
                url: `${env.GITHUB_WEBHOOK_DOMAIN}/github/webhook/${base64(
                    repo,
                )}`,
                content_type: 'json',
                secret,
            },
        }),
    });
    const response = await request.json();

    await new Hook({
        chat_id: ctx.chat?.id,
        hook_id: response.id,
        secret,
    }).save();

    await ctx.answerCallbackQuery();

    const mention = ctx.from.username
        ? `@${ctx.from.username}`
        : `<a href="tg://user?id=${ctx.from.id}">${escapeHtml(
              ctx.from.first_name,
          )}</a>`;
    await ctx.editMessageText(
        `${mention} has connected <a href="https://github.com/${repo}">${repo}</a> to this chat.`,
        { parse_mode: 'HTML' },
    );
});

export default composer;
