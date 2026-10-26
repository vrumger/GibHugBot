import escapeHtml from '@youtwitface/escape-html';
import { Request, Response } from 'express';
import { GrammyError } from 'grammy';
import bot from '../../bot';
import { IHook } from '../../models/hook';
import { autolink } from '../../autolink';
import {
    captionLinkedImages,
    escapeHashtags,
    linkReferences,
    removeMedia,
} from '../../markdown';

// Telegram's limit is 32768 characters for the whole rich message.
const MAX_RICH_BODY_LENGTH = 30000;
// Telegram's limit for regular messages, counted after entity parsing.
const MAX_MESSAGE_LENGTH = 4096;
const MAX_COMMIT_MESSAGE_LENGTH = 1024;

const sendMessage = (hook: IHook, message: string) =>
    bot.api.sendMessage(hook.chat_id, message, {
        message_thread_id: hook.thread_id,
        parse_mode: 'HTML',
        link_preview_options: { is_disabled: true },
    });

// GitHub bodies are arbitrary Markdown that Telegram may reject. Most often
// it's media Telegram can't fetch, so retry with media turned into links before
// falling back to a plain HTML message.
const sendRichMessage = async (
    hook: IHook,
    header: string,
    body: string,
    repo: string,
    fallbackHtml: string,
) => {
    const bodies = [
        ...new Set([captionLinkedImages(body), removeMedia(body)]),
    ].map(body => escapeHashtags(linkReferences(body, repo)));

    for (const [index, markdownBody] of bodies.entries()) {
        try {
            await bot.api.sendRichMessage(
                hook.chat_id,
                // GitHub references are already linked, and Telegram would
                // otherwise turn the rest of them into Telegram searches.
                {
                    markdown: `${header}${markdownBody}`,
                    skip_entity_detection: true,
                },
                { message_thread_id: hook.thread_id },
            );
            return;
        } catch (err) {
            if (!(err instanceof GrammyError) || err.error_code !== 400) {
                throw err;
            }

            console.error(
                `Failed to send rich message, ${
                    index < bodies.length - 1
                        ? 'retrying without media'
                        : 'falling back to HTML'
                }: ${err.description}`,
            );
        }
    }

    await sendMessage(hook, fallbackHtml);
};

