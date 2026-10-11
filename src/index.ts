import mongoose from 'mongoose';
import { run } from '@grammyjs/runner';
import env from './env';
import server from './server';
import bot, { setCommands } from './bot';

server.listen(env.PORT, () => {
    console.log('Server listening on port', env.PORT);

    mongoose.connect(env.MONGO_URI).then(() => {
        console.log('Connected to MongoDB');

        setCommands().catch(error => {
            console.error('Failed to set bot commands:');
            console.error(error);
        });

        run(bot);
        console.log('Bot started');
    });
});
