import { Document, Schema, model } from 'mongoose';
import { nanoid } from 'nanoid';

export interface IState extends Document {
    user_id: number;
    state: string;
}

const stateSchema = new Schema(
    {
        user_id: {
            type: Number,
            unique: true,
            required: true,
        },
        state: {
            type: String,
            unique: true,
            required: true,
            default: () => nanoid(),
        },
    },
    { timestamps: true },
);

const State = model<IState>('State', stateSchema);
export default State;
