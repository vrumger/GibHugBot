import escapeHtml from '@youtwitface/escape-html';
import { Api, Composer, InputFile } from 'grammy';
import type { Message } from 'grammy/types';
import Hook from '../../models/hook';
import Token from '../../models/token';
import { getTopicName } from './topics';
import {
    adminOnly,
    connectRepo,
    downloadText,
    formatList,
    getThreadId,
    mentionUser,
    repoLink,
} from './utils';

const MAX_MESSAGE_LENGTH = 4096;
const MAX_FILE_SIZE = 64 * 1024;
const MAX_IMPORT_REPOS = 30;
const MAX_LISTED_ITEMS = 10;
const MAX_INVALID_TOKEN_LENGTH = 40;

const REPO_REGEX = /^[A-Za-z0-9-]{1,39}\/[A-Za-z0-9._-]{1,100}$/;
const GITHUB_URL_REGEX = /^(?:https?:\/\/)?(?:www\.)?github\.com\//i;

const htmlOptions = {
    parse_mode: 'HTML',
    link_preview_options: { is_disabled: true },
} as const;

const exportText = (count: number) =>
    `Repositories connected to this chat (${count}). To connect them to another chat, copy this command and send it there:`;

const exportFileCaption = (count: number) =>
    `Repositories connected to this chat (${count}). To connect them to another chat, forward this file there and reply to it with /import.`;

const IMPORT_USAGE_TEXT =
    'Send /import followed by the repositories to connect, one per line, or reply with /import to a message or file from /export.';

const parseRepos = (text: string) => {
    const repos = new Map<string, string>();
    const invalid: string[] = [];

    for (const token of text.split(/[\s,]+/)) {
        if (!token) {
            continue;
        }

        const repo = token
            .replace(GITHUB_URL_REGEX, '')
            .replace(/\/+$/, '')
            .replace(/\.git$/, '');
        const name = repo.split('/')[1];

        if (REPO_REGEX.test(repo) && name !== '.' && name !== '..') {
            // GitHub repository names are case-insensitive.
            repos.set(
                repo.toLowerCase(),
                repos.get(repo.toLowerCase()) ?? repo,
            );
        } else {
            invalid.push(token);
        }
    }

    return { repos: [...repos.values()], invalid };
};

const formatRepos = (repos: string[]) =>
    formatList(repos.map(repoLink), MAX_LISTED_ITEMS);

const composer = new Composer();

composer.command('export', adminOnly, async ctx => {
    const hooks = await Hook.find({ chat_id: ctx.chat.id }).sort({
        createdAt: 1,
        _id: 1,
    });

    const repos = [
        ...new Map(
            hooks.flatMap(hook =>
                hook.repo
                    ? [[hook.repo.toLowerCase(), hook.repo] as const]
                    : [],
            ),
        ).values(),
    ];
    const unknown = hooks.filter(hook => !hook.repo).length;
    const unknownNotice = unknown
        ? `\n\n${unknown} connected ${unknown === 1 ? 'repository is' : 'repositories are'} left out because ${unknown === 1 ? 'its' : 'their'} name isn't known yet.`
        : '';

    if (repos.length === 0) {
        await ctx.reply(
            `No repositories to export. Use /new to connect one.${unknownNotice}`,
        );
        return;
    }

    const command = [`/import@${ctx.me.username} `, ...repos].join('\n');
    const text = `${exportText(repos.length)}\n\n${command}${unknownNotice}`;

    if (text.length <= MAX_MESSAGE_LENGTH) {
        await ctx.reply(
            `${escapeHtml(exportText(repos.length))}\n\n<pre>${escapeHtml(command)}</pre>${escapeHtml(unknownNotice)}`,
            htmlOptions,
        );
        return;
    }

    await ctx.replyWithDocument(
        new InputFile(Buffer.from(`${repos.join('\n')}\n`), 'repositories.txt'),
        { caption: `${exportFileCaption(repos.length)}${unknownNotice}` },
    );
});

