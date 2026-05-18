const { Expo } = require('expo-server-sdk');

const expo = new Expo();

async function sendPushNotification({ tokens = [], title, body, data = {} }) {
  try {
    const messages = [];

    if (!Array.isArray(tokens) || tokens.length === 0) {
      console.log('No push tokens found');
      return;
    }

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
        priority: 'high',
        channelId: 'default',
      });
    }

    if (messages.length === 0) {
      console.log('No valid push messages to send');
      return;
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
  } catch (err) {
    console.error('SEND PUSH NOTIFICATION FUNCTION ERROR:', err);
  }
}

module.exports = { sendPushNotification };