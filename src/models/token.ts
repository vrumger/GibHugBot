import { Document, Schema, model } from 'mongoose';

export interface IToken extends Document {
    user_id: number;
    token_type: string;
    access_token: string;
}

const tokenSchema = new Schema(
    {
        user_id: {
            type: Number,
            unique: true,
            required: true,
        },
        token_type: {
            type: String,
            required: true,
        },
        access_token: {
            type: String,
            unique: true,
            required: true,
        },
    },
    { timestamps: true },
);

const Token = model<IToken>('Token', tokenSchema);
export default Token;
