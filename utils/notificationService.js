const { Expo } = require('expo-server-sdk');

const expo = new Expo();

async function sendPushNotification({ tokens, title, body, data = {} }) {
  const messages = [];

  for (const token of tokens) {
    if (!Expo.isExpoPushToken(token)) {
      console.log('Invalid Expo push token:', token);
      continue;
    }

    messages.push({
      to: token,
      sound: 'default',
      title,
      body,
      data,
    });
  }

  const chunks = expo.chunkPushNotifications(messages);

  for (const chunk of chunks) {
    try {
      const tickets = await expo.sendPushNotificationsAsync(chunk);
      console.log('PUSH TICKETS:', tickets);
    } catch (error) {
      console.error('PUSH SEND ERROR:', error);
    }
  }
}

module.exports = { sendPushNotification };