import { Document, Schema, model } from 'mongoose';

export interface IHook extends Document {
    chat_id: number;
    thread_id?: number;
    hook_id: number;
    secret: string;
    // Missing on hooks created before these fields were stored.
    repo?: string;
    user_id?: number;
    topic_name?: string;
    createdAt: Date;
}

const hookSchema = new Schema(
    {
        chat_id: {
            type: Number,
            required: true,
        },
        thread_id: {
            type: Number,
        },
        hook_id: {
            type: Number,
            unique: true,
            required: true,
        },
        secret: {
            type: String,
            required: true,
        },
        repo: {
            type: String,
        },
        user_id: {
            type: Number,
        },
        topic_name: {
            type: String,
        },
    },
    { timestamps: true },
);

const Hook = model<IHook>('Hook', hookSchema);
export default Hook;
