import express from 'express';
import serverHandlers from './handlers/server';

const server = express();

server.use(serverHandlers);

export default server;
