import { cleanEnv, port, str, url } from 'envalid';
import dotenv from 'dotenv';

dotenv.config();

export default cleanEnv(process.env, {
    PORT: port({ default: 8000 }),
    BOT_TOKEN: str(),
    MONGO_URI: str(),

    GITHUB_CLIENT_ID: str(),
    GITHUB_CLIENT_SECRET: str(),
    GITHUB_WEBHOOK_DOMAIN: url(),
});
