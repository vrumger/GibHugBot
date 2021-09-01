import { Router, raw } from 'express';
import State from '../../models/state';
import fetch from 'node-fetch';
import env from '../../env';
import Token from '../../models/token';
import bot from '../../bot';
import { createHmac, timingSafeEqual } from 'crypto';
import Hook from '../../models/hook';
import { handleWebhook } from './webhook';

const base64Decode = (data: string) =>
    Buffer.from(
        data.padEnd(Math.ceil(data.length / 4) * 4),
        'base64',
    ).toString();

const router = Router();

router.get('/github/callback', async (req, res) => {
    if (
        typeof req.query.code !== 'string' ||
        typeof req.query.state !== 'string'
    ) {
        return res.status(400).end('Missing code or state');
    }

    const state = await State.findOne({
        state: req.query.state,
    });

    if (!state) {
        return res.status(400).end('Invalid state');
    }

    const request = await fetch('https://github.com/login/oauth/access_token', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json',
        },
        body: JSON.stringify({
            client_id: env.GITHUB_CLIENT_ID,
            client_secret: env.GITHUB_CLIENT_SECRET,
            code: req.query.code,
        }),
    });
    const response = await request.json();

    if (response.error) {
        return res.status(400).end(response.error_description);
    }

    const scopes = response.scope.split(',');
    if (!scopes.includes('admin:repo_hook') || !scopes.includes('repo')) {
        return res.status(401).end('Missing scope');
    }

    const token = await Token.findOneAndUpdate(
        { user_id: state.user_id },
        {
            token_type: response.token_type,
            access_token: response.access_token,
        },
        { upsert: true, new: true },
    );

    await state.delete();

    const userRequest = await fetch('https://api.github.com/user', {
        headers: {
            Authorization: `token ${token.access_token}`,
        },
    });
    const user = await userRequest.json();

    await bot.api.sendMessage(token.user_id, `You logged in as ${user.login}!`);
    res.redirect(`https://t.me/${bot.botInfo.username}`);
});

router.post(
    '/github/webhook/:repo',
    raw({ type: 'application/json' }),
    async (req, res) => {
        const githubHookId = req.header('X-GitHub-Hook-ID');
        if (!githubHookId) {
            return res.status(400).end('Invalid hook ID');
        }

        const hook = await Hook.findOne({
            hookId: githubHookId,
        });

        if (!hook) {
            return res.status(404).end('Hook not found');
        }

        const signature = req.header('X-Hub-Signature-256') || '';
        const hash =
            'sha256=' +
            createHmac('sha256', hook.secret).update(req.body).digest('hex');

        if (!timingSafeEqual(Buffer.from(hash), Buffer.from(signature))) {
            return res.status(400).end('Invalid signature');
        }

        const event = req.header('X-GitHub-Event');
        if (!event) {
            return res.status(400).end('Invalid event');
        }

        const body = JSON.parse(req.body);
        await handleWebhook(req, res, event, body, hook);
    },
);

export default router;
