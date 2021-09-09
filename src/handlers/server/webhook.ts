import escapeHtml from '@youtwitface/escape-html';
import { Request, Response } from 'express';
import bot from '../../bot';
import { IHook } from '../../models/hook';

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
                const message = `🔨 <b><a href="${body.compare}">${
                    body.commits.length
                } new commit${body.commits.length === 1 ? '' : 's'}</a> to ${
                    body.repository.name
                }:${body.ref.split('/')[2]}:</b>\n\n${body.commits
                    .map(
                        (commit: any) =>
                            `<a href="${commit.url}">${commit.id.slice(
                                0,
                                8,
                            )}</a>: ${escapeHtml(
                                commit.message,
                            )} by ${escapeHtml(commit.author.name)}`,
                    )
                    .join('\n')}`;

                await bot.api.sendMessage(hook.chat_id, message, {
                    parse_mode: 'HTML',
                    disable_web_page_preview: true,
                });
            }

            res.status(200).end('ok');
            break;
        }

        case 'issues': {
            if (body.action === 'opened') {
                const message = `<b>🐛 New issue <a href="${
                    body.issue.html_url
                }">${body.repository.name}#${body.issue.number} ${escapeHtml(
                    body.issue.title,
                )}</a></b>\nby <a href="${body.issue.user.html_url}">@${
                    body.issue.user.login
                }</a>\n\n${
                    body.issue.body
                        ? escapeHtml(body.issue.body)
                        : '<i>No description provided.</i>'
                }`;

                await bot.api.sendMessage(hook.chat_id, message, {
                    parse_mode: 'HTML',
                    disable_web_page_preview: true,
                });

                res.status(200).end('ok');
            } else {
                res.status(200).end(`Unhandled issue action: ${body.action}`);
            }

            break;
        }

        case 'issue_comment': {
            if (body.action === 'created') {
                const message = `<b>💬 New comment on <a href="${
                    body.comment.html_url
                }">${body.repository.name}#${body.issue.number} ${escapeHtml(
                    body.issue.title,
                )}</a></b>\nby <a href="${body.comment.user.html_url}">@${
                    body.comment.user.login
                }</a>\n\n${escapeHtml(body.comment.body ?? '')}`;

                await bot.api.sendMessage(hook.chat_id, message, {
                    parse_mode: 'HTML',
                    disable_web_page_preview: true,
                });

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
                // 🔌 New pull request test#2 Update test (https://github.com/AndrewLaneX/test/pull/2)
                const message = `<b>🔌 New pull request <a href="${
                    body.pull_request.html_url
                }">${body.repository.name}#${
                    body.pull_request.number
                } ${escapeHtml(body.pull_request.title)}</a></b>\nby <a href="${
                    body.pull_request.user.html_url
                }">@${body.pull_request.user.login}</a>\n\n${
                    body.pull_request.body
                        ? escapeHtml(body.pull_request.body)
                        : '<i>No description provided.</i>'
                }`;

                await bot.api.sendMessage(hook.chat_id, message, {
                    parse_mode: 'HTML',
                    disable_web_page_preview: true,
                });
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
