const { createApp } = require('./src/app');
const server = createApp().listen(process.env.PORT || 3000, '127.0.0.1', () => console.log('Bioinformatics toolkit ready'));
server.requestTimeout = 15000;
server.headersTimeout = 10000;
