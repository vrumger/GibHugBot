import { Composer } from 'grammy';
import { migrateHooks } from '../../migration';

const composer = new Composer();

composer.on(
    ['message:migrate_to_chat_id', 'message:migrate_from_chat_id'],
    async ctx => {
        const oldChatId = ctx.msg.migrate_from_chat_id ?? ctx.chat.id;
        const newChatId = ctx.msg.migrate_to_chat_id ?? ctx.chat.id;

        await migrateHooks(oldChatId, newChatId);
    },
);

export default composer;
