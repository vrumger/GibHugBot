import dotenv from 'dotenv';
import mongoose from 'mongoose';
import { run } from '@grammyjs/runner';
import env from './env';
import server from './server';
import bot from './bot';

dotenv.config();

server.listen(env.PORT, () => {
    console.log('Server listening on port', env.PORT);

    mongoose.connect(env.MONGO_URI).then(() => {
        console.log('Connected to MongoDB');

        run(bot);
        console.log('Bot started');
    });
});