const getImportRepos = async (
    api: Api,
    text: string,
    reply?: Message,
): Promise<{ repos: string[]; invalid: string[] } | { error: string }> => {
    if (text.trim()) {
        return parseRepos(text);
    }

    if (reply?.document) {
        if ((reply.document.file_size ?? 0) > MAX_FILE_SIZE) {
            return { error: 'This file is too large to import.' };
        }

        try {
            return parseRepos(await downloadText(api, reply.document.file_id));
        } catch (error) {
            console.error(error);
            return { error: "Couldn't download this file. Try again later." };
        }
    }

    const replyText = reply?.text ?? reply?.caption;
    if (replyText) {
        return parseRepos(replyText);
    }

    return { repos: [], invalid: [] };
};

composer
    .command('import')
    .filter(ctx => !ctx.msg.forward_origin)
    .use(adminOnly, async ctx => {
        const replyOptions = {
            ...htmlOptions,
            reply_parameters: { message_id: ctx.msg.message_id },
        } as const;

        if (!ctx.from) {
            return;
        }

        const token = await Token.findOne({ user_id: ctx.from.id });
        if (!token) {
            await ctx.reply(
                `Please contact me to get set up: <a href="https://t.me/${ctx.me.username}?start=connect">@${ctx.me.username}</a>`,
                replyOptions,
            );
            return;
        }

        const result = await getImportRepos(
            ctx.api,
            ctx.match,
            ctx.msg.reply_to_message,
        );

        if ('error' in result) {
            await ctx.reply(escapeHtml(result.error), replyOptions);
            return;
        }

        const { repos, invalid } = result;
        const invalidNotice = invalid.length
            ? `\n\nSkipped because they aren't repositories: ${escapeHtml(
                  formatList(
                      invalid.map(token =>
                          token.length > MAX_INVALID_TOKEN_LENGTH
                              ? `${token.slice(0, MAX_INVALID_TOKEN_LENGTH)}…`
                              : token,
                      ),
                      MAX_LISTED_ITEMS,
                  ),
              )}`
            : '';

        if (repos.length === 0) {
            await ctx.reply(
                `${escapeHtml(IMPORT_USAGE_TEXT)}${invalidNotice}`,
                replyOptions,
            );
            return;
        }

        if (repos.length > MAX_IMPORT_REPOS) {
            await ctx.reply(
                `You can import up to ${MAX_IMPORT_REPOS} repositories at once.`,
                replyOptions,
            );
            return;
        }

        const chatId = ctx.chat.id;
        const threadId = getThreadId(ctx.msg);

        const existing = await Hook.find({
            chat_id: chatId,
            thread_id: threadId ?? null,
        });
        const existingRepos = new Set(
            existing.flatMap(hook =>
                hook.repo ? [hook.repo.toLowerCase()] : [],
            ),
        );

        const progress = await ctx.reply(
            `Importing ${repos.length} ${repos.length === 1 ? 'repository' : 'repositories'}…`,
            replyOptions,
        );

        const connected: string[] = [];
        const skipped: string[] = [];
        const failed: string[] = [];

        for (const repo of repos) {
            if (existingRepos.has(repo.toLowerCase())) {
                skipped.push(repo);
                continue;
            }

            const ok = await connectRepo(
                token.access_token,
                repo,
                ctx.from.id,
                chatId,
                threadId,
                getTopicName(chatId, threadId),
            );
            (ok ? connected : failed).push(repo);
        }

        const lines = [
            connected.length
                ? `${mentionUser(ctx.from)} has connected ${connected.length} ${connected.length === 1 ? 'repository' : 'repositories'} to this chat: ${formatRepos(connected)}`
                : 'No repositories were connected.',
        ];
        if (skipped.length) {
            lines.push(`Already connected: ${formatRepos(skipped)}`);
        }
        if (failed.length) {
            lines.push(
                `Failed to connect: ${formatRepos(failed)}. Make sure you have admin access to ${failed.length === 1 ? 'it' : 'them'}.`,
            );
        }

        await ctx.api.editMessageText(
            chatId,
            progress.message_id,
            lines.join('\n\n') + invalidNotice,
            htmlOptions,
        );
    });

export default composer;
