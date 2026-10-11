import { randomBytes } from 'crypto';
import type { User } from 'grammy/types';
import escapeHtml from '@youtwitface/escape-html';
import { Repo, createWebhook, listAllRepos } from '../../github';
import Hook from '../../models/hook';

const REPOS_CACHE_TTL = 60 * 1000;
const REPOS_MAX_PAGES = 10;

export const repoLink = (repo: string) =>
    `<a href="https://github.com/${repo}">${repo}</a>`;

export const mentionUser = (user: User) =>
    user.username
        ? `@${user.username}`
        : `<a href="tg://user?id=${user.id}">${escapeHtml(user.first_name)}</a>`;

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
    chatId: number,
) => {
    const secret = randomBytes(20).toString('hex');

    let hookId: number;
    try {
        ({ id: hookId } = await createWebhook(accessToken, repo, secret));
    } catch (error) {
        console.error(error);
        return false;
    }

    await new Hook({ chat_id: chatId, hook_id: hookId, secret }).save();
    return true;
};
