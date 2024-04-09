const storage = require('node-persist');
const express = require('express');
const slugify = require('slugify').default;
const uuid = require('uuid');
const { jsonParser } = require('../express-common');
const { checkForNewContent } = require('./content-manager');
const {
    KEY_PREFIX,
    toKey,
    requireAdminMiddleware,
    getUserAvatar,
    getAllUserHandles,
    getPasswordSalt,
    getPasswordHash,
    getUserDirectories,
    ensurePublicDirectoriesExist,
} = require('../users');

const router = express.Router();

router.post('/get', requireAdminMiddleware, jsonParser, async (request, response) => {
    /** @type {import('../users').User[]} */
    const users = await storage.values(x => x.key.startsWith(KEY_PREFIX));

    const viewModels = users
        .sort((x, y) => x.created - y.created)
        .map(user => ({
            handle: user.handle,
            name: user.name,
            avatar: getUserAvatar(user.handle),
            admin: user.admin,
            enabled: user.enabled,
            created: user.created,
            password: !!user.password,
        }));

    return response.json(viewModels);
});

router.post('/disable', requireAdminMiddleware, jsonParser, async (request, response) => {
    if (!request.body.handle) {
        console.log('Disable user failed: Missing required fields');
        return response.status(400).json({ error: 'Missing required fields' });
    }

    if (request.body.handle === request.user.profile.handle) {
        console.log('Disable user failed: Cannot disable yourself');
        return response.status(400).json({ error: 'Cannot disable yourself' });
    }

    /** @type {import('../users').User} */
    const user = await storage.getItem(toKey(request.body.handle));

    if (!user) {
        console.log('Disable user failed: User not found');
        return response.status(404).json({ error: 'User not found' });
    }

    user.enabled = false;
    await storage.setItem(toKey(request.body.handle), user);
    return response.sendStatus(204);
});

router.post('/enable', requireAdminMiddleware, jsonParser, async (request, response) => {
    if (!request.body.handle) {
        console.log('Enable user failed: Missing required fields');
        return response.status(400).json({ error: 'Missing required fields' });
    }

    /** @type {import('../users').User} */
    const user = await storage.getItem(toKey(request.body.handle));

    if (!user) {
        console.log('Enable user failed: User not found');
        return response.status(404).json({ error: 'User not found' });
    }

    user.enabled = true;
    await storage.setItem(toKey(request.body.handle), user);
    return response.sendStatus(204);
});

router.post('/create', requireAdminMiddleware, jsonParser, async (request, response) => {
    if (!request.body.handle || !request.body.name) {
        console.log('Create user failed: Missing required fields');
        return response.status(400).json({ error: 'Missing required fields' });
    }

    const handles = await getAllUserHandles();
    const handle = slugify(request.body.handle, { lower: true, trim: true });

    if (handles.some(x => x === handle)) {
        console.log('Create user failed: User with that handle already exists');
        return response.status(409).json({ error: 'User already exists' });
    }

    const salt = getPasswordSalt();
    const password = request.body.password ? getPasswordHash(request.body.password, salt) : '';

    const newUser = {
        uuid: uuid.v4(),
        handle: handle,
        name: request.body.name || 'Anonymous',
        created: Date.now(),
        password: password,
        salt: salt,
        admin: !!request.body.admin,
        enabled: true,
    };

    await storage.setItem(toKey(handle), newUser);

    // Create user directories
    console.log('Creating data directories for', newUser.handle);
    await ensurePublicDirectoriesExist();
    const directories = getUserDirectories(newUser.handle);
    await checkForNewContent([directories]);
    return response.json({ handle: newUser.handle });
});

module.exports = {
    router,
};
