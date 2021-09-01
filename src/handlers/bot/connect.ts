import { Composer, Context } from 'grammy';
import { Chat } from 'grammy/out/platform';
import env from '../../env';
import State from '../../models/state';

const composer = new Composer();

composer
    .filter(
        (
            ctx,
        ): ctx is Context & {
            chat: Chat.PrivateChat;
            from: object;
        } => ctx.chat?.type === 'private',
    )
    .command('start', async ctx => {
        let state = await State.findOne({
            user_id: ctx.from.id,
        });

        if (!state) {
            state = await new State({
                user_id: ctx.from.id,
            }).save();
        }

        await ctx.reply(
            `Open <a href="https://github.com/login/oauth/authorize?client_id=${env.GITHUB_CLIENT_ID}&scope=admin:repo_hook,repo&state=${state.state}">this link</a> to connect your GitHub account.`,
            {
                parse_mode: 'HTML',
                disable_web_page_preview: true,
            },
        );
    });

export default composer;
