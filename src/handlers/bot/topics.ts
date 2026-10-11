import { Composer } from 'grammy';
import Hook from '../../models/hook';
import { getThreadId } from './utils';

// The Bot API can't look up topics, so names are learned from the messages the bot sees.
// They're kept in memory and only stored on the hooks connected to the topic.
const topicNames = new Map<string, string>();

const topicKey = (chatId: number, threadId: number) => `${chatId}:${threadId}`;

export const getTopicName = (chatId: number, threadId?: number) =>
    threadId === undefined
        ? undefined
        : topicNames.get(topicKey(chatId, threadId));

const composer = new Composer();

composer.use(async (ctx, next) => {
    const msg = ctx.msg;
    const threadId = getThreadId(msg);

    if (msg && threadId) {
        const key = topicKey(msg.chat.id, threadId);
        const filter = { chat_id: msg.chat.id, thread_id: threadId };

        try {
            const name =
                msg.forum_topic_created?.name ?? msg.forum_topic_edited?.name;

            if (name) {
                if (topicNames.get(key) !== name) {
                    topicNames.set(key, name);
                    await Hook.updateMany(filter, { topic_name: name });
                }
            } else if (!topicNames.has(key)) {
                // Topic messages that aren't explicit replies point to the topic's creation message.
                // Its name may be outdated after a rename, so a stored name takes precedence.
                const createdName =
                    msg.reply_to_message?.forum_topic_created?.name;

                if (createdName) {
                    const named = await Hook.findOne({
                        ...filter,
                        topic_name: { $exists: true },
                    });
                    const topicName = named?.topic_name ?? createdName;

                    topicNames.set(key, topicName);
                    await Hook.updateMany(
                        { ...filter, topic_name: { $exists: false } },
                        { topic_name: topicName },
                    );
                }
            }
        } catch (error) {
            console.error(error);
        }
    }

    await next();
});

export default composer;
