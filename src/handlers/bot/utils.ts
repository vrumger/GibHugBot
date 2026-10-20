import escapeHtml from '@youtwitface/escape-html';
import { randomBytes } from 'crypto';
import { Api, Context, NextFunction } from 'grammy';
import type { User } from 'grammy/types';
import env from '../../env';
import {
    GitHubError,
    Repo,
    createWebhook,
    deleteWebhook,
    listAllRepos,
} from '../../github';
import Hook, { IHook } from '../../models/hook';
import Token from '../../models/token';

const REPOS_CACHE_TTL = 60 * 1000;
const REPOS_MAX_PAGES = 10;

export const repoLink = (repo: string) =>
    `<a href="https://github.com/${repo}">${repo}</a>`;

export const mentionUser = (user: User) =>
    user.username
        ? `@${user.username}`
        : `<a href="tg://user?id=${user.id}">${escapeHtml(user.first_name)}</a>`;

// Only forum topic messages belong to a topic; in other chats `message_thread_id` refers to reply threads.
export const getThreadId = (msg?: {
    is_topic_message?: boolean;
    message_thread_id?: number;
}) => (msg?.is_topic_message ? msg.message_thread_id : undefined);

export const NOT_ADMIN_TEXT = 'Only chat admins can do this.';

export const isAdmin = async (ctx: Context) => {
    if (!ctx.chat) {
        return false;
    }

    if (
        ctx.chat.type === 'private' ||
        ctx.chat.type === 'channel' ||
        ctx.senderChat?.id === ctx.chat.id
    ) {
        return true;
    }

    if (!ctx.from) {
        return false;
    }

    try {
        const member = await ctx.getChatMember(ctx.from.id);
        return member.status === 'creator' || member.status === 'administrator';
    } catch (error) {
        console.error(error);
        return false;
    }
};

export const adminOnly = async (ctx: Context, next: NextFunction) => {
    if (await isAdmin(ctx)) {
        return next();
    }

    if (ctx.callbackQuery) {
        await ctx.answerCallbackQuery({
            text: NOT_ADMIN_TEXT,
            show_alert: true,
        });
    } else if (ctx.msg) {
        await ctx.reply(NOT_ADMIN_TEXT, {
            reply_parameters: { message_id: ctx.msg.message_id },
        });
    }
};

const reposCache = new Map<number, { repos: Repo[]; expires: number }>();

export const getCachedRepos = async (userId: number, accessToken: string) => {
    const cached = reposCache.get(userId);
    if (cached && cached.expires > Date.now()) {
        return cached.repos;
    }

    const repos = await listAllRepos(accessToken, REPOS_MAX_PAGES);
    reposCache.set(userId, { repos, expires: Date.now() + REPOS_CACHE_TTL });

    return repos;
};

export const connectRepo = async (
    accessToken: string,
    repo: string,
    userId: number,
    chatId: number,
    threadId?: number,
    topicName?: string,
) => {
    const secret = randomBytes(20).toString('hex');

    let hookId: number;
    try {
        ({ id: hookId } = await createWebhook(accessToken, repo, secret));
    } catch (error) {
        console.error(error);
        return false;
    }

    await new Hook({
        chat_id: chatId,
        thread_id: threadId,
        hook_id: hookId,
        secret,
        repo,
        user_id: userId,
        topic_name: topicName,
    }).save();
    return true;
};

export const disconnectRepo = async (hook: IHook, removerId: number) => {
    let deletedOnGitHub = false;

    if (hook.repo) {
        const userIds = [...new Set([hook.user_id, removerId])].filter(
            (id): id is number => id !== undefined,
        );

        for (const userId of userIds) {
            const token = await Token.findOne({ user_id: userId });
            if (!token) {
                continue;
            }

            try {
                await deleteWebhook(
                    token.access_token,
                    hook.repo,
                    hook.hook_id,
                );
                deletedOnGitHub = true;
                break;
            } catch (error) {
                // GitHub also returns 404 when the token can't see the repo, so keep trying.
                if (error instanceof GitHubError && error.status === 404) {
                    deletedOnGitHub = true;
                } else {
                    console.error(error);
                }
            }
        }
    }

    await hook.deleteOne();
    return deletedOnGitHub;
};

export const downloadText = async (api: Api, fileId: string) => {
    const { file_path } = await api.getFile(fileId);
    if (!file_path) {
        throw new Error('File path is missing');
    }

    const response = await fetch(
        `https://api.telegram.org/file/bot${env.BOT_TOKEN}/${file_path}`,
    );

    if (!response.ok) {
        throw new Error(
            `Failed to download file: ${response.status} ${response.statusText}`,
        );
    }

    return response.text();
};

export const formatList = (items: string[], maxItems: number) => {
    const listed = items.slice(0, maxItems).join(', ');
    const more = items.length - maxItems;
    return more > 0 ? `${listed} and ${more} more` : listed;
};
