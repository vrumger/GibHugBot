import type { Transformer } from 'grammy';
import Hook from './models/hook';

export const migrateHooks = (oldChatId: number, newChatId: number) =>
    Hook.updateMany({ chat_id: oldChatId }, { $set: { chat_id: newChatId } });

export const migrateChat: Transformer = async (
    prev,
    method,
    payload,
    signal,
) => {
    const response = await prev(method, payload, signal);
    const newChatId = response.ok
        ? undefined
        : response.parameters?.migrate_to_chat_id;

    if (
        newChatId === undefined ||
        !('chat_id' in payload) ||
        typeof payload.chat_id !== 'number' ||
        payload.chat_id === newChatId
    ) {
        return response;
    }

    await migrateHooks(payload.chat_id, newChatId);

    return prev(method, { ...payload, chat_id: newChatId }, signal);
};
