import { Document, Schema, model } from 'mongoose';

export interface IHook extends Document {
    chat_id: number;
    hook_id: number;
    secret: string;
}

const hookSchema = new Schema(
    {
        chat_id: {
            type: Number,
            required: true,
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
    },
    { timestamps: true },
);

const Hook = model<IHook>('Hook', hookSchema);
export default Hook;
