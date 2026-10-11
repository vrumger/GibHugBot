import env from './env';

const API_URL = 'https://api.github.com';
const MAX_PER_PAGE = 100;

export interface Repo {
    full_name: string;
    description: string | null;
    owner: { avatar_url: string };
}

interface Webhook {
    id: number;
}

const base64 = (data: string) =>
    Buffer.from(data).toString('base64').replace(/=+$/, '');

const request = async <T>(
    accessToken: string,
    path: string,
    init: RequestInit = {},
): Promise<T> => {
    const response = await fetch(`${API_URL}${path}`, {
        ...init,
        headers: {
            Accept: 'application/vnd.github.v3+json',
            Authorization: `token ${accessToken}`,
        },
    });

    if (!response.ok) {
        throw new Error(
            `GitHub request to ${path} failed: ${response.status} ${response.statusText}`,
        );
    }

    return response.json() as Promise<T>;
};

export const listRepos = (accessToken: string, perPage: number, page = 1) =>
    request<Repo[]>(
        accessToken,
        `/user/repos?affiliation=owner,organization_member&sort=updated&per_page=${perPage}&page=${page}`,
    );

export const listAllRepos = async (accessToken: string, maxPages: number) => {
    const repos: Repo[] = [];

    for (let page = 1; page <= maxPages; page++) {
        const pageRepos = await listRepos(accessToken, MAX_PER_PAGE, page);
        repos.push(...pageRepos);

        if (pageRepos.length < MAX_PER_PAGE) {
            break;
        }
    }

    return repos;
};

export const createWebhook = (
    accessToken: string,
    repo: string,
    secret: string,
) =>
    request<Webhook>(accessToken, `/repos/${repo}/hooks`, {
        method: 'POST',
        body: JSON.stringify({
            name: 'web',
            events: ['push', 'issues', 'issue_comment', 'pull_request'],
            config: {
                url: `${env.GITHUB_WEBHOOK_DOMAIN}/github/webhook/${base64(repo)}`,
                content_type: 'json',
                secret,
            },
        }),
    });
