const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const config = getDefaultConfig(__dirname);

// Limite le watcher au seul dossier mobile-client (évite le conflit avec mobile/)
config.watchFolders = [__dirname];

module.exports = config;
