var express = require('express'),
    router = express.Router(),
    q = require('q'),
    _ = require('lodash'),
    common = require('@screeps/common'),
    db = common.storage.db,
    env = common.storage.env,
    jsonResponse = require('q-json-response'),
    passport = require('passport'),
    TokenStrategy = require('passport-token').Strategy,
    session = require('express-session'),
    authlib = require('../../authlib'),
    steamApi = require('steam-webapi'),
    steam;

var sessionSecret = 'gwoif31m947j925hxcy6cj4l62he';
var steamAppId = 464350;
var useNativeAuth = false;

function steamFindOrCreateUser(request, steamId) {

    var user;

    return (request.user || db.users.findOne({'steam.id': steamId})).then((data) => {

        var steamData = {
            id: steamId
        };

        if (data) {
            user = data;

            steamData = _.extend(user.steam, steamData);

            var $set = {
                steam: steamData
            };

            user.steam = steamData;
            return db.users.update({
                _id: user._id
            }, {$set});
        } else {

            user = {
                steam: steamData,
                cpu: 100,
                cpuAvailable: 0,
                registeredDate: new Date(),
                credits: 0,
                gcl: 0
            };

            return db.users.insert(user).then(result => {
                user = result;

                return db['users.code'].insert({
                    user: user._id,
                    modules: {
                        main: ''
                    },
                    branch: 'default',
                    activeWorld: true,
                    activeSim: true
                })
            }).then(() => env.set('scrUserMemory:' + user._id, JSON.stringify({})))
        }
    }).then(() => {
        user.username = steamId;
        console.log(user);
        return user
    });
}

function setup(app, _useNativeAuth) {

    useNativeAuth = _useNativeAuth;

    if (!useNativeAuth) {
        steam = new steamApi();
    }

    passport.use(new TokenStrategy(function(email, token, done) {

        authlib.checkToken(token).then((user) => {
            done(null, user);
        }).catch((error) => {
            error === false
                ? done(null, false)
                : done(error)
        });
    }));

    app.use(passport.initialize());
}

function tokenAuth(request, response, next) {
    passport.authenticate('token', {
        session: false
    }, function(err, user) {
        if (err) {
            return next(err);
        }
        if (!user) {
            response.status(401).send({error: 'unauthorized'});
            return;
        }
        request.user = user;
        authlib.genToken(user._id).then((token) => {
            response.set('X-Token', token);
            next();
        });
    })(request, response, next);
}

router.get('/me', tokenAuth, jsonResponse((request, response) => {

    var result = {
        _id: request.user._id,
        email: request.user.email,
        emailDirty: request.user.emailDirty,
        username: request.user.username,
        cpu: request.user.cpu,
        badge: request.user.badge,
        password: !!request.user.password,
        lastRespawnDate: request.user.lastRespawnDate,
        notifyPrefs: request.user.notifyPrefs,
        gcl: request.user.gcl,
        lastChargeTime: request.user.lastChargeTime,
        blocked: request.user.blocked,
        customBadge: request.user.customBadge,
        power: request.user.power,
        money: request.user.money || 0,
        steam: _.pick(request.user.steam, ['id', 'displayName', 'ownership'])
    };

    return result;
}));

router.post('/steam-ticket', jsonResponse(request => {

    steamId = request.body.steamid
  return   steamFindOrCreateUser(request, steamId).then(user => {
        console.log(`Sign in: ${user.username} (${user._id}), IP=${request.ip}, steamid=${steamId}`);
        return authlib.genToken(user._id);
    }).then(token => {
      return {
        token,
        steamid : steamId
      }
    });

}));

exports.router = router;
exports.tokenAuth = tokenAuth;
exports.setup = setup;
