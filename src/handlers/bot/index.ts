import { Composer } from 'grammy';

import connect from './connect';
import integrations from './integrations';

const composer = new Composer();

composer.use(connect);
composer.use(integrations);

export default composer;
