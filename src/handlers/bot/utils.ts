import { randomBytes } from 'crypto';
import type { User } from 'grammy/types';
import escapeHtml from '@youtwitface/escape-html';
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
    }).save();
    return true;
};

/**
 * Removes the hook from the chat and tries to delete its GitHub webhook, first
 * with the token of the user who connected it, then with the remover's token.
 * Returns whether the webhook is gone from GitHub.
 */
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