const escapeMarkdown = (text: string) =>
    text.replace(/[!-/:-@[-`{-~]/g, '\\$&');

const truncate = (text: string, length: number) => {
    const chars = Array.from(text);
    return chars.length > length ? `${chars.slice(0, length).join('')}…` : text;
};

// Uses UTF-16 length, which is never less than the number of characters
// Telegram counts.
const visibleLength = (html: string) =>
    html.replace(/<[^>]*>/g, '').replace(/&(?:#\d+|#x[\da-f]+|\w+);/gi, '_')
        .length;

const truncateText = (text: string, length: number) => {
    if (text.length <= length) {
        return text;
    }

    if (length < 1) {
        return '';
    }

    let end = length - 1;
    if (/[\uD800-\uDBFF]/.test(text.charAt(end - 1))) {
        end--;
    }

    return `${text.slice(0, end)}…`;
};

const formatHtmlMessage = (
    header: string,
    title: string,
    url: string,
    user: { login: string; html_url: string },
    body: string | null | undefined,
    repo: string,
    emptyBody = '',
) => {
    const head = `<b>${header} <a href="${url}">${escapeHtml(
        title,
    )}</a></b>\nby <a href="${user.html_url}">@${escapeHtml(
        user.login,
    )}</a>\n\n`;

    if (!body) {
        return `${head}${emptyBody}`;
    }

    return `${head}${autolink(
        truncateText(body, MAX_MESSAGE_LENGTH - visibleLength(head)),
        repo,
        escapeHtml,
    )}`;
};

// Keeps the subject on the commit line and moves the rest of the message into
// a collapsed quote, so long messages don't run into the next commit.
const formatCommit = (commit: any, repo: string) => {
    const [subject, ...rest] = truncateText(
        commit.message.replace(/\r\n?/g, '\n').trim(),
        MAX_COMMIT_MESSAGE_LENGTH,
    ).split('\n');
    const description = rest.join('\n').trim();

    return `<a href="${commit.url}">${commit.id.slice(0, 8)}</a>: ${autolink(
        subject,
        repo,
        escapeHtml,
    )} by ${escapeHtml(commit.author.name)}${
        description
            ? `\n<blockquote expandable>${autolink(
                  description,
                  repo,
                  escapeHtml,
              )}</blockquote>`
            : ''
    }`;
};

const formatPushMessage = (body: any) => {
    const commits: any[] = body.commits;
    const header = `🔨 <b><a href="${body.compare}">${commits.length} new commit${
        commits.length === 1 ? '' : 's'
    }</a> to ${escapeHtml(body.repository.name)}:${escapeHtml(
        body.ref.replace(/^refs\/[^/]+\//, ''),
    )}:</b>\n\n`;
    const lines = commits.map(commit =>
        formatCommit(commit, body.repository.full_name),
    );

    const message = `${header}${lines.join('\n')}`;
    if (visibleLength(message) <= MAX_MESSAGE_LENGTH) {
        return message;
    }

    // Leave room for the "…and N more commits" line.
    const limit = MAX_MESSAGE_LENGTH - 50;
    let length = visibleLength(header);
    let included = 0;

    for (const line of lines) {
        const lineLength = visibleLength(line) + (included > 0 ? 1 : 0);
        if (length + lineLength > limit) {
            break;
        }

        length += lineLength;
        included++;
    }

    const remaining = commits.length - included;
    return `${header}${lines.slice(0, included).join('\n')}${
        included > 0 ? '\n' : ''
    }<i>…and ${remaining} more commit${remaining === 1 ? '' : 's'}</i>`;
};

// Telegram doesn't support `<url>` link destinations, so encode the characters
// that would otherwise end the destination early.
const escapeUrl = (url: string) =>
    url.replace(
        /[\s()<>]/g,
        char =>
            `%${char.charCodeAt(0).toString(16).toUpperCase().padStart(2, '0')}`,
    );

const formatRichHeader = (
    header: string,
    title: string,
    url: string,
    user: { login: string; html_url: string },
) =>
    `**${header} [${escapeMarkdown(title)}](${escapeUrl(
        url,
    )})**\\\nby [@${escapeMarkdown(user.login)}](${escapeUrl(
        user.html_url,
    )})\n\n`;

export const handleWebhook = async (
    req: Request<{ repo: string }>,
    res: Response,
    event: string,
    body: any,
    hook: IHook,
) => {
    switch (event) {
        case 'push': {
            if (body.commits.length > 0) {
                await sendMessage(hook, formatPushMessage(body));
            }

            res.status(200).end('ok');
            break;
        }

        case 'issues': {
            if (body.action === 'opened') {
                const title = `${body.repository.name}#${body.issue.number} ${body.issue.title}`;
                const header = formatRichHeader(
                    '🐛 New issue',
                    title,
                    body.issue.html_url,
                    body.issue.user,
                );
                const markdownBody = truncate(
                    body.issue.body || '_No description provided._',
                    MAX_RICH_BODY_LENGTH,
                );
                const html = formatHtmlMessage(
                    '🐛 New issue',
                    title,
                    body.issue.html_url,
                    body.issue.user,
                    body.issue.body,
                    body.repository.full_name,
                    '<i>No description provided.</i>',
                );

                await sendRichMessage(
                    hook,
                    header,
                    markdownBody,
                    body.repository.full_name,
                    html,
                );

                res.status(200).end('ok');
            } else {
                res.status(200).end(`Unhandled issue action: ${body.action}`);
            }

            break;
        }

        case 'issue_comment': {
            if (body.action === 'created') {
                const title = `${body.repository.name}#${body.issue.number} ${body.issue.title}`;
                const header = formatRichHeader(
                    '💬 New comment on',
                    title,
                    body.comment.html_url,
                    body.comment.user,
                );
                const markdownBody = truncate(
                    body.comment.body ?? '',
                    MAX_RICH_BODY_LENGTH,
                );
                const html = formatHtmlMessage(
                    '💬 New comment on',
                    title,
                    body.comment.html_url,
                    body.comment.user,
                    body.comment.body,
                    body.repository.full_name,
                );

                await sendRichMessage(
                    hook,
                    header,
                    markdownBody,
                    body.repository.full_name,
                    html,
                );

                res.status(200).end('ok');
            } else {
                res.status(200).end(
                    `Unhandled issue comment action: ${body.action}`,
                );
            }

            break;
        }

        case 'pull_request': {
            if (body.action === 'opened') {
                const title = `${body.repository.name}#${body.pull_request.number} ${body.pull_request.title}`;
                const header = formatRichHeader(
                    '🔌 New pull request',
                    title,
                    body.pull_request.html_url,
                    body.pull_request.user,
                );
                const markdownBody = truncate(
                    body.pull_request.body || '_No description provided._',
                    MAX_RICH_BODY_LENGTH,
                );
                const html = formatHtmlMessage(
                    '🔌 New pull request',
                    title,
                    body.pull_request.html_url,
                    body.pull_request.user,
                    body.pull_request.body,
                    body.repository.full_name,
                    '<i>No description provided.</i>',
                );

                await sendRichMessage(
                    hook,
                    header,
                    markdownBody,
                    body.repository.full_name,
                    html,
                );
                res.status(200).end('ok');
            } else {
                res.status(200).end(
                    `Unhandled pull request action: ${body.action}`,
                );
            }

            break;
        }

        default:
            res.status(200).end(`Unhandled event: ${event}`);
            break;
    }
};
